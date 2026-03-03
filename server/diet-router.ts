/**
 * 减肥账本路由
 * 包含：配置管理、体重记录、卡路里记录、三餐AI分析
 */
import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import * as dbDiet from "./db-diet";
import { invokeLLM } from "./_core/llm";
import { uploadImageToCOS } from "./cos-upload";

export const dietRouter = router({
  // ========== 配置 ==========

  // 获取减肥账本配置
  getConfig: protectedProcedure
    .input(z.object({ ledgerId: z.number() }))
    .query(async ({ input }) => {
      return await dbDiet.getDietConfig(input.ledgerId);
    }),

  // 保存/更新减肥账本配置
  saveConfig: protectedProcedure
    .input(z.object({
      ledgerId: z.number(),
      initialWeight: z.number().positive(),
      targetWeight: z.number().positive(),
      currentWeight: z.number().positive().optional(),
      height: z.number().positive().optional(),
      gender: z.enum(['male', 'female']).optional(),
    }))
    .mutation(async ({ input }) => {
      await dbDiet.saveDietConfig(input.ledgerId, {
        initialWeight: input.initialWeight,
        targetWeight: input.targetWeight,
        currentWeight: input.currentWeight,
        height: input.height,
        gender: input.gender,
      });
      return { success: true };
    }),

  // ========== 体重记录 ==========

  // 添加体重打卡
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

  // 获取体重记录列表（用于图表）
  getWeightHistory: protectedProcedure
    .input(z.object({
      ledgerId: z.number(),
      days: z.number().optional().default(60),
    }))
    .query(async ({ input }) => {
      return await dbDiet.getWeightRecords(input.ledgerId, input.days);
    }),

  // ========== 卡路里记录 ==========

  // 添加卡路里消耗
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

  // 获取卡路里记录（按日期汇总，用于图表）
  getCalorieHistory: protectedProcedure
    .input(z.object({
      ledgerId: z.number(),
      days: z.number().optional().default(60),
    }))
    .query(async ({ input }) => {
      return await dbDiet.getCalorieSummaryByDate(input.ledgerId, input.days);
    }),

  // ========== 三餐AI分析 ==========

  // 上传餐食照片并触发AI分析
  analyzeMeal: protectedProcedure
    .input(z.object({
      ledgerId: z.number(),
      mealType: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
      imageBase64: z.string(), // base64编码的图片
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

      // 2. 先保存记录（无AI分析）
      const record = await dbDiet.addMealRecord({
        ledgerId: input.ledgerId,
        userId: ctx.user.id,
        mealType: input.mealType,
        imageUrl,
        recordDate: input.recordDate,
      });

      // 3. 调用AI分析（图片识别）
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
                {
                  type: 'image_url',
                  image_url: { url: imageUrl, detail: 'auto' },
                },
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
        // 提取JSON
        const jsonMatch = aiText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          await dbDiet.updateMealAiAnalysis(record.id, jsonMatch[0]);
          return {
            id: record.id,
            imageUrl,
            aiAnalysis: JSON.parse(jsonMatch[0]),
          };
        }
      } catch (e) {
        console.error('[diet.analyzeMeal] AI分析失败:', e);
      }

      return { id: record.id, imageUrl, aiAnalysis: null };
    }),

  // 获取某天的三餐记录
  getMeals: protectedProcedure
    .input(z.object({
      ledgerId: z.number(),
      date: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const records = await dbDiet.getMealRecords(input.ledgerId, input.date);
      return records.map((r: any) => ({
        ...r,
        aiAnalysis: r.aiAnalysis ? (() => { try { return JSON.parse(r.aiAnalysis); } catch { return null; } })() : null,
      }));
    }),

  // ========== 综合统计 ==========

  // 获取减肥账本完整统计（用于首页面板）
  getStats: protectedProcedure
    .input(z.object({ ledgerId: z.number() }))
    .query(async ({ input }) => {
      return await dbDiet.getDietStats(input.ledgerId);
    }),
});
