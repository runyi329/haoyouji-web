import { router, protectedProcedure } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as dbPosterFavorites from "./db-poster-favorites";
import { uploadImageToCOS } from "./cos-upload";
import { composePosterWithQR } from "./poster-compose";

// 海报模板配置（硬编码，后续可以改为数据库管理）
// templateUrl 会在第一次上传后更新
const POSTER_TEMPLATES: Record<string, {
  title: string;
  description: string;
  category: string;
  series: string;
  templateUrl: string;  // COS上的模板URL
  qrConfig: { x: number; y: number; size: number };
}> = {
  'invite-ledger': {
    title: '共享账本邀请海报',
    description: '脉动共享账本试用版正式上线',
    category: 'invite',
    series: '邀请好友',
    templateUrl: 'https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/posters/templates/invite-ledger-template-v2.jpg',
    qrConfig: {
      x: 557,   // 品红色占位符自动检测，此为降级坐标
      y: 1135,
      size: 121,
    },
  },
};

/**
 * 海报收藏 tRPC 路由
 */
export const posterFavoritesRouter = router({
  // 获取用户的所有海报收藏
  getMyPosters: protectedProcedure
    .input(z.object({
      category: z.enum(['marketing', 'product_tutorial', 'target_audience', 'brand', 'event', 'other']).optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      const posters = await dbPosterFavorites.getUserPosterFavorites(userId, input?.category);
      return { posters };
    }),

  // 获取单个海报详情
  getPosterById: protectedProcedure
    .input(z.object({
      id: z.number(),
    }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      const poster = await dbPosterFavorites.getPosterFavoriteById(input.id, userId);
      
      if (!poster) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: '海报不存在',
        });
      }
      
      return { poster };
    }),

  // 创建海报收藏（上传图片到COS）
  createPoster: protectedProcedure
    .input(z.object({
      title: z.string().min(1).max(255),
      description: z.string().optional(),
      category: z.enum(['marketing', 'product_tutorial', 'target_audience', 'brand', 'event', 'other']),
      seriesName: z.string().optional(),
      thumbnailData: z.string(), // base64图片数据
      fullData: z.string(),       // base64图片数据
      tags: z.array(z.string()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;

      try {
        // 上传缩略图到COS
        console.log('[海报收藏] 开始上传缩略图...');
        const thumbnailUrl = await uploadImageToCOS(input.thumbnailData, 'posters');
        
        // 上传原图到COS
        console.log('[海报收藏] 开始上传原图...');
        const fullUrl = await uploadImageToCOS(input.fullData, 'posters');

        // 保存到数据库
        const posterId = await dbPosterFavorites.createPosterFavorite({
          userId,
          title: input.title,
          description: input.description,
          category: input.category,
          seriesName: input.seriesName,
          thumbnailUrl,
          fullUrl,
          tags: input.tags,
        });

        console.log(`[海报收藏] 创建成功，ID: ${posterId}`);
        
        return {
          success: true,
          posterId,
          thumbnailUrl,
          fullUrl,
        };
      } catch (error) {
        console.error('[海报收藏] 创建失败:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `创建失败: ${error instanceof Error ? error.message : '未知错误'}`,
        });
      }
    }),

  // 上传海报模板到COS（管理员功能）
  uploadTemplate: protectedProcedure
    .input(z.object({
      imageData: z.string(), // base64图片数据
      filename: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        console.log('[海报模板] 开始上传模板...');
        const url = await uploadImageToCOS(
          input.imageData, 
          'posters',
          input.filename ? `posters/templates/${input.filename}` : undefined
        );
        console.log('[海报模板] 上传成功:', url);
        return { success: true, url };
      } catch (error) {
        console.error('[海报模板] 上传失败:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `上传失败: ${error instanceof Error ? error.message : '未知错误'}`,
        });
      }
    }),

  // 获取用户的合成海报（带二维码）
  // 前端调用此API获取已合成好的海报URL
  getComposedPoster: protectedProcedure
    .input(z.object({
      templateId: z.string(),
      templateUrl: z.string(), // 模板图片URL
      qrX: z.number(),
      qrY: z.number(),
      qrSize: z.number(),
    }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      const username = ctx.user!.username;
      
      try {
        // 获取用户邀请码
        const { getDb } = await import('./db');
        const { users } = await import('../drizzle/schema');
        const { eq } = await import('drizzle-orm');
        
        const db = await getDb();
        const [user] = await db
          .select({ inviteCode: users.inviteCode, name: users.name })
          .from(users)
          .where(eq(users.id, userId));
        
        if (!user?.inviteCode) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: '用户没有邀请码',
          });
        }
        
        // 使用昵称（name）优先，没有则用用户名（username）
        const displayName = user.name || username;
        
        // 合成海报（传入用户名用于显示邀请人）
        const composedUrl = await composePosterWithQR(
          input.templateUrl,
          user.inviteCode,
          { x: input.qrX, y: input.qrY, size: input.qrSize },
          displayName
        );
        
        return {
          success: true,
          composedUrl,
          inviteCode: user.inviteCode,
        };
      } catch (error) {
        console.error('[合成海报] 失败:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `合成失败: ${error instanceof Error ? error.message : '未知错误'}`,
        });
      }
    }),

  // 更新海报信息
  updatePoster: protectedProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().min(1).max(255).optional(),
      description: z.string().optional(),
      category: z.enum(['marketing', 'product_tutorial', 'target_audience', 'brand', 'event', 'other']).optional(),
      seriesName: z.string().optional(),
      tags: z.array(z.string()).optional(),
      sortOrder: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      const { id, ...updateData } = input;

      const success = await dbPosterFavorites.updatePosterFavorite(id, userId, updateData);

      if (!success) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: '海报不存在或无权限修改',
        });
      }

      return { success: true };
    }),

  // 删除海报
  deletePoster: protectedProcedure
    .input(z.object({
      id: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;

      const success = await dbPosterFavorites.deletePosterFavorite(input.id, userId);

      if (!success) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: '海报不存在或无权限删除',
        });
      }

      return { success: true };
    }),

  // 获取分类统计
  getCategoryStats: protectedProcedure
    .query(async ({ ctx }) => {
      const userId = ctx.user!.id;
      const stats = await dbPosterFavorites.getPosterCategoryStats(userId);
      return { stats };
    }),
});
