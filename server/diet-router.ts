/**
 * 减肥账本路由
 * 支持多学员：教练可为任意学员设置档案，学员看自己的数据
 */
import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import * as dbDiet from "./db-diet";
import { invokeLLM } from "./_core/llm";
import { uploadImageToCOS } from "./cos-upload";
import * as dbLedger from "./db-ledger";

export const dietRouter = router({

  // ========== 学员档案（教练管理） ==========

  // 获取当前用户自己的减肥档案
  getMyConfig: protectedProcedure
    .input(z.object({ ledgerId: z.number() }))
    .query(async ({ ctx, input }) => {
      return await dbDiet.getMemberConfig(input.ledgerId, ctx.user.id);
    }),

  // 获取指定学员的减肥档案（教练用）
  getMemberConfig: protectedProcedure
    .input(z.object({ ledgerId: z.number(), userId: z.number() }))
    .query(async ({ input }) => {
      return await dbDiet.getMemberConfig(input.ledgerId, input.userId);
    }),

  // 保存/更新指定学员的减肥档案（教练为学员设置）
  saveMemberConfig: protectedProcedure
    .input(z.object({
      ledgerId: z.number(),
      userId: z.number(),   // 要设置档案的学员userId
      nickname: z.string().optional(),
      initialWeight: z.number().positive().optional(),
      targetWeight: z.number().positive().optional(),
      currentWeight: z.number().positive().optional(),
      height: z.number().positive().optional(),
      gender: z.enum(['male', 'female']).optional(),
    }))
    .mutation(async ({ input }) => {
      await dbDiet.saveMemberConfig(input.ledgerId, input.userId, {
        nickname: input.nickname,
        initialWeight: input.initialWeight,
        targetWeight: input.targetWeight,
        currentWeight: input.currentWeight,
        height: input.height,
        gender: input.gender,
      });
      return { success: true };
    }),

  // 获取账本内所有学员的档案列表（教练用）
  getAllMemberConfigs: protectedProcedure
    .input(z.object({ ledgerId: z.number() }))
    .query(async ({ input }) => {
      return await dbDiet.getAllMemberConfigs(input.ledgerId);
    }),

  // 设置成员档案（完整版）- 用于成员信息设置页
  setMemberConfig: protectedProcedure
    .input(z.object({
      ledgerId: z.number(),
      userId: z.number(),
      studentName: z.string().optional(),
      gender: z.enum(['male', 'female']).optional(),
      height: z.number().positive().nullable().optional(),
      initialWeight: z.number().positive(),
      targetWeight: z.number().positive(),
      startDate: z.string().optional(),
      chest: z.number().positive().nullable().optional(),
      waist: z.number().positive().nullable().optional(),
      hip: z.number().positive().nullable().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      await dbDiet.setMemberConfig(input.ledgerId, input.userId, {
        studentName: input.studentName,
        gender: input.gender,
        height: input.height,
        initialWeight: input.initialWeight,
        targetWeight: input.targetWeight,
        startDate: input.startDate,
        chest: input.chest,
        waist: input.waist,
        hip: input.hip,
        notes: input.notes,
      });
      return { success: true };
    }),

  // 获取指定学员的完整档案（教练用）
  getMemberFullConfig: protectedProcedure
    .input(z.object({ ledgerId: z.number(), userId: z.number() }))
    .query(async ({ input }) => {
      return await dbDiet.getMemberFullConfig(input.ledgerId, input.userId);
    }),

  // 获取账本成员列表（含用户信息，用于学员管理页）
  getLedgerMembers: protectedProcedure
    .input(z.object({ ledgerId: z.number() }))
    .query(async ({ ctx, input }) => {
      return await dbLedger.getLedgerMembers(input.ledgerId, ctx.user.id);
    }),

  // ========== 体重记录 ==========

  addWeight: protectedProcedure
    .input(z.object({
      ledgerId: z.number(),
      weight: z.number().positive(),
      note: z.string().optional(),
      recordDate: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      return await dbDiet.addWeightRecord({
        ledgerId: input.ledgerId,
        userId: ctx.user.id,
        weight: input.weight,
        note: input.note,
        recordDate: input.recordDate,
      });
    }),

  getWeightHistory: protectedProcedure
    .input(z.object({
      ledgerId: z.number(),
      days: z.number().optional().default(60),
    }))
    .query(async ({ ctx, input }) => {
      return await dbDiet.getWeightRecords(input.ledgerId, ctx.user.id, input.days);
    }),

  // ========== 卡路里记录 ==========

  addCalorie: protectedProcedure
    .input(z.object({
      ledgerId: z.number(),
      calories: z.number().positive(),
      activityType: z.string().optional(),
      note: z.string().optional(),
      recordDate: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      return await dbDiet.addCalorieRecord({
        ledgerId: input.ledgerId,
        userId: ctx.user.id,
        calories: input.calories,
        activityType: input.activityType,
        note: input.note,
        recordDate: input.recordDate,
      });
    }),

  getCalorieHistory: protectedProcedure
    .input(z.object({
      ledgerId: z.number(),
      days: z.number().optional().default(60),
    }))
    .query(async ({ ctx, input }) => {
      return await dbDiet.getCalorieSummaryByDate(input.ledgerId, ctx.user.id, input.days);
    }),

  // ========== 三餐AI分析 ==========

  analyzeMeal: protectedProcedure
    .input(z.object({
      ledgerId: z.number(),
      mealType: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
      imageBase64: z.string(),
      imageFilename: z.string().optional(),
      recordDate: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      // 1. 上传图片到COS
      let imageUrl = '';
      try {
        const base64Data = input.imageBase64.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        const filename = input.imageFilename || `meal_${Date.now()}.jpg`;
        imageUrl = await uploadImageToCOS(buffer, 'diet-meals', filename);
      } catch (e) {
        console.error('[diet.analyzeMeal] 图片上传失败:', e);
        throw new Error('图片上传失败，请重试');
      }

      // 2. 先保存记录
      const record = await dbDiet.addMealRecord({
        ledgerId: input.ledgerId,
        userId: ctx.user.id,
        mealType: input.mealType,
        imageUrl,
        recordDate: input.recordDate,
      });

      // 3. AI分析
      const mealTypeLabel = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '加餐' }[input.mealType];
      try {
        const aiResult = await invokeLLM({
          messages: [
            {
              role: 'system',
              content: `你是一位专业的营养师AI，擅长通过食物照片分析营养成分和热量。请用中文回复，格式为JSON。`,
            },
            {
              role: 'user',
              content: [
                { type: 'image_url', image_url: { url: imageUrl, detail: 'auto' } },
                {
                  type: 'text',
                  text: `这是用户的${mealTypeLabel}照片。请分析这顿餐食，返回以下JSON格式：
{
  "foods": ["识别到的食物列表"],
  "totalCalories": 估算总热量数字(kcal),
  "nutrition": {
    "carbs": 碳水化合物百分比(0-100),
    "protein": 蛋白质百分比(0-100),
    "fat": 脂肪百分比(0-100)
  },
  "issues": ["存在的营养问题，如碳水偏高、蛋白质不足等"],
  "suggestions": ["具体改善建议，2-3条"],
  "score": 健康评分(0-100),
  "summary": "一句话总结这顿饭的营养状况"
}
只返回JSON，不要其他文字。`,
                },
              ],
            },
          ],
        });

        const aiText = typeof aiResult.content === 'string' ? aiResult.content : '';
        const jsonMatch = aiText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          await dbDiet.updateMealAiAnalysis(record.id, jsonMatch[0]);
          return { id: record.id, imageUrl, aiAnalysis: JSON.parse(jsonMatch[0]) };
        }
      } catch (e) {
        console.error('[diet.analyzeMeal] AI分析失败:', e);
      }

      return { id: record.id, imageUrl, aiAnalysis: null };
    }),

  getMeals: protectedProcedure
    .input(z.object({
      ledgerId: z.number(),
      date: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const records = await dbDiet.getMealRecords(input.ledgerId, ctx.user.id, input.date);
      return records.map((r: any) => ({
        ...r,
        aiAnalysis: r.aiAnalysis ? (() => { try { return JSON.parse(r.aiAnalysis); } catch { return null; } })() : null,
      }));
    }),

  // ========== 综合统计 ==========

  getStats: protectedProcedure
    .input(z.object({ ledgerId: z.number() }))
    .query(async ({ ctx, input }) => {
      return await dbDiet.getDietStats(input.ledgerId, ctx.user.id);
    }),
});
