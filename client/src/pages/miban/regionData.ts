// 米伴地址选择沿用既有导出名，统一使用全站共享的全国省市区数据。
export type { ChinaRegionData as RegionData } from "../../../../shared/china-regions";
export {
  chinaRegionData as regionData,
  chinaProvinceNames as provinces,
  getChinaCities as getCities,
  getChinaDistricts as getDistricts,
  withCurrentRegionOption,
} from "../../../../shared/china-regions";
