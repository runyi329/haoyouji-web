/**
 * 宏观数据路由 - 中国出生人口数据
 * 数据来源：
 * - 全国年度出生人口：国家统计局历年统计公报（1949-2025）
 * - 分省出生率（2010-2019）：github.com/jnzst/china-birth-rates
 * - 分省性别比（2020）：第七次全国人口普查公报
 */
import { router, publicProcedure } from '../_core/trpc';

// ── 全国年度出生人口数据（万人）1949-2025 ────────────────────────────────────
const NATIONAL_BIRTH_DATA: Array<{ year: number; births: number; note?: string }> = [
  { year: 1949, births: 1275, note: '新中国成立' },
  { year: 1950, births: 1419 },
  { year: 1951, births: 1349 },
  { year: 1952, births: 1622 },
  { year: 1953, births: 1637 },
  { year: 1954, births: 2232, note: '第一波婴儿潮' },
  { year: 1955, births: 1965 },
  { year: 1956, births: 1961 },
  { year: 1957, births: 2138 },
  { year: 1958, births: 1889 },
  { year: 1959, births: 1635 },
  { year: 1960, births: 1402, note: '三年自然灾害' },
  { year: 1961, births: 949 },
  { year: 1962, births: 2451, note: '天灾结束，生育反弹' },
  { year: 1963, births: 2934, note: '历史峰值' },
  { year: 1964, births: 2721 },
  { year: 1965, births: 2679 },
  { year: 1966, births: 2554 },
  { year: 1967, births: 2543 },
  { year: 1968, births: 2731 },
  { year: 1969, births: 2690 },
  { year: 1970, births: 2710 },
  { year: 1971, births: 2551, note: '开始实行计划生育' },
  { year: 1972, births: 2550 },
  { year: 1973, births: 2447 },
  { year: 1974, births: 2226 },
  { year: 1975, births: 2102 },
  { year: 1976, births: 1849, note: '文革结束' },
  { year: 1977, births: 1783 },
  { year: 1978, births: 1733, note: '改革开放' },
  { year: 1979, births: 1715 },
  { year: 1980, births: 1776, note: '独生子女政策' },
  { year: 1981, births: 2064, note: '50-60后进入生育期' },
  { year: 1982, births: 2230 },
  { year: 1983, births: 2052 },
  { year: 1984, births: 2050 },
  { year: 1985, births: 2196 },
  { year: 1986, births: 2374 },
  { year: 1987, births: 2508 },
  { year: 1988, births: 2445 },
  { year: 1989, births: 2396 },
  { year: 1990, births: 2374 },
  { year: 1991, births: 2250 },
  { year: 1992, births: 2113 },
  { year: 1993, births: 2120 },
  { year: 1994, births: 2098 },
  { year: 1995, births: 2052 },
  { year: 1996, births: 2057 },
  { year: 1997, births: 2028 },
  { year: 1998, births: 1934 },
  { year: 1999, births: 1827 },
  { year: 2000, births: 1765 },
  { year: 2001, births: 1696 },
  { year: 2002, births: 1641 },
  { year: 2003, births: 1594 },
  { year: 2004, births: 1588 },
  { year: 2005, births: 1612 },
  { year: 2006, births: 1581 },
  { year: 2007, births: 1591 },
  { year: 2008, births: 1604 },
  { year: 2009, births: 1587 },
  { year: 2010, births: 1588, note: '80后进入生育期' },
  { year: 2011, births: 1600 },
  { year: 2012, births: 1800, note: '龙年' },
  { year: 2013, births: 1640 },
  { year: 2014, births: 1687 },
  { year: 2015, births: 1655 },
  { year: 2016, births: 1786, note: '全面二孩政策' },
  { year: 2017, births: 1723 },
  { year: 2018, births: 1523 },
  { year: 2019, births: 1465 },
  { year: 2020, births: 1200 },
  { year: 2021, births: 1062, note: '三孩政策' },
  { year: 2022, births: 956 },
  { year: 2023, births: 902 },
  { year: 2024, births: 882 },
  { year: 2025, births: 792, note: '历史新低' },
];

// ── 分省出生率（‰，每千人出生数）2010-2019 ──────────────────────────────────
// 来源：github.com/jnzst/china-birth-rates（国家统计局数据整理）
const PROVINCIAL_BIRTH_RATE: Record<string, Record<number, number>> = {
  '北京': { 2010: 7.48, 2011: 8.29, 2012: 9.05, 2013: 8.93, 2014: 9.75, 2015: 7.96, 2016: 9.32, 2017: 9.06, 2018: 8.24, 2019: 8.12 },
  '天津': { 2010: 8.18, 2011: 8.58, 2012: 8.75, 2013: 8.28, 2014: 8.19, 2015: 5.84, 2016: 7.37, 2017: 7.65, 2018: 6.67, 2019: 6.73 },
  '河北': { 2010: 13.22, 2011: 13.02, 2012: 12.88, 2013: 13.04, 2014: 13.18, 2015: 11.35, 2016: 12.42, 2017: 13.20, 2018: 11.26, 2019: 10.83 },
  '山西': { 2010: 10.68, 2011: 10.47, 2012: 10.70, 2013: 10.81, 2014: 10.92, 2015: 9.98, 2016: 10.29, 2017: 11.06, 2018: 9.63, 2019: 9.12 },
  '内蒙古': { 2010: 9.30, 2011: 8.94, 2012: 9.17, 2013: 8.98, 2014: 9.31, 2015: 7.72, 2016: 9.03, 2017: 9.47, 2018: 8.35, 2019: 8.23 },
  '辽宁': { 2010: 6.68, 2011: 5.71, 2012: 6.15, 2013: 6.09, 2014: 6.49, 2015: 6.17, 2016: 6.60, 2017: 6.49, 2018: 6.39, 2019: 6.45 },
  '吉林': { 2010: 7.91, 2011: 6.53, 2012: 5.73, 2013: 5.36, 2014: 6.62, 2015: 5.87, 2016: 5.55, 2017: 6.76, 2018: 6.62, 2019: 6.05 },
  '黑龙江': { 2010: 7.35, 2011: 6.99, 2012: 7.30, 2013: 6.86, 2014: 7.37, 2015: 6.00, 2016: 6.12, 2017: 6.22, 2018: 5.98, 2019: 5.73 },
  '上海': { 2010: 7.05, 2011: 6.97, 2012: 9.56, 2013: 8.18, 2014: 8.35, 2015: 7.52, 2016: 9.00, 2017: 8.10, 2018: 7.20, 2019: 7.00 },
  '江苏': { 2010: 9.73, 2011: 9.59, 2012: 9.44, 2013: 9.44, 2014: 9.45, 2015: 9.05, 2016: 9.76, 2017: 9.71, 2018: 9.32, 2019: 9.12 },
  '浙江': { 2010: 10.27, 2011: 9.47, 2012: 10.12, 2013: 10.01, 2014: 10.51, 2015: 10.52, 2016: 11.22, 2017: 11.92, 2018: 11.02, 2019: 10.51 },
  '安徽': { 2010: 12.70, 2011: 12.23, 2012: 13.00, 2013: 12.88, 2014: 12.86, 2015: 12.92, 2016: 13.02, 2017: 14.07, 2018: 12.41, 2019: 12.03 },
  '福建': { 2010: 11.27, 2011: 11.41, 2012: 12.74, 2013: 12.20, 2014: 13.70, 2015: 13.90, 2016: 14.50, 2017: 15.00, 2018: 13.20, 2019: 12.90 },
  '江西': { 2010: 13.72, 2011: 13.48, 2012: 13.46, 2013: 13.19, 2014: 13.24, 2015: 13.20, 2016: 13.45, 2017: 13.79, 2018: 13.43, 2019: 12.59 },
  '山东': { 2010: 11.65, 2011: 11.50, 2012: 11.90, 2013: 11.41, 2014: 14.23, 2015: 12.55, 2016: 17.89, 2017: 17.54, 2018: 13.26, 2019: 11.77 },
  '河南': { 2010: 11.52, 2011: 11.56, 2012: 11.87, 2013: 12.27, 2014: 12.80, 2015: 12.70, 2016: 13.26, 2017: 12.95, 2018: 11.72, 2019: 11.02 },
  '湖北': { 2010: 10.36, 2011: 10.39, 2012: 11.00, 2013: 11.08, 2014: 11.86, 2015: 10.74, 2016: 12.04, 2017: 12.60, 2018: 11.54, 2019: 11.35 },
  '湖南': { 2010: 13.10, 2011: 13.35, 2012: 13.58, 2013: 13.50, 2014: 13.52, 2015: 13.58, 2016: 13.57, 2017: 13.27, 2018: 12.19, 2019: 10.39 },
  '广东': { 2010: 11.18, 2011: 10.45, 2012: 11.60, 2013: 10.71, 2014: 10.80, 2015: 11.12, 2016: 11.85, 2017: 13.68, 2018: 12.79, 2019: 12.54 },
  '广西': { 2010: 14.13, 2011: 13.71, 2012: 14.20, 2013: 14.28, 2014: 14.07, 2015: 14.05, 2016: 13.82, 2017: 15.14, 2018: 14.12, 2019: 13.31 },
  '海南': { 2010: 14.71, 2011: 14.72, 2012: 14.66, 2013: 14.59, 2014: 14.56, 2015: 14.57, 2016: 14.57, 2017: 14.73, 2018: 14.48, 2019: 12.87 },
  '重庆': { 2010: 9.17, 2011: 9.88, 2012: 10.86, 2013: 10.37, 2014: 10.67, 2015: 11.05, 2016: 11.77, 2017: 11.18, 2018: 11.02, 2019: 10.48 },
  '四川': { 2010: 8.93, 2011: 9.79, 2012: 9.89, 2013: 9.90, 2014: 10.22, 2015: 10.30, 2016: 10.48, 2017: 11.26, 2018: 11.05, 2019: 10.70 },
  '贵州': { 2010: 13.96, 2011: 13.31, 2012: 13.27, 2013: 13.05, 2014: 12.98, 2015: 13.00, 2016: 13.43, 2017: 13.98, 2018: 13.90, 2019: 13.65 },
  '云南': { 2010: 13.10, 2011: 12.71, 2012: 12.63, 2013: 12.60, 2014: 12.65, 2015: 12.88, 2016: 13.16, 2017: 13.53, 2018: 13.19, 2019: 12.63 },
  '西藏': { 2010: 15.80, 2011: 15.39, 2012: 15.48, 2013: 15.77, 2014: 15.76, 2015: 15.75, 2016: 15.79, 2017: 16.00, 2018: 15.22, 2019: 14.60 },
  '陕西': { 2010: 9.73, 2011: 9.75, 2012: 10.12, 2013: 10.01, 2014: 10.13, 2015: 10.10, 2016: 10.64, 2017: 11.11, 2018: 10.67, 2019: 10.55 },
  '甘肃': { 2010: 12.05, 2011: 12.08, 2012: 12.11, 2013: 12.16, 2014: 12.21, 2015: 12.36, 2016: 12.18, 2017: 12.54, 2018: 11.07, 2019: 10.60 },
  '青海': { 2010: 14.94, 2011: 14.43, 2012: 14.30, 2013: 14.16, 2014: 14.67, 2015: 14.72, 2016: 14.70, 2017: 14.42, 2018: 14.31, 2019: 13.66 },
  '宁夏': { 2010: 14.14, 2011: 13.65, 2012: 13.26, 2013: 13.12, 2014: 13.10, 2015: 12.62, 2016: 13.69, 2017: 13.44, 2018: 13.32, 2019: 13.72 },
  '新疆': { 2010: 15.99, 2011: 14.99, 2012: 15.32, 2013: 15.84, 2014: 16.44, 2015: 15.59, 2016: 15.34, 2017: 15.88, 2018: 10.69, 2019: 8.14 },
};

// ── 七普（2020年）分省人口及性别比 ──────────────────────────────────────────
// 来源：第七次全国人口普查公报（第四号）
// malePct: 男性占比(%)，femalePct: 女性占比(%)，sexRatio: 每100女对应男数
const PROVINCIAL_GENDER_2020: Record<string, { population: number; malePct: number; femalePct: number; sexRatio: number }> = {
  '全国': { population: 141178, malePct: 51.24, femalePct: 48.76, sexRatio: 105.07 },
  '北京': { population: 2189, malePct: 51.14, femalePct: 48.86, sexRatio: 104.65 },
  '天津': { population: 1387, malePct: 51.53, femalePct: 48.47, sexRatio: 106.31 },
  '河北': { population: 7461, malePct: 50.50, femalePct: 49.50, sexRatio: 102.02 },
  '山西': { population: 3492, malePct: 50.99, femalePct: 49.01, sexRatio: 104.06 },
  '内蒙古': { population: 2405, malePct: 51.04, femalePct: 48.96, sexRatio: 104.26 },
  '辽宁': { population: 4259, malePct: 49.92, femalePct: 50.08, sexRatio: 99.70 },
  '吉林': { population: 2407, malePct: 49.92, femalePct: 50.08, sexRatio: 99.69 },
  '黑龙江': { population: 3185, malePct: 50.09, femalePct: 49.91, sexRatio: 100.35 },
  '上海': { population: 2487, malePct: 51.77, femalePct: 48.23, sexRatio: 107.33 },
  '江苏': { population: 8475, malePct: 50.78, femalePct: 49.22, sexRatio: 103.15 },
  '浙江': { population: 6457, malePct: 52.16, femalePct: 47.84, sexRatio: 109.04 },
  '安徽': { population: 6103, malePct: 50.97, femalePct: 49.03, sexRatio: 103.94 },
  '福建': { population: 4154, malePct: 51.68, femalePct: 48.32, sexRatio: 106.94 },
  '江西': { population: 4518, malePct: 51.60, femalePct: 48.40, sexRatio: 106.62 },
  '山东': { population: 10153, malePct: 50.66, femalePct: 49.34, sexRatio: 102.67 },
  '河南': { population: 9937, malePct: 50.15, femalePct: 49.85, sexRatio: 100.60 },
  '湖北': { population: 5775, malePct: 51.42, femalePct: 48.58, sexRatio: 105.83 },
  '湖南': { population: 6644, malePct: 51.16, femalePct: 48.84, sexRatio: 104.77 },
  '广东': { population: 12601, malePct: 53.07, femalePct: 46.93, sexRatio: 113.08 },
  '广西': { population: 5013, malePct: 51.70, femalePct: 48.30, sexRatio: 107.04 },
  '海南': { population: 1008, malePct: 53.02, femalePct: 46.98, sexRatio: 112.86 },
  '重庆': { population: 3205, malePct: 50.55, femalePct: 49.45, sexRatio: 102.21 },
  '四川': { population: 8368, malePct: 50.54, femalePct: 49.46, sexRatio: 102.19 },
  '贵州': { population: 3856, malePct: 51.10, femalePct: 48.90, sexRatio: 104.50 },
  '云南': { population: 4693, malePct: 51.73, femalePct: 48.27, sexRatio: 107.16 },
  '西藏': { population: 365, malePct: 52.45, femalePct: 47.55, sexRatio: 110.32 },
  '陕西': { population: 3953, malePct: 51.17, femalePct: 48.83, sexRatio: 104.79 },
  '甘肃': { population: 2502, malePct: 50.76, femalePct: 49.24, sexRatio: 103.10 },
  '青海': { population: 592, malePct: 51.21, femalePct: 48.79, sexRatio: 104.97 },
  '宁夏': { population: 720, malePct: 50.94, femalePct: 49.06, sexRatio: 103.83 },
  '新疆': { population: 2585, malePct: 51.66, femalePct: 48.34, sexRatio: 106.85 },
};

export const macroRouter = router({
  // 获取全国年度出生人口数据
  getNationalBirthData: publicProcedure
    .query(async () => {
      return {
        success: true,
        data: NATIONAL_BIRTH_DATA,
        meta: {
          source: '国家统计局历年统计公报',
          unit: '万人',
          yearRange: [1949, 2025],
        }
      };
    }),

  // 获取分省出生率数据（2010-2019）
  getProvincialBirthRate: publicProcedure
    .query(async () => {
      const provinces = Object.keys(PROVINCIAL_BIRTH_RATE);
      const years = [2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019];
      
      // 转换为按年份分组的格式
      const byYear = years.map(year => {
        const provinceData: Record<string, number> = {};
        provinces.forEach(prov => {
          provinceData[prov] = PROVINCIAL_BIRTH_RATE[prov][year] ?? 0;
        });
        return { year, ...provinceData };
      });

      // 转换为按省份分组的格式（用于排行榜）
      const byProvince = provinces.map(prov => ({
        province: prov,
        data: years.map(year => ({ year, rate: PROVINCIAL_BIRTH_RATE[prov][year] ?? 0 })),
        avg2019: PROVINCIAL_BIRTH_RATE[prov][2019] ?? 0,
      })).sort((a, b) => b.avg2019 - a.avg2019);

      return {
        success: true,
        data: { byYear, byProvince, provinces, years },
        meta: {
          source: 'github.com/jnzst/china-birth-rates（国家统计局数据）',
          unit: '‰（每千人出生数）',
          yearRange: [2010, 2019],
        }
      };
    }),

  // 获取七普分省性别比数据（2020年）
  getProvincialGender2020: publicProcedure
    .query(async () => {
      const provinces = Object.keys(PROVINCIAL_GENDER_2020).filter(p => p !== '全国');
      const data = provinces.map(prov => ({
        province: prov,
        ...PROVINCIAL_GENDER_2020[prov],
        maleCount: Math.round(PROVINCIAL_GENDER_2020[prov].population * PROVINCIAL_GENDER_2020[prov].malePct / 100),
        femaleCount: Math.round(PROVINCIAL_GENDER_2020[prov].population * PROVINCIAL_GENDER_2020[prov].femalePct / 100),
      })).sort((a, b) => b.sexRatio - a.sexRatio);

      return {
        success: true,
        data,
        national: PROVINCIAL_GENDER_2020['全国'],
        meta: {
          source: '第七次全国人口普查公报（第四号）',
          unit: '万人',
          year: 2020,
        }
      };
    }),
});
