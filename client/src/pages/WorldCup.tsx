import { useLocation } from "wouter";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

// ===== 颜色常量 =====
const BG = "#0D1B2A";        // 深藏青主背景
const BG2 = "#112236";       // 次级背景
const BG3 = "#162C42";       // 卡片背景
const GOLD = "#FFD700";      // 金色高亮
const GOLD2 = "#E8B800";     // 金色次级
const TEXT = "#E8EDF2";      // 主文字
const TEXT2 = "#8FA3B8";     // 次级文字
const BORDER = "rgba(255,255,255,0.08)"; // 分隔线

// ===== flagcdn 国旗图片 =====
function Flag({ code, size = 28 }: { code: string; size?: number }) {
  return (
    <img
      src={`https://flagcdn.com/w${size * 2}/${code.toLowerCase()}.png`}
      width={size}
      height={size * 0.67}
      alt={code}
      style={{ borderRadius: 3, objectFit: "cover", display: "inline-block" }}
      onError={(e) => {
        (e.target as HTMLImageElement).style.display = "none";
      }}
    />
  );
}

// ===== 完整赛程数据（按日期，北京时间） =====
interface Match {
  home: string;
  homeCode: string;
  away: string;
  awayCode: string;
  time?: string;
  venue?: string;
  stage: string;
}
interface DaySchedule {
  date: string;
  dateLabel: string;
  matches: Match[];
}

const schedule: DaySchedule[] = [
  {
    date: "2026-06-12",
    dateLabel: "6月12日 周五",
    matches: [
      { home: "墨西哥", homeCode: "mx", away: "南非", awayCode: "za", time: "03:00", venue: "墨西哥城", stage: "A组" },
      { home: "韩国", homeCode: "kr", away: "捷克", awayCode: "cz", time: "10:00", venue: "瓜达拉哈拉", stage: "A组" },
    ],
  },
  {
    date: "2026-06-13",
    dateLabel: "6月13日 周六",
    matches: [
      { home: "加拿大", homeCode: "ca", away: "波黑", awayCode: "ba", time: "03:00", venue: "多伦多", stage: "B组" },
      { home: "美国", homeCode: "us", away: "巴拉圭", awayCode: "py", time: "09:00", venue: "英格尔伍德", stage: "D组" },
    ],
  },
  {
    date: "2026-06-14",
    dateLabel: "6月14日 周日",
    matches: [
      { home: "卡塔尔", homeCode: "qa", away: "瑞士", awayCode: "ch", time: "03:00", venue: "圣克拉拉", stage: "B组" },
      { home: "巴西", homeCode: "br", away: "摩洛哥", awayCode: "ma", time: "06:00", venue: "东卢瑟福", stage: "C组" },
      { home: "海地", homeCode: "ht", away: "苏格兰", awayCode: "gb-sct", time: "09:00", venue: "福克斯伯勒", stage: "C组" },
      { home: "澳大利亚", homeCode: "au", away: "土耳其", awayCode: "tr", time: "12:00", venue: "温哥华", stage: "D组" },
    ],
  },
  {
    date: "2026-06-15",
    dateLabel: "6月15日 周一",
    matches: [
      { home: "德国", homeCode: "de", away: "库拉索", awayCode: "cw", time: "01:00", venue: "休斯顿", stage: "E组" },
      { home: "荷兰", homeCode: "nl", away: "日本", awayCode: "jp", time: "04:00", venue: "阿灵顿", stage: "F组" },
      { home: "科特迪瓦", homeCode: "ci", away: "厄瓜多尔", awayCode: "ec", time: "07:00", venue: "费城", stage: "E组" },
      { home: "瑞典", homeCode: "se", away: "突尼斯", awayCode: "tn", time: "10:00", venue: "蒙特雷", stage: "F组" },
    ],
  },
  {
    date: "2026-06-16",
    dateLabel: "6月16日 周二",
    matches: [
      { home: "比利时", homeCode: "be", away: "埃及", awayCode: "eg", time: "03:00", venue: "西雅图", stage: "G组" },
      { home: "西班牙", homeCode: "es", away: "佛得角", awayCode: "cv", time: "00:00", venue: "亚特兰大", stage: "H组" },
      { home: "沙特", homeCode: "sa", away: "乌拉圭", awayCode: "uy", time: "06:00", venue: "迈阿密", stage: "H组" },
      { home: "伊朗", homeCode: "ir", away: "新西兰", awayCode: "nz", time: "09:00", venue: "英格尔伍德", stage: "G组" },
    ],
  },
  {
    date: "2026-06-17",
    dateLabel: "6月17日 周三",
    matches: [
      { home: "法国", homeCode: "fr", away: "塞内加尔", awayCode: "sn", time: "03:00", venue: "东卢瑟福", stage: "I组" },
      { home: "伊拉克", homeCode: "iq", away: "挪威", awayCode: "no", time: "06:00", venue: "福克斯伯勒", stage: "I组" },
      { home: "阿根廷", homeCode: "ar", away: "阿尔及利亚", awayCode: "dz", time: "09:00", venue: "堪萨斯城", stage: "J组" },
      { home: "奥地利", homeCode: "at", away: "约旦", awayCode: "jo", time: "12:00", venue: "圣克拉拉", stage: "J组" },
    ],
  },
  {
    date: "2026-06-18",
    dateLabel: "6月18日 周四",
    matches: [
      { home: "葡萄牙", homeCode: "pt", away: "刚果(金)", awayCode: "cd", time: "01:00", venue: "休斯顿", stage: "K组" },
      { home: "英格兰", homeCode: "gb-eng", away: "克罗地亚", awayCode: "hr", time: "04:00", venue: "阿灵顿", stage: "L组" },
      { home: "加纳", homeCode: "gh", away: "巴拿马", awayCode: "pa", time: "07:00", venue: "多伦多", stage: "L组" },
      { home: "乌兹别克", homeCode: "uz", away: "哥伦比亚", awayCode: "co", time: "10:00", venue: "墨西哥城", stage: "K组" },
    ],
  },
  {
    date: "2026-06-19",
    dateLabel: "6月19日 周五",
    matches: [
      { home: "捷克", homeCode: "cz", away: "南非", awayCode: "za", time: "00:00", venue: "亚特兰大", stage: "A组" },
      { home: "瑞士", homeCode: "ch", away: "波黑", awayCode: "ba", time: "03:00", venue: "英格尔伍德", stage: "B组" },
      { home: "加拿大", homeCode: "ca", away: "卡塔尔", awayCode: "qa", time: "06:00", venue: "温哥华", stage: "B组" },
      { home: "墨西哥", homeCode: "mx", away: "韩国", awayCode: "kr", time: "09:00", venue: "瓜达拉哈拉", stage: "A组" },
    ],
  },
  {
    date: "2026-06-20",
    dateLabel: "6月20日 周六",
    matches: [
      { home: "澳大利亚", homeCode: "au", away: "巴拉圭", awayCode: "py", time: "01:00", venue: "英格尔伍德", stage: "D组" },
      { home: "巴西", homeCode: "br", away: "海地", awayCode: "ht", time: "04:00", venue: "东卢瑟福", stage: "C组" },
      { home: "摩洛哥", homeCode: "ma", away: "苏格兰", awayCode: "gb-sct", time: "07:00", venue: "福克斯伯勒", stage: "C组" },
      { home: "美国", homeCode: "us", away: "土耳其", awayCode: "tr", time: "10:00", venue: "温哥华", stage: "D组" },
    ],
  },
  {
    date: "2026-06-21",
    dateLabel: "6月21日 周日",
    matches: [
      { home: "德国", homeCode: "de", away: "科特迪瓦", awayCode: "ci", time: "01:00", venue: "休斯顿", stage: "E组" },
      { home: "荷兰", homeCode: "nl", away: "瑞典", awayCode: "se", time: "04:00", venue: "阿灵顿", stage: "F组" },
      { home: "库拉索", homeCode: "cw", away: "厄瓜多尔", awayCode: "ec", time: "07:00", venue: "费城", stage: "E组" },
      { home: "日本", homeCode: "jp", away: "突尼斯", awayCode: "tn", time: "10:00", venue: "蒙特雷", stage: "F组" },
    ],
  },
  {
    date: "2026-06-22",
    dateLabel: "6月22日 周一",
    matches: [
      { home: "比利时", homeCode: "be", away: "伊朗", awayCode: "ir", time: "01:00", venue: "西雅图", stage: "G组" },
      { home: "西班牙", homeCode: "es", away: "沙特", awayCode: "sa", time: "04:00", venue: "亚特兰大", stage: "H组" },
      { home: "埃及", homeCode: "eg", away: "新西兰", awayCode: "nz", time: "07:00", venue: "英格尔伍德", stage: "G组" },
      { home: "乌拉圭", homeCode: "uy", away: "佛得角", awayCode: "cv", time: "10:00", venue: "迈阿密", stage: "H组" },
    ],
  },
  {
    date: "2026-06-23",
    dateLabel: "6月23日 周二",
    matches: [
      { home: "法国", homeCode: "fr", away: "伊拉克", awayCode: "iq", time: "01:00", venue: "东卢瑟福", stage: "I组" },
      { home: "阿根廷", homeCode: "ar", away: "奥地利", awayCode: "at", time: "04:00", venue: "堪萨斯城", stage: "J组" },
      { home: "塞内加尔", homeCode: "sn", away: "挪威", awayCode: "no", time: "07:00", venue: "福克斯伯勒", stage: "I组" },
      { home: "阿尔及利亚", homeCode: "dz", away: "约旦", awayCode: "jo", time: "10:00", venue: "圣克拉拉", stage: "J组" },
    ],
  },
  {
    date: "2026-06-24",
    dateLabel: "6月24日 周三",
    matches: [
      { home: "葡萄牙", homeCode: "pt", away: "乌兹别克", awayCode: "uz", time: "01:00", venue: "休斯顿", stage: "K组" },
      { home: "英格兰", homeCode: "gb-eng", away: "加纳", awayCode: "gh", time: "04:00", venue: "阿灵顿", stage: "L组" },
      { home: "刚果(金)", homeCode: "cd", away: "哥伦比亚", awayCode: "co", time: "07:00", venue: "墨西哥城", stage: "K组" },
      { home: "克罗地亚", homeCode: "hr", away: "巴拿马", awayCode: "pa", time: "10:00", venue: "多伦多", stage: "L组" },
    ],
  },
  {
    date: "2026-06-25",
    dateLabel: "6月25日 周四",
    matches: [
      { home: "墨西哥", homeCode: "mx", away: "南非", awayCode: "za", time: "03:00", venue: "墨西哥城", stage: "A组" },
      { home: "韩国", homeCode: "kr", away: "捷克", awayCode: "cz", time: "03:00", venue: "瓜达拉哈拉", stage: "A组" },
      { home: "加拿大", homeCode: "ca", away: "瑞士", awayCode: "ch", time: "03:00", venue: "温哥华", stage: "B组" },
      { home: "卡塔尔", homeCode: "qa", away: "波黑", awayCode: "ba", time: "03:00", venue: "圣克拉拉", stage: "B组" },
    ],
  },
  {
    date: "2026-06-26",
    dateLabel: "6月26日 周五",
    matches: [
      { home: "巴西", homeCode: "br", away: "苏格兰", awayCode: "gb-sct", time: "03:00", venue: "东卢瑟福", stage: "C组" },
      { home: "摩洛哥", homeCode: "ma", away: "海地", awayCode: "ht", time: "03:00", venue: "福克斯伯勒", stage: "C组" },
      { home: "美国", homeCode: "us", away: "巴拉圭", awayCode: "py", time: "03:00", venue: "英格尔伍德", stage: "D组" },
      { home: "澳大利亚", homeCode: "au", away: "土耳其", awayCode: "tr", time: "03:00", venue: "温哥华", stage: "D组" },
    ],
  },
  {
    date: "2026-06-27",
    dateLabel: "6月27日 周六",
    matches: [
      { home: "德国", homeCode: "de", away: "厄瓜多尔", awayCode: "ec", time: "03:00", venue: "休斯顿", stage: "E组" },
      { home: "科特迪瓦", homeCode: "ci", away: "库拉索", awayCode: "cw", time: "03:00", venue: "费城", stage: "E组" },
      { home: "荷兰", homeCode: "nl", away: "突尼斯", awayCode: "tn", time: "03:00", venue: "阿灵顿", stage: "F组" },
      { home: "瑞典", homeCode: "se", away: "日本", awayCode: "jp", time: "03:00", venue: "蒙特雷", stage: "F组" },
    ],
  },
  {
    date: "2026-06-28",
    dateLabel: "6月28日 周日",
    matches: [
      { home: "比利时", homeCode: "be", away: "新西兰", awayCode: "nz", time: "03:00", venue: "西雅图", stage: "G组" },
      { home: "伊朗", homeCode: "ir", away: "埃及", awayCode: "eg", time: "03:00", venue: "英格尔伍德", stage: "G组" },
      { home: "西班牙", homeCode: "es", away: "乌拉圭", awayCode: "uy", time: "03:00", venue: "亚特兰大", stage: "H组" },
      { home: "沙特", homeCode: "sa", away: "佛得角", awayCode: "cv", time: "03:00", venue: "迈阿密", stage: "H组" },
    ],
  },
  {
    date: "2026-06-29",
    dateLabel: "6月29日 周一",
    matches: [
      { home: "法国", homeCode: "fr", away: "挪威", awayCode: "no", time: "03:00", venue: "东卢瑟福", stage: "I组" },
      { home: "塞内加尔", homeCode: "sn", away: "伊拉克", awayCode: "iq", time: "03:00", venue: "福克斯伯勒", stage: "I组" },
      { home: "阿根廷", homeCode: "ar", away: "约旦", awayCode: "jo", time: "03:00", venue: "堪萨斯城", stage: "J组" },
      { home: "奥地利", homeCode: "at", away: "阿尔及利亚", awayCode: "dz", time: "03:00", venue: "圣克拉拉", stage: "J组" },
    ],
  },
  {
    date: "2026-06-30",
    dateLabel: "6月30日 周二",
    matches: [
      { home: "葡萄牙", homeCode: "pt", away: "哥伦比亚", awayCode: "co", time: "03:00", venue: "休斯顿", stage: "K组" },
      { home: "乌兹别克", homeCode: "uz", away: "刚果(金)", awayCode: "cd", time: "03:00", venue: "墨西哥城", stage: "K组" },
      { home: "英格兰", homeCode: "gb-eng", away: "巴拿马", awayCode: "pa", time: "03:00", venue: "阿灵顿", stage: "L组" },
      { home: "克罗地亚", homeCode: "hr", away: "加纳", awayCode: "gh", time: "03:00", venue: "多伦多", stage: "L组" },
    ],
  },
  {
    date: "2026-07-02",
    dateLabel: "7月2日 周四",
    matches: [
      { home: "1A", homeCode: "un", away: "2B", awayCode: "un", time: "TBD", venue: "TBD", stage: "淘汰赛" },
      { home: "1C", homeCode: "un", away: "2D", awayCode: "un", time: "TBD", venue: "TBD", stage: "淘汰赛" },
    ],
  },
  {
    date: "2026-07-03",
    dateLabel: "7月3日 周五",
    matches: [
      { home: "1E", homeCode: "un", away: "2F", awayCode: "un", time: "TBD", venue: "TBD", stage: "淘汰赛" },
      { home: "1G", homeCode: "un", away: "2H", awayCode: "un", time: "TBD", venue: "TBD", stage: "淘汰赛" },
    ],
  },
  {
    date: "2026-07-04",
    dateLabel: "7月4日 周六",
    matches: [
      { home: "1I", homeCode: "un", away: "2J", awayCode: "un", time: "TBD", venue: "TBD", stage: "淘汰赛" },
      { home: "1K", homeCode: "un", away: "2L", awayCode: "un", time: "TBD", venue: "TBD", stage: "淘汰赛" },
    ],
  },
  {
    date: "2026-07-06",
    dateLabel: "7月6日 周一",
    matches: [
      { home: "1B", homeCode: "un", away: "2A", awayCode: "un", time: "TBD", venue: "TBD", stage: "淘汰赛" },
      { home: "1D", homeCode: "un", away: "2C", awayCode: "un", time: "TBD", venue: "TBD", stage: "淘汰赛" },
    ],
  },
  {
    date: "2026-07-07",
    dateLabel: "7月7日 周二",
    matches: [
      { home: "1F", homeCode: "un", away: "2E", awayCode: "un", time: "TBD", venue: "TBD", stage: "淘汰赛" },
      { home: "1H", homeCode: "un", away: "2G", awayCode: "un", time: "TBD", venue: "TBD", stage: "淘汰赛" },
    ],
  },
  {
    date: "2026-07-08",
    dateLabel: "7月8日 周三",
    matches: [
      { home: "1J", homeCode: "un", away: "2I", awayCode: "un", time: "TBD", venue: "TBD", stage: "淘汰赛" },
      { home: "1L", homeCode: "un", away: "2K", awayCode: "un", time: "TBD", venue: "TBD", stage: "淘汰赛" },
    ],
  },
  {
    date: "2026-07-11",
    dateLabel: "7月11日 周六",
    matches: [
      { home: "最佳第三名1", homeCode: "un", away: "最佳第三名2", awayCode: "un", time: "TBD", venue: "TBD", stage: "淘汰赛" },
      { home: "最佳第三名3", homeCode: "un", away: "最佳第三名4", awayCode: "un", time: "TBD", venue: "TBD", stage: "淘汰赛" },
    ],
  },
  {
    date: "2026-07-12",
    dateLabel: "7月12日 周日",
    matches: [
      { home: "最佳第三名5", homeCode: "un", away: "最佳第三名6", awayCode: "un", time: "TBD", venue: "TBD", stage: "淘汰赛" },
      { home: "最佳第三名7", homeCode: "un", away: "最佳第三名8", awayCode: "un", time: "TBD", venue: "TBD", stage: "淘汰赛" },
    ],
  },
  {
    date: "2026-07-14",
    dateLabel: "7月14日 周二",
    matches: [
      { home: "1/4决赛A", homeCode: "un", away: "1/4决赛B", awayCode: "un", time: "TBD", venue: "TBD", stage: "四分之一决赛" },
      { home: "1/4决赛C", homeCode: "un", away: "1/4决赛D", awayCode: "un", time: "TBD", venue: "TBD", stage: "四分之一决赛" },
    ],
  },
  {
    date: "2026-07-15",
    dateLabel: "7月15日 周三",
    matches: [
      { home: "1/4决赛E", homeCode: "un", away: "1/4决赛F", awayCode: "un", time: "TBD", venue: "TBD", stage: "四分之一决赛" },
      { home: "1/4决赛G", homeCode: "un", away: "1/4决赛H", awayCode: "un", time: "TBD", venue: "TBD", stage: "四分之一决赛" },
    ],
  },
  {
    date: "2026-07-17",
    dateLabel: "7月17日 周五",
    matches: [
      { home: "半决赛A", homeCode: "un", away: "半决赛B", awayCode: "un", time: "TBD", venue: "TBD", stage: "半决赛" },
    ],
  },
  {
    date: "2026-07-18",
    dateLabel: "7月18日 周六",
    matches: [
      { home: "半决赛C", homeCode: "un", away: "半决赛D", awayCode: "un", time: "TBD", venue: "TBD", stage: "半决赛" },
    ],
  },
  {
    date: "2026-07-19",
    dateLabel: "7月19日 周日",
    matches: [
      { home: "季军争夺", homeCode: "un", away: "季军争夺", awayCode: "un", time: "TBD", venue: "TBD", stage: "季军赛" },
    ],
  },
  {
    date: "2026-07-20",
    dateLabel: "7月20日 周一",
    matches: [
      { home: "冠军", homeCode: "un", away: "亚军", awayCode: "un", time: "TBD", venue: "大都会球场", stage: "决赛" },
    ],
  },
];

// ===== 分组数据 =====
const groups: Record<string, { name: string; code: string }[]> = {
  A: [
    { name: "墨西哥", code: "mx" },
    { name: "南非", code: "za" },
    { name: "韩国", code: "kr" },
    { name: "捷克", code: "cz" },
  ],
  B: [
    { name: "加拿大", code: "ca" },
    { name: "波黑", code: "ba" },
    { name: "卡塔尔", code: "qa" },
    { name: "瑞士", code: "ch" },
  ],
  C: [
    { name: "巴西", code: "br" },
    { name: "摩洛哥", code: "ma" },
    { name: "海地", code: "ht" },
    { name: "苏格兰", code: "gb-sct" },
  ],
  D: [
    { name: "美国", code: "us" },
    { name: "巴拉圭", code: "py" },
    { name: "澳大利亚", code: "au" },
    { name: "土耳其", code: "tr" },
  ],
  E: [
    { name: "德国", code: "de" },
    { name: "库拉索", code: "cw" },
    { name: "科特迪瓦", code: "ci" },
    { name: "厄瓜多尔", code: "ec" },
  ],
  F: [
    { name: "荷兰", code: "nl" },
    { name: "日本", code: "jp" },
    { name: "瑞典", code: "se" },
    { name: "突尼斯", code: "tn" },
  ],
  G: [
    { name: "比利时", code: "be" },
    { name: "埃及", code: "eg" },
    { name: "伊朗", code: "ir" },
    { name: "新西兰", code: "nz" },
  ],
  H: [
    { name: "西班牙", code: "es" },
    { name: "佛得角", code: "cv" },
    { name: "沙特", code: "sa" },
    { name: "乌拉圭", code: "uy" },
  ],
  I: [
    { name: "法国", code: "fr" },
    { name: "塞内加尔", code: "sn" },
    { name: "伊拉克", code: "iq" },
    { name: "挪威", code: "no" },
  ],
  J: [
    { name: "阿根廷", code: "ar" },
    { name: "阿尔及利亚", code: "dz" },
    { name: "奥地利", code: "at" },
    { name: "约旦", code: "jo" },
  ],
  K: [
    { name: "葡萄牙", code: "pt" },
    { name: "刚果(金)", code: "cd" },
    { name: "乌兹别克", code: "uz" },
    { name: "哥伦比亚", code: "co" },
  ],
  L: [
    { name: "英格兰", code: "gb-eng" },
    { name: "克罗地亚", code: "hr" },
    { name: "加纳", code: "gh" },
    { name: "巴拿马", code: "pa" },
  ],
};

// ===== AI冠军预测数据（赔率占位，待更新） =====
interface TeamOdds {
  name: string;
  nameEn: string;
  code: string;
  odds: number;
}

const championOdds: TeamOdds[] = [
  { name: "西班牙", nameEn: "Spain", code: "es", odds: 6.09 },
  { name: "法国", nameEn: "France", code: "fr", odds: 6.94 },
  { name: "英格兰", nameEn: "England", code: "gb-eng", odds: 7.64 },
  { name: "巴西", nameEn: "Brazil", code: "br", odds: 9.49 },
  { name: "阿根廷", nameEn: "Argentina", code: "ar", odds: 9.80 },
  { name: "葡萄牙", nameEn: "Portugal", code: "pt", odds: 12.53 },
  { name: "德国", nameEn: "Germany", code: "de", odds: 15.03 },
  { name: "荷兰", nameEn: "Netherlands", code: "nl", odds: 28.18 },
  { name: "挪威", nameEn: "Norway", code: "no", odds: 30.06 },
  { name: "美国", nameEn: "USA", code: "us", odds: 50.10 },
  { name: "比利时", nameEn: "Belgium", code: "be", odds: 50.10 },
  { name: "哥伦比亚", nameEn: "Colombia", code: "co", odds: 53.05 },
  { name: "摩洛哥", nameEn: "Morocco", code: "ma", odds: 56.37 },
  { name: "日本", nameEn: "Japan", code: "jp", odds: 75.15 },
  { name: "乌拉圭", nameEn: "Uruguay", code: "uy", odds: 90.19 },
  { name: "克罗地亚", nameEn: "Croatia", code: "hr", odds: 90.19 },
  { name: "墨西哥", nameEn: "Mexico", code: "mx", odds: 100.21 },
  { name: "瑞士", nameEn: "Switzerland", code: "ch", odds: 112.73 },
  { name: "厄瓜多尔", nameEn: "Ecuador", code: "ec", odds: 128.84 },
  { name: "土耳其", nameEn: "Turkey", code: "tr", odds: 180.37 },
  { name: "瑞典", nameEn: "Sweden", code: "se", odds: 200.00 },
  { name: "奥地利", nameEn: "Austria", code: "at", odds: 225.00 },
  { name: "塞内加尔", nameEn: "Senegal", code: "sn", odds: 250.00 },
  { name: "韩国", nameEn: "South Korea", code: "kr", odds: 300.00 },
  { name: "澳大利亚", nameEn: "Australia", code: "au", odds: 350.00 },
  { name: "加拿大", nameEn: "Canada", code: "ca", odds: 400.00 },
  { name: "伊朗", nameEn: "Iran", code: "ir", odds: 450.00 },
  { name: "突尼斯", nameEn: "Tunisia", code: "tn", odds: 500.00 },
  { name: "捷克", nameEn: "Czech Republic", code: "cz", odds: 500.00 },
  { name: "巴拿马", nameEn: "Panama", code: "pa", odds: 600.00 },
  { name: "加纳", nameEn: "Ghana", code: "gh", odds: 600.00 },
  { name: "约旦", nameEn: "Jordan", code: "jo", odds: 750.00 },
  { name: "卡塔尔", nameEn: "Qatar", code: "qa", odds: 750.00 },
  { name: "波黑", nameEn: "Bosnia & Herz.", code: "ba", odds: 800.00 },
  { name: "沙特", nameEn: "Saudi Arabia", code: "sa", odds: 800.00 },
  { name: "伊拉克", nameEn: "Iraq", code: "iq", odds: 900.00 },
  { name: "埃及", nameEn: "Egypt", code: "eg", odds: 900.00 },
  { name: "新西兰", nameEn: "New Zealand", code: "nz", odds: 1000.00 },
  { name: "乌兹别克", nameEn: "Uzbekistan", code: "uz", odds: 1000.00 },
  { name: "哥伦比亚", nameEn: "Colombia", code: "co", odds: 53.05 },
  { name: "阿尔及利亚", nameEn: "Algeria", code: "dz", odds: 1200.00 },
  { name: "刚果(金)", nameEn: "DR Congo", code: "cd", odds: 1500.00 },
  { name: "佛得角", nameEn: "Cape Verde", code: "cv", odds: 1500.00 },
  { name: "巴拉圭", nameEn: "Paraguay", code: "py", odds: 1200.00 },
  { name: "科特迪瓦", nameEn: "Côte d'Ivoire", code: "ci", odds: 800.00 },
  { name: "海地", nameEn: "Haiti", code: "ht", odds: 2000.00 },
  { name: "库拉索", nameEn: "Curaçao", code: "cw", odds: 2000.00 },
  { name: "南非", nameEn: "South Africa", code: "za", odds: 1800.00 },
];

// ===== 阶段标签颜色 =====
const stageStyle = (stage: string): { bg: string; color: string } => {
  if (stage === "决赛") return { bg: GOLD, color: "#000" };
  if (stage === "半决赛") return { bg: "#C0001A", color: "#fff" };
  if (stage.includes("四分之一")) return { bg: "#1a3a8b", color: "#fff" };
  if (stage === "季军赛") return { bg: "#6b4c00", color: "#FFD700" };
  if (stage === "淘汰赛") return { bg: "#2a4a6b", color: "#8FA3B8" };
  return { bg: BG3, color: TEXT2 };
};

type TabType = "schedule" | "archive" | "champion";

// ===== 日期分组组件（常驻展开，不可折叠） =====
function DayGroup({
  day,
  isToday,
  onMatchClick,
}: {
  day: DaySchedule;
  isToday: boolean;
  onMatchClick: (match: Match) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const isPast = day.date < today;

  return (
    <div>
      {/* 日期标题行（不可点击） */}
      <div
        className="flex items-center px-4 py-2"
        style={{ backgroundColor: BG3, borderBottom: `1px solid ${BORDER}` }}
      >
        {isToday && (
          <span
            className="text-xs font-bold px-1.5 py-0.5 rounded mr-2"
            style={{ backgroundColor: GOLD, color: "#000", fontSize: "10px" }}
          >
            今天
          </span>
        )}
        <span
          className="text-sm font-bold"
          style={{ color: isPast && !isToday ? TEXT2 : TEXT }}
        >
          {day.dateLabel}
        </span>
        <span className="ml-2 text-xs" style={{ color: TEXT2, fontSize: "10px" }}>
          {day.matches.length}场
        </span>
      </div>

      {/* 比赛列表（常驻展开，紧凑单行） */}
      {day.matches.map((match, i) => (
        <button
          key={i}
          onClick={() => onMatchClick(match)}
          className="w-full flex items-center px-2 text-left transition-colors active:opacity-70"
          style={{
            backgroundColor: BG,
            borderBottom: `1px solid ${BORDER}`,
            minHeight: 38,
            paddingTop: 5,
            paddingBottom: 5,
            gap: 4,
          }}
        >
          {/* 左侧：阶段标签 + 时间 */}
          <div className="flex flex-col items-center flex-shrink-0" style={{ width: 38 }}>
            <span
              className="text-center rounded w-full"
              style={{
                backgroundColor: stageStyle(match.stage).bg,
                color: stageStyle(match.stage).color,
                fontSize: "9px",
                fontWeight: 700,
                padding: "1px 0",
                lineHeight: "14px",
              }}
            >
              {match.stage}
            </span>
            <span className="font-bold" style={{ color: GOLD, fontSize: "11px", lineHeight: "15px" }}>
              {match.time && match.time !== "TBD" ? match.time : "TBD"}
            </span>
            <span style={{ color: TEXT2, fontSize: "8px", lineHeight: "10px" }}>北京时间</span>
          </div>

          {/* 中间：主队 国旗 名字  VS  国旗 名字 客队 */}
          <div className="flex items-center flex-1 justify-center" style={{ gap: 3 }}>
            {/* 主队 */}
            <Flag code={match.homeCode} size={15} />
            <span style={{ color: TEXT, fontSize: "11px", fontWeight: 500, whiteSpace: "nowrap" }}>{match.home}</span>
            {/* VS */}
            <span style={{ color: GOLD, fontSize: "10px", fontWeight: 900, marginLeft: 2, marginRight: 2 }}>VS</span>
            {/* 客队 */}
            <span style={{ color: TEXT, fontSize: "11px", fontWeight: 500, whiteSpace: "nowrap" }}>{match.away}</span>
            <Flag code={match.awayCode} size={15} />
          </div>

          {/* 右侧小箭头 */}
          <ChevronRight className="flex-shrink-0" style={{ color: TEXT2, width: 13, height: 13 }} />
        </button>
      ))}
    </div>
  );
}

// ===== 主组件 =====
export default function WorldCup() {
  const [activeTab, setActiveTab] = useState<TabType>("schedule");
  const today = new Date().toISOString().slice(0, 10);
  const [sortAsc, setSortAsc] = useState(true);
  const [archiveView, setArchiveView] = useState<"team" | "player">("team");

  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);

  const tabs: { key: TabType; label: string }[] = [
    { key: "schedule", label: "赛程" },
    { key: "archive", label: "档案" },
    { key: "champion", label: "AI冠军预测" },
  ];

  const sortedOdds = [...championOdds].sort((a, b) =>
    sortAsc ? a.odds - b.odds : b.odds - a.odds
  );

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: BG }}>
      {/* ===== 顶部海报 ===== */}
      <div style={{ position: "relative", flexShrink: 0 }}>
        {/* 返回按钮 */}
        <button
          onClick={() => window.history.back()}
          className="absolute top-4 left-4 z-20 w-8 h-8 flex items-center justify-center rounded-full"
          style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
        >
          <ArrowLeft className="w-4 h-4 text-white" />
        </button>

        {/* 海报图片 */}
        <div style={{ width: "100%", aspectRatio: "16/9", overflow: "hidden", position: "relative" }}>
          <img
            src="https://d2xsxph8kpxj0f.cloudfront.net/310519663279996243/ivirPqo3t2YCdg32vqitTK/wc2026-banner-8CUuuGEm5TC7Mio8WLi4z2.webp"
            alt="FIFA World Cup 2026"
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
          {/* 底部渐变过渡到深色背景 */}
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: "40%",
              background: `linear-gradient(to bottom, transparent, ${BG2})`,
            }}
          />
        </div>

        {/* Tab 栏 — 紧贴海报底部，深色背景自然衔接 */}
        <div
          className="flex"
          style={{
            backgroundColor: BG2,
            borderBottom: `2px solid ${BORDER}`,
          }}
        >
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="flex-1 py-3 text-sm font-bold transition-all"
              style={{
                color: activeTab === tab.key ? GOLD : TEXT2,
                borderBottom: activeTab === tab.key ? `2px solid ${GOLD}` : "2px solid transparent",
                marginBottom: "-2px",
                fontSize: tab.key === "champion" ? "12px" : "14px",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ===== 内容区域 ===== */}
      <div className="flex-1 overflow-y-auto pb-8">

        {/* ---- 赛程 Tab ---- */}
        {activeTab === "schedule" && (
          <div>
            {schedule.map((day) => (
              <DayGroup
                key={day.date}
                day={day}
                isToday={day.date === today}
                onMatchClick={(m) => setSelectedMatch(m)}
              />
            ))}
          </div>
        )}

        {/* 比赛详情弹层 */}
        {selectedMatch && (
          <div
            className="fixed inset-0 z-50 flex flex-col"
            style={{ backgroundColor: BG }}
          >
            <div className="flex items-center px-4 py-3" style={{ backgroundColor: BG2, borderBottom: `1px solid ${BORDER}` }}>
              <button onClick={() => setSelectedMatch(null)} className="mr-3">
                <ArrowLeft className="w-5 h-5" style={{ color: TEXT }} />
              </button>
              <span className="text-sm font-bold" style={{ color: TEXT }}>比赛详情</span>
            </div>
            <div className="flex-1 flex flex-col items-center justify-center px-6 gap-6">
              {/* 阶段 */}
              <span
                className="px-4 py-1 rounded-full text-sm font-bold"
                style={{ backgroundColor: stageStyle(selectedMatch.stage).bg, color: stageStyle(selectedMatch.stage).color }}
              >
                {selectedMatch.stage}
              </span>
              {/* 两队 */}
              <div className="flex items-center w-full justify-center gap-4">
                <div className="flex flex-col items-center gap-2 flex-1">
                  <Flag code={selectedMatch.homeCode} size={48} />
                  <span className="text-base font-bold" style={{ color: TEXT }}>{selectedMatch.home}</span>
                </div>
                <span className="text-2xl font-black" style={{ color: GOLD }}>VS</span>
                <div className="flex flex-col items-center gap-2 flex-1">
                  <Flag code={selectedMatch.awayCode} size={48} />
                  <span className="text-base font-bold" style={{ color: TEXT }}>{selectedMatch.away}</span>
                </div>
              </div>
              {/* 时间和场地 */}
              <div className="flex flex-col items-center gap-1">
                <span className="text-2xl font-bold" style={{ color: GOLD }}>{selectedMatch.time}</span>
                <span className="text-xs" style={{ color: TEXT2 }}>北京时间</span>
                {selectedMatch.venue && (
                  <span className="text-sm mt-2" style={{ color: TEXT2 }}>{selectedMatch.venue}</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ---- 档案 Tab ---- */}
        {activeTab === "archive" && (
          <div>
            {/* 子Tab：球队/球员 */}
            <div
              className="flex px-4 pt-4 pb-2 gap-3"
              style={{ backgroundColor: BG }}
            >
              {(["team", "player"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setArchiveView(v)}
                  className="px-5 py-1.5 rounded-full text-sm font-semibold transition-all"
                  style={{
                    backgroundColor: archiveView === v ? GOLD : BG3,
                    color: archiveView === v ? "#000" : TEXT2,
                    border: archiveView === v ? "none" : `1px solid ${BORDER}`,
                  }}
                >
                  {v === "team" ? "球队档案" : "球员档案"}
                </button>
              ))}
            </div>

            {archiveView === "team" && (
              <div>
                {Object.entries(groups).map(([groupName, teams]) => (
                  <div key={groupName}>
                    {/* 组标题 */}
                    <div
                      className="px-4 py-2 flex items-center"
                      style={{ backgroundColor: BG3, borderBottom: `1px solid ${BORDER}` }}
                    >
                      <span
                        className="text-xs font-black px-2 py-0.5 rounded mr-2"
                        style={{ backgroundColor: GOLD, color: "#000" }}
                      >
                        {groupName}
                      </span>
                      <span className="text-xs font-semibold" style={{ color: TEXT2 }}>
                        {groupName} 组
                      </span>
                    </div>
                    {teams.map((team, i) => (
                      <div
                        key={i}
                        className="flex items-center px-4 py-3"
                        style={{ borderBottom: `1px solid ${BORDER}`, backgroundColor: BG }}
                      >
                        <Flag code={team.code} size={28} />
                        <span className="ml-3 text-sm font-medium" style={{ color: TEXT }}>
                          {team.name}
                        </span>
                        <span className="ml-auto text-xs" style={{ color: TEXT2 }}>
                          详情 &gt;
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {archiveView === "player" && (
              <div
                className="flex flex-col items-center justify-center py-20"
                style={{ color: TEXT2 }}
              >
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
                  style={{ backgroundColor: BG3 }}
                >
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={TEXT2} strokeWidth="1.5">
                    <circle cx="12" cy="8" r="4" />
                    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                  </svg>
                </div>
                <p className="text-sm font-medium" style={{ color: TEXT }}>球员档案</p>
                <p className="text-xs mt-1" style={{ color: TEXT2 }}>即将上线，敬请期待</p>
              </div>
            )}
          </div>
        )}

        {/* ---- AI冠军预测 Tab ---- */}
        {activeTab === "champion" && (
          <div>
            {/* 标题区 */}
            <div className="px-4 pt-5 pb-3">
              <div className="flex items-center gap-2 mb-1">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="2">
                  <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
                  <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                  <path d="M4 22h16" />
                  <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
                  <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
                  <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
                </svg>
                <span className="text-base font-bold" style={{ color: TEXT }}>AI 冠军预测</span>
              </div>
              <p className="text-xs" style={{ color: TEXT2 }}>基于AI综合分析，数字越小夺冠概率越高</p>
            </div>

            {/* 排序按钮 */}
            <div className="px-4 pb-3 flex items-center gap-2">
              <span className="text-xs" style={{ color: TEXT2 }}>赔率排序</span>
              <button
                onClick={() => setSortAsc(true)}
                className="px-3 py-1 rounded-full text-xs font-semibold transition-all"
                style={{
                  backgroundColor: sortAsc ? GOLD : BG3,
                  color: sortAsc ? "#000" : TEXT2,
                  border: sortAsc ? "none" : `1px solid ${BORDER}`,
                }}
              >
                低 → 高
              </button>
              <button
                onClick={() => setSortAsc(false)}
                className="px-3 py-1 rounded-full text-xs font-semibold transition-all"
                style={{
                  backgroundColor: !sortAsc ? GOLD : BG3,
                  color: !sortAsc ? "#000" : TEXT2,
                  border: !sortAsc ? "none" : `1px solid ${BORDER}`,
                }}
              >
                高 → 低
              </button>
            </div>

            {/* 4列国旗网格 */}
            <div
              className="grid grid-cols-4 px-2 pb-6"
              style={{ gap: "1px", backgroundColor: BORDER }}
            >
              {sortedOdds.map((team) => (
                <div
                  key={team.code + team.name}
                  className="flex flex-col items-center py-4 px-1"
                  style={{ backgroundColor: BG, gap: 4 }}
                >
                  <Flag code={team.code} size={36} />
                  <span
                    className="text-xs font-semibold text-center leading-tight mt-1"
                    style={{ color: TEXT }}
                  >
                    {team.name}
                  </span>
                  <span
                    className="text-xs text-center leading-tight"
                    style={{ color: TEXT2, fontSize: "10px" }}
                  >
                    {team.nameEn}
                  </span>
                  <span
                    className="text-sm font-black mt-0.5"
                    style={{ color: GOLD }}
                  >
                    {team.odds.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
