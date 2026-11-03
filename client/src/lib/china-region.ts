/**
 * 牙伴齿科 - 中国省/市/区行政区划树。
 * 与全站共用离线数据；直辖市和港澳省市同名，扁平为省 -> 区，避免地址重复。
 */
import { chinaRegions } from "@shared/china-regions";

export interface RegionNode {
  name: string;
  children?: RegionNode[];
}

export const CHINA_REGION: RegionNode[] = [
  ...chinaRegions.map(({ name, cities }): RegionNode => {
    if (cities.length === 1 && cities[0].name === name) {
      const children = cities[0].districts.map(district => ({ name: district }));
      return children.length ? { name, children } : { name };
    }
    const children = cities.map((city): RegionNode => {
      const districts = city.districts.map(district => ({ name: district }));
      // 东莞、中山等无县级区划的城市在市级结束，不把街镇伪造成区县。
      return districts.length ? { name: city.name, children: districts } : { name: city.name };
    });
    return children.length ? { name, children } : { name };
  }),
  { name: "海外/其他" },
];
