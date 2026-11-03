import { describe, expect, it } from "vitest";
import sourceLocations from "../shared/data/china-regions-source.json";
import {
  provinces,
  getCities,
  getDistricts,
} from "../client/src/pages/miban/regionData";

const chuzhouDistricts = [
  "琅琊区", "南谯区", "来安县", "全椒县",
  "定远县", "凤阳县", "天长市", "明光市",
];

describe("米伴安徽省滁州市收货地址", () => {
  it("安徽省可选，滁州市只出现一次", () => {
    expect(provinces).toContain("安徽省");
    expect(getCities("安徽省").filter(city => city === "滁州市")).toHaveLength(1);
  });

  it("滁州市的八个县区完整且名称不重复", () => {
    expect(getDistricts("安徽省", "滁州市")).toEqual(chuzhouDistricts);
    expect(new Set(getDistricts("安徽省", "滁州市")).size).toBe(8);
  });

  it("与全站统一上游数据中的滁州市保持一致", () => {
    expect(sourceLocations["341100"]).toBe("滁州市");
    const sourceDistricts = Object.entries(sourceLocations)
      .filter(([code]) => code.startsWith("3411") && code !== "341100")
      .map(([, name]) => name);
    expect(getDistricts("安徽省", "滁州市")).toEqual(sourceDistricts);
  });

  it("切换到其他省份不会串入滁州市县区", () => {
    expect(getCities("江苏省")).not.toContain("滁州市");
    expect(getDistricts("江苏省", "滁州市")).toEqual([]);
    expect(getDistricts("安徽省", "合肥市")).toContain("蜀山区");
  });

  it("直辖市和未选省市的既有行为不变", () => {
    expect(getCities("北京市")).toEqual(["北京市"]);
    expect(getDistricts("北京市", "北京市")).toContain("朝阳区");
    expect(getCities("")).toEqual([]);
    expect(getDistricts("安徽省", "")).toEqual([]);
  });
});
