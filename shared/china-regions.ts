import sourceLocations from "./data/china-regions-source.json";

export type ChinaRegionCity = {
  name: string;
  districts: string[];
};
export type ChinaRegionProvince = {
  name: string;
  cities: ChinaRegionCity[];
};
export type ChinaRegionData = Record<string, Record<string, string[]>>;

const source: Record<string, string> = sourceLocations;
const directRegionPrefixes = new Set(["11", "12", "31", "50", "81", "82"]);

// 投递地址需覆盖实际管辖区，而不只限于GB/T行政区代码表。
// 来源：https://dxal.gov.cn/dxal/c100014/tydp.shtml
const daxinganlingDeliveryDistricts = ["加格达奇区", "松岭区", "新林区", "呼中区"];

/** 全国地址选择统一离线数据。代码仅用于归属，不写入或改写任何历史地址。 */
export const chinaRegions: ChinaRegionProvince[] = Object.entries(source)
  .filter(([code]) => code.endsWith("0000"))
  .map(([provinceCode, name]) => {
    const prefix = provinceCode.slice(0, 2);
    const children = Object.entries(source).filter(([code]) =>
      code.startsWith(prefix) && code !== provinceCode
    );
    if (directRegionPrefixes.has(prefix)) {
      return {
        name,
        cities: [{
          name,
          // 重庆市的区和县合并在同一城市下，不能只读取 5001 而漏掉 5002。
          districts: children.filter(([code]) => !code.endsWith("00")).map(([, childName]) => childName),
        }],
      };
    }

    const prefectures = children.filter(([code]) => code.endsWith("00"));
    const prefectureCodes = new Set(prefectures.map(([code]) => code));
    const cities: ChinaRegionCity[] = prefectures.map(([cityCode, cityName]) => ({
      name: cityName,
      districts: children
        .filter(([code]) => code !== cityCode && code.slice(0, 4) === cityCode.slice(0, 4))
        .map(([, districtName]) => districtName),
    }));
    // 济源、仙桃、海南省直管县市、新疆兵团城市等没有地级父节点。
    // 直接作为可选市级显示；无真实县级子节点时区县可留空，勿编造“其他地区”。
    for (const [code, cityName] of children) {
      if (!code.endsWith("00") && !prefectureCodes.has(`${code.slice(0, 4)}00`)) {
        cities.push({ name: cityName, districts: [] });
      }
    }
    if (name === "黑龙江省") {
      const daxinganling = cities.find(city => city.name === "大兴安岭地区");
      if (daxinganling) {
        daxinganling.districts = [...new Set([...daxinganling.districts, ...daxinganlingDeliveryDistricts])];
      }
    }
    return { name, cities };
  });

export const chinaRegionData: ChinaRegionData = Object.fromEntries(
  chinaRegions.map(province => [
    province.name,
    Object.fromEntries(province.cities.map(city => [city.name, city.districts])),
  ])
);
export const chinaProvinceNames = chinaRegions.map(province => province.name);

export function getChinaCities(province: string): string[] {
  return Object.keys(chinaRegionData[province] ?? {});
}
export function getChinaDistricts(province: string, city: string): string[] {
  return chinaRegionData[province]?.[city] ?? [];
}

/** 编辑旧地址时保留已保存但已更名/撤并的值，不让浏览器静默回退到第一项。 */
export function withCurrentRegionOption(options: string[], current?: string): string[] {
  return current && !options.includes(current) ? [...options, current] : options;
}
