import { describe, expect, it } from "vitest";
import { chinaRegions, chinaProvinceNames, chinaRegionData } from "../shared/china-regions";
import { CHINA_REGION } from "../client/src/lib/china-region";
import { regionData, provinces, getCities, getDistricts } from "../client/src/pages/miban/regionData";

const directRegions = new Set(["北京市", "天津市", "上海市", "重庆市", "香港特别行政区", "澳门特别行政区"]);

describe("全站地区下拉兼容门面", () => {
  it("米伴直接复用完整共享数据，没有再次裁剪地区", () => {
    expect(regionData).toBe(chinaRegionData);
    expect(provinces).toEqual(chinaProvinceNames);
    for (const province of chinaRegions) {
      expect(getCities(province.name)).toEqual(province.cities.map(city => city.name));
      for (const city of province.cities) {
        expect(getDistricts(province.name, city.name)).toEqual(city.districts);
      }
    }
  });

  it("牙伴覆盖所有省、市、县区，直辖市和港澳兼容扁平区县", () => {
    for (const province of chinaRegions) {
      const treeProvince = CHINA_REGION.find(node => node.name === province.name);
      expect(treeProvince, province.name).toBeTruthy();
      if (directRegions.has(province.name)) {
        expect(treeProvince!.children?.map(node => node.name)).toEqual(province.cities[0].districts);
      } else {
        expect(treeProvince!.children?.map(node => node.name)).toEqual(province.cities.map(city => city.name));
        for (const city of province.cities) {
          const treeCity = treeProvince!.children!.find(node => node.name === city.name)!;
          expect(treeCity.children?.map(node => node.name) ?? [], `${province.name}/${city.name}`).toEqual(city.districts);
        }
      }
    }
  });

  it("牙伴保留海外/其他独立兼容入口，不冒充国内行政区", () => {
    expect(CHINA_REGION.some(node => node.name === "海外/其他" && !node.children?.length)).toBe(true);
    expect(chinaProvinceNames).not.toContain("海外/其他");
  });
});
