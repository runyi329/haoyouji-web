import { describe, expect, it } from "vitest";
import source from "../shared/data/china-regions-source.json";
import {
  chinaRegions,
  chinaRegionData,
  chinaProvinceNames,
  getChinaCities,
  getChinaDistricts,
  withCurrentRegionOption,
} from "../shared/china-regions";

const locations: Record<string, string> = source;
const directPrefixes = new Set(["11", "12", "31", "50", "81", "82"]);

describe("全站统一省市区离线数据", () => {
  it("覆盖来源全部34个省级单位，每个省份都有可选城市", () => {
    expect(chinaProvinceNames).toHaveLength(34);
    expect(new Set(chinaProvinceNames).size).toBe(34);
    expect(chinaProvinceNames).toEqual(Object.entries(locations).filter(([code]) => code.endsWith("0000")).map(([, name]) => name));
    for (const province of chinaRegions) {
      expect(province.cities.length, province.name).toBeGreaterThan(0);
      expect(new Set(province.cities.map(city => city.name)).size, province.name).toBe(province.cities.length);
      for (const city of province.cities) {
        expect(city.name.trim(), province.name).not.toBe("");
        expect(new Set(city.districts).size, `${province.name}/${city.name}`).toBe(city.districts.length);
        expect(chinaRegionData[province.name][city.name]).toEqual(city.districts);
      }
    }
  });

  it("逐条覆盖上游全部城市和县区，不丢任何行政区代码归属", () => {
    for (const [code, name] of Object.entries(locations)) {
      if (code.endsWith("0000")) continue;
      const prefix = code.slice(0, 2);
      const provinceName = locations[`${prefix}0000`];
      expect(provinceName, code).toBeTruthy();
      if (directPrefixes.has(prefix)) {
        if (!code.endsWith("00")) expect(getChinaDistricts(provinceName, provinceName), code).toContain(name);
      } else if (code.endsWith("00")) {
        expect(getChinaCities(provinceName), code).toContain(name);
      } else {
        const cityName = locations[`${code.slice(0, 4)}00`];
        if (cityName) expect(getChinaDistricts(provinceName, cityName), code).toContain(name);
        else expect(getChinaCities(provinceName), code).toContain(name);
      }
    }
  });

  it("安徽16市完整，滁州市八县区齐全", () => {
    expect(getChinaCities("安徽省")).toHaveLength(16);
    expect(getChinaDistricts("安徽省", "滁州市")).toEqual([
      "琅琊区", "南谯区", "来安县", "全椒县", "定远县", "凤阳县", "天长市", "明光市",
    ]);
    for (const city of ["淮北市", "铜陵市", "阜阳市", "池州市", "宣城市"]) {
      expect(getChinaCities("安徽省")).toContain(city);
    }
  });

  it("重庆县区合并但不漏掉县，港澳地区可选", () => {
    expect(getChinaCities("重庆市")).toEqual(["重庆市"]);
    expect(getChinaDistricts("重庆市", "重庆市")).toContain("城口县");
    expect(getChinaDistricts("重庆市", "重庆市")).toContain("两江新区");
    expect(getChinaDistricts("香港特别行政区", "香港特别行政区")).toContain("中西区");
    expect(getChinaDistricts("澳门特别行政区", "澳门特别行政区")).toContain("嘉模堂区");
  });

  it("补足大兴安岭官方列明的四个实际管辖区", () => {
    const districts = getChinaDistricts("黑龙江省", "大兴安岭地区");
    for (const district of ["加格达奇区", "松岭区", "新林区", "呼中区", "呼玛县", "塔河县", "漠河市"]) {
      expect(districts).toContain(district);
    }
    expect(districts).toHaveLength(7);
  });

  it("省直管县市可直接选择而不是塞进其他地区", () => {
    for (const [province, city] of [
      ["河南省", "济源市"], ["湖北省", "仙桃市"], ["湖北省", "神农架林区"],
      ["海南省", "琼海市"], ["海南省", "琼中黎族苗族自治县"],
      ["新疆维吾尔自治区", "石河子市"], ["新疆维吾尔自治区", "草湖市"],
      ["台湾省", "台北市"], ["台湾省", "宜兰县"],
    ]) expect(getChinaCities(province)).toContain(city);
  });

  it("无县区城市可选且区县可空，不伪造街镇为县级行政区", () => {
    for (const [province, city] of [["广东省", "东莞市"], ["广东省", "中山市"], ["海南省", "儋州市"], ["甘肃省", "嘉峪关市"]]) {
      expect(getChinaCities(province)).toContain(city);
      expect(getChinaDistricts(province, city)).toEqual([]);
    }
  });

  it("未选地区或跨省查询返回空数组", () => {
    expect(getChinaCities("")).toEqual([]);
    expect(getChinaDistricts("安徽省", "")).toEqual([]);
    expect(getChinaDistricts("江苏省", "滁州市")).toEqual([]);
  });

  it("历史地区回显保留原值，不重复也不修改当前数据", () => {
    const current = getChinaDistricts("重庆市", "重庆市");
    const before = [...current];
    expect(withCurrentRegionOption(current, "江北区")).toContain("江北区");
    expect(withCurrentRegionOption(current, "两江新区").filter(name => name === "两江新区")).toHaveLength(1);
    expect(current).toEqual(before);
    expect(withCurrentRegionOption([], "历史地区")).toEqual(["历史地区"]);
  });
});
