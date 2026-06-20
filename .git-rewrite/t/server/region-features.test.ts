import { describe, expect, it } from "vitest";
import { getRegionStats } from "./db-contacts";
import { getRegionTrend } from "./db-region-trend";

describe("地域统计排序", () => {
  it("海外和其他应该排在最后", async () => {
    // 使用真实用户ID测试
    const userId = 1;
    const stats = await getRegionStats(userId);
    
    console.log("地域统计结果:", stats);
    
    // 检查是否有数据
    expect(stats.length).toBeGreaterThan(0);
    
    // 找到海外和其他的位置
    const overseasIndex = stats.findIndex(s => s.name === '海外');
    const otherIndex = stats.findIndex(s => s.name === '其他');
    
    // 如果有海外,应该在倒数第二或最后
    if (overseasIndex !== -1) {
      expect(overseasIndex).toBeGreaterThanOrEqual(stats.length - 2);
      console.log("✓ 海外排在位置:", overseasIndex, "总数:", stats.length);
    }
    
    // 如果有其他,应该在最后
    if (otherIndex !== -1) {
      expect(otherIndex).toBe(stats.length - 1);
      console.log("✓ 其他排在最后位置:", otherIndex);
    }
    
    // 检查正常省份是否按数量降序排列
    const normalRegions = stats.filter(s => s.name !== '海外' && s.name !== '其他');
    for (let i = 0; i < normalRegions.length - 1; i++) {
      expect(normalRegions[i]!.value).toBeGreaterThanOrEqual(normalRegions[i + 1]!.value);
    }
    console.log("✓ 正常省份按数量降序排列");
  });
});

describe("地域趋势数据", () => {
  it("应该返回正确格式的趋势数据", async () => {
    const userId = 1;
    const months = 6;
    
    const result = await getRegionTrend(userId, months);
    
    console.log("地域趋势结果:", {
      数据条数: result.data.length,
      省份列表: result.regions,
      示例数据: result.data[0],
    });
    
    // 检查返回格式
    expect(result).toHaveProperty('data');
    expect(result).toHaveProperty('regions');
    expect(Array.isArray(result.data)).toBe(true);
    expect(Array.isArray(result.regions)).toBe(true);
    
    // 检查数据条数应该等于月份数
    expect(result.data.length).toBe(months);
    
    // 检查每条数据应该有month字段和各省份字段
    if (result.data.length > 0) {
      const firstData = result.data[0]!;
      expect(firstData).toHaveProperty('month');
      
      // 每个省份都应该有对应的数据字段
      for (const region of result.regions) {
        expect(firstData).toHaveProperty(region);
        expect(typeof firstData[region]).toBe('number');
      }
    }
    
    console.log("✓ 地域趋势数据格式正确");
  });
  
  it("应该限制返回最多10个省份", async () => {
    const userId = 1;
    const result = await getRegionTrend(userId, 6);
    
    expect(result.regions.length).toBeLessThanOrEqual(10);
    console.log("✓ 省份数量限制正确:", result.regions.length, "个省份");
  });
});
