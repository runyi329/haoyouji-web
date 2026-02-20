import { router, protectedProcedure } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as dbPosterFavorites from "./db-poster-favorites";
import { uploadImageToCOS } from "./cos-upload";

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

  // 创建海报收藏
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
