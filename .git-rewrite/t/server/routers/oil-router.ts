import { z } from 'zod';
import { router, publicProcedure } from '../_core/trpc';
import { oilPriceService } from '../oil-price-service';

export const oilRouter = router({
  // 获取实时油价
  getRealTimePrices: publicProcedure
    .query(async () => {
      try {
        const prices = await oilPriceService.getRealTimeOilPrices();
        return {
          success: true,
          data: prices,
          timestamp: new Date().toISOString()
        };
      } catch (error) {
        console.error('获取实时油价失败:', error);
        return {
          success: false,
          error: '获取油价数据失败',
          data: {
            brent: null,
            wti: null,
            timestamp: new Date().toISOString()
          },
          timestamp: new Date().toISOString()
        };
      }
    }),
  
  // 获取布伦特原油价格
  getBrentPrice: publicProcedure
    .query(async () => {
      try {
        const price = await oilPriceService.getBrentPrice();
        return {
          success: true,
          data: price,
          timestamp: new Date().toISOString()
        };
      } catch (error) {
        console.error('获取布伦特油价失败:', error);
        return {
          success: false,
          error: '获取布伦特油价失败',
          data: null,
          timestamp: new Date().toISOString()
        };
      }
    }),
  
  // 获取WTI原油价格
  getWTIPrice: publicProcedure
    .query(async () => {
      try {
        const price = await oilPriceService.getWTIPrice();
        return {
          success: true,
          data: price,
          timestamp: new Date().toISOString()
        };
      } catch (error) {
        console.error('获取WTI油价失败:', error);
        return {
          success: false,
          error: '获取WTI油价失败',
          data: null,
          timestamp: new Date().toISOString()
        };
      }
    }),
  
  // 获取历史价格数据
  getHistoricalPrices: publicProcedure
    .input(z.object({
      symbol: z.enum(['brent', 'wti']).default('brent'),
      days: z.number().min(1).max(365).default(30)
    }))
    .query(async ({ input }) => {
      try {
        const prices = oilPriceService.getHistoricalPrices(input.symbol, input.days);
        return {
          success: true,
          data: prices,
          timestamp: new Date().toISOString()
        };
      } catch (error) {
        console.error('获取历史油价失败:', error);
        return {
          success: false,
          error: '获取历史油价失败',
          data: [],
          timestamp: new Date().toISOString()
        };
      }
    }),
  
  // 获取油价统计信息
  getPriceStats: publicProcedure
    .input(z.object({
      symbol: z.enum(['brent', 'wti']).default('brent'),
      days: z.number().min(1).max(365).default(30)
    }))
    .query(async ({ input }) => {
      try {
        const prices = oilPriceService.getHistoricalPrices(input.symbol, input.days);
        const priceValues = prices.map(p => p.price);
        
        if (priceValues.length === 0) {
          return {
            success: true,
            data: {
              average: 0,
              min: 0,
              max: 0,
              volatility: 0,
              trend: 'stable'
            },
            timestamp: new Date().toISOString()
          };
        }
        
        const average = priceValues.reduce((a, b) => a + b, 0) / priceValues.length;
        const min = Math.min(...priceValues);
        const max = Math.max(...priceValues);
        
        // 计算波动率（标准差）
        const variance = priceValues.reduce((a, b) => a + Math.pow(b - average, 2), 0) / priceValues.length;
        const volatility = Math.sqrt(variance);
        
        // 判断趋势（最近5天 vs 前5天）
        const recentPrices = prices.slice(-5).map(p => p.price);
        const previousPrices = prices.slice(-10, -5).map(p => p.price);
        const recentAvg = recentPrices.reduce((a, b) => a + b, 0) / recentPrices.length;
        const previousAvg = previousPrices.reduce((a, b) => a + b, 0) / previousPrices.length;
        
        let trend: 'up' | 'down' | 'stable' = 'stable';
        if (recentAvg > previousAvg * 1.02) trend = 'up';
        else if (recentAvg < previousAvg * 0.98) trend = 'down';
        
        return {
          success: true,
          data: {
            average: parseFloat(average.toFixed(2)),
            min: parseFloat(min.toFixed(2)),
            max: parseFloat(max.toFixed(2)),
            volatility: parseFloat(volatility.toFixed(4)),
            trend,
            currentPrice: priceValues[priceValues.length - 1],
            priceChange: priceValues[priceValues.length - 1] - priceValues[0],
            priceChangePercent: ((priceValues[priceValues.length - 1] - priceValues[0]) / priceValues[0] * 100)
          },
          timestamp: new Date().toISOString()
        };
      } catch (error) {
        console.error('获取油价统计失败:', error);
        return {
          success: false,
          error: '获取油价统计失败',
          data: null,
          timestamp: new Date().toISOString()
        };
      }
    })
});