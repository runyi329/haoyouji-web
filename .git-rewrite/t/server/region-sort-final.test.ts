import { describe, expect, it } from "vitest";
import { getRegionStats } from "./db-contacts";

describe("地域排序最终验证", () => {
  it("应该按人脉数量降序排列,海外和其他固定在最后", async () => {
    const stats = await getRegionStats();
    
    console.log("\n=== 地域排序结果 ===");
    stats.forEach((s, index) => {
      console.log(`${index + 1}. ${s.name}: ${s.value}人`);
    });
    
    // 检查海外和其他的位置
    const overseasIndex = stats.findIndex(s => s.name === '海外');
    const otherIndex = stats.findIndex(s => s.name === '其他');
    
    if (overseasIndex !== -1) {
      console.log(`\n海外位置: 第${overseasIndex + 1}个`);
      // 海外应该在倒数第二或最后
      expect(overseasIndex >= stats.length - 2).toBe(true);
    }
    
    if (otherIndex !== -1) {
      console.log(`其他位置: 第${otherIndex + 1}个`);
      // 其他应该在最后
      expect(otherIndex).toBe(stats.length - 1);
    }
    
    // 检查正常省份是否按人脉数量降序
    const normalProvinces = stats.filter(s => s.name !== '海外' && s.name !== '其他');
    for (let i = 0; i < normalProvinces.length - 1; i++) {
      expect(normalProvinces[i].value).toBeGreaterThanOrEqual(normalProvinces[i + 1].value);
    }
    
    console.log("\n✅ 排序验证通过!");
  });
});
