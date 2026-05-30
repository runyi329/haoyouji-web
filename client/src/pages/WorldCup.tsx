import { ArrowLeft, ChevronRight, Settings } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Link } from "wouter";
import { PageTag } from "@/components/PageTag";
import { trpc } from "@/lib/trpc";

// ===== 颜色常量 =====
const BG = "#0D1B2A";        // 深藏青主背景
const BG2 = "#112236";       // 次级背景
const BG3 = "#162C42";       // 卡片背景
const GOLD = "#FFD700";      // 金色高亮
const GOLD2 = "#E8B800";     // 金色次级
const TEXT = "#E8EDF2";      // 主文字
const TEXT2 = "#8FA3B8";     // 次级文字
const BORDER = "rgba(255,255,255,0.08)"; // 分隔线

// ===== 国旗图片（使用本地public/flags目录） =====
function Flag({ code, size = 28 }: { code: string; size?: number }) {
  const c = code.toLowerCase();
  return (
    <img
      src={`/flags/${c}.png`}
      width={size}
      height={Math.round(size * 0.67)}
      alt={code}
      style={{ borderRadius: 2, objectFit: "cover", display: "inline-block", flexShrink: 0 }}
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
    date: "2026-06-26",
    dateLabel: "6月26日 周五",
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
  // ===== 32强（Round of 32）：6月28日 - 7月3日 =====
  {
    date: "2026-06-28",
    dateLabel: "6月28日 周日",
    matches: [
      { home: "A组第2名", homeCode: "un", away: "B组第2名", awayCode: "un", time: "待定", venue: "英格尔伍德", stage: "32强" },
    ],
  },
  {
    date: "2026-06-29",
    dateLabel: "6月29日 周一",
    matches: [
      { home: "C组第1名", homeCode: "un", away: "F组第2名", awayCode: "un", time: "待定", venue: "休斯顿", stage: "32强" },
      { home: "E组第1名", homeCode: "un", away: "最佳第三名(A/B/C/D/F组)", awayCode: "un", time: "待定", venue: "福克斯伯勒", stage: "32强" },
      { home: "F组第1名", homeCode: "un", away: "C组第2名", awayCode: "un", time: "待定", venue: "蒙特雷", stage: "32强" },
    ],
  },
  {
    date: "2026-06-30",
    dateLabel: "6月30日 周二",
    matches: [
      { home: "E组第2名", homeCode: "un", away: "I组第2名", awayCode: "un", time: "待定", venue: "阿灵顿", stage: "32强" },
      { home: "I组第1名", homeCode: "un", away: "最佳第三名(C/D/F/G/H组)", awayCode: "un", time: "待定", venue: "东卢瑟福", stage: "32强" },
      { home: "A组第1名", homeCode: "un", away: "最佳第三名(C/E/F/H/I组)", awayCode: "un", time: "待定", venue: "墨西哥城", stage: "32强" },
    ],
  },
  {
    date: "2026-07-01",
    dateLabel: "7月1日 周三",
    matches: [
      { home: "L组第1名", homeCode: "un", away: "最佳第三名(E/H/I/J/K组)", awayCode: "un", time: "待定", venue: "亚特兰大", stage: "32强" },
      { home: "G组第1名", homeCode: "un", away: "最佳第三名(A/E/H/I/J组)", awayCode: "un", time: "待定", venue: "西雅图", stage: "32强" },
      { home: "D组第1名", homeCode: "un", away: "最佳第三名(B/E/F/I/J组)", awayCode: "un", time: "待定", venue: "圣克拉拉", stage: "32强" },
    ],
  },
  {
    date: "2026-07-02",
    dateLabel: "7月2日 周四",
    matches: [
      { home: "H组第1名", homeCode: "un", away: "J组第2名", awayCode: "un", time: "待定", venue: "英格尔伍德", stage: "32强" },
      { home: "K组第2名", homeCode: "un", away: "L组第2名", awayCode: "un", time: "待定", venue: "多伦多", stage: "32强" },
      { home: "B组第1名", homeCode: "un", away: "最佳第三名(E/F/G/I/J组)", awayCode: "un", time: "待定", venue: "温哥华", stage: "32强" },
    ],
  },
  {
    date: "2026-07-03",
    dateLabel: "7月3日 周五",
    matches: [
      { home: "D组第2名", homeCode: "un", away: "G组第2名", awayCode: "un", time: "待定", venue: "阿灵顿", stage: "32强" },
      { home: "J组第1名", homeCode: "un", away: "H组第2名", awayCode: "un", time: "待定", venue: "迈阿密", stage: "32强" },
      { home: "K组第1名", homeCode: "un", away: "最佳第三名(D/E/I/J/L组)", awayCode: "un", time: "待定", venue: "堪萨斯城", stage: "32强" },
    ],
  },
  // ===== 16强（Round of 16）：7月4日 - 7月7日 =====
  {
    date: "2026-07-04",
    dateLabel: "7月4日 周六",
    matches: [
      { home: "32强胜者", homeCode: "un", away: "32强胜者", awayCode: "un", time: "待定", venue: "休斯顿", stage: "16强" },
      { home: "32强胜者", homeCode: "un", away: "32强胜者", awayCode: "un", time: "待定", venue: "费城", stage: "16强" },
    ],
  },
  {
    date: "2026-07-05",
    dateLabel: "7月5日 周日",
    matches: [
      { home: "32强胜者", homeCode: "un", away: "32强胜者", awayCode: "un", time: "待定", venue: "东卢瑟福", stage: "16强" },
      { home: "32强胜者", homeCode: "un", away: "32强胜者", awayCode: "un", time: "待定", venue: "墨西哥城", stage: "16强" },
    ],
  },
  {
    date: "2026-07-06",
    dateLabel: "7月6日 周一",
    matches: [
      { home: "32强胜者", homeCode: "un", away: "32强胜者", awayCode: "un", time: "待定", venue: "阿灵顿", stage: "16强" },
      { home: "32强胜者", homeCode: "un", away: "32强胜者", awayCode: "un", time: "待定", venue: "西雅图", stage: "16强" },
    ],
  },
  {
    date: "2026-07-07",
    dateLabel: "7月7日 周二",
    matches: [
      { home: "32强胜者", homeCode: "un", away: "32强胜者", awayCode: "un", time: "待定", venue: "亚特兰大", stage: "16强" },
      { home: "32强胜者", homeCode: "un", away: "32强胜者", awayCode: "un", time: "待定", venue: "温哥华", stage: "16强" },
    ],
  },
  // ===== 四分之一决赛（8强）：7月9日 - 7月11日 =====
  {
    date: "2026-07-09",
    dateLabel: "7月9日 周四",
    matches: [
      { home: "16强胜者", homeCode: "un", away: "16强胜者", awayCode: "un", time: "待定", venue: "福克斯伯勒", stage: "8强" },
    ],
  },
  {
    date: "2026-07-10",
    dateLabel: "7月10日 周五",
    matches: [
      { home: "16强胜者", homeCode: "un", away: "16强胜者", awayCode: "un", time: "待定", venue: "英格尔伍德", stage: "8强" },
    ],
  },
  {
    date: "2026-07-11",
    dateLabel: "7月11日 周六",
    matches: [
      { home: "16强胜者", homeCode: "un", away: "16强胜者", awayCode: "un", time: "待定", venue: "迈阿密", stage: "8强" },
      { home: "16强胜者", homeCode: "un", away: "16强胜者", awayCode: "un", time: "待定", venue: "堪萨斯城", stage: "8强" },
    ],
  },
  // ===== 半决赛：7月14日 - 7月15日 =====
  {
    date: "2026-07-14",
    dateLabel: "7月14日 周二",
    matches: [
      { home: "8强胜者", homeCode: "un", away: "8强胜者", awayCode: "un", time: "待定", venue: "阿灵顿", stage: "4强" },
    ],
  },
  {
    date: "2026-07-15",
    dateLabel: "7月15日 周三",
    matches: [
      { home: "8强胜者", homeCode: "un", away: "8强胜者", awayCode: "un", time: "待定", venue: "亚特兰大", stage: "4强" },
    ],
  },
  // ===== 季军赛：7月18日 =====
  {
    date: "2026-07-18",
    dateLabel: "7月18日 周五",
    matches: [
      { home: "半决赛负者1", homeCode: "un", away: "半决赛负者2", awayCode: "un", time: "待定", venue: "迈阿密", stage: "季军赛" },
    ],
  },
  // ===== 决赛：7月19日 =====
  {
    date: "2026-07-19",
    dateLabel: "7月19日 周日",
    matches: [
      { home: "冠军", homeCode: "un", away: "亚军", awayCode: "un", time: "待定", venue: "大都会球场(东卢瑟福)", stage: "决赛" },
    ],
  },
];

// ===== 分组数据 =====
// ===== 国旗裁剪锁点配置 =====
// 根据各国国旗视觉重心位置，配置最优object-position裁剪锁点
// 格式： "x% y%" 或 "left/center/right top/center/bottom"
const FLAG_POSITION: Record<string, string> = {
  // 左上角有重要图案（五角星、标志等）→ 锁定左上
  "cn": "15% 25%",   // 中国：五角星在左上
  "vn": "15% 25%",   // 越南：星在左上
  "mm": "20% 30%",   // 缅甸：星在左上
  "kp": "20% 30%",   // 朝鲜：左上图案
  "tl": "20% 30%",   // 东帝汶：左上图案

  // 中心图案（圆形、盾形、十字等）→ 居中裁剪
  "jp": "center center", // 日本：红圆居中
  "br": "center center", // 巴西：菱形+圆居中
  "de": "center center", // 德国：三色条居中
  "fr": "center center", // 法国：三色居中
  "es": "center center", // 西班牙：盾形居中
  "gb-eng": "center center", // 英格兰：十字居中
  "gb-sct": "center center", // 苏格兰：十字居中
  "ch": "center center", // 瑞士：十字居中
  "pt": "center center", // 葡萄牙：盾形居中
  "ar": "center center", // 阿根廷：太阳居中
  "uy": "center center", // 乌拉圭：太阳居中
  "nl": "center center", // 荷兰：三色条居中
  "be": "center center", // 比利时：三色条居中
  "hr": "center center", // 克罗地亚：盾形居中
  "se": "center center", // 瑞典：十字居中
  "no": "center center", // 挪威：十字居中
  "at": "center center", // 奥地利：三色条居中
  "ec": "center center", // 厄瓜多尔：盾形居中
  "co": "center center", // 哥伦比亚：三色条居中
  "py": "center center", // 巴拉圭：盾形居中
  "eg": "center center", // 埃及：鹰居中
  "ma": "center center", // 摩洛哥：星居中
  "tn": "center center", // 突尼斯：月星居中
  "sn": "center center", // 塞内加尔：星居中
  "gh": "center center", // 加纳：星居中
  "ir": "center center", // 伊朗：中心文字居中
  "iq": "center center", // 伊拉克：中心文字居中
  "sa": "center center", // 沙特：居中
  "qa": "center center", // 卡塔尔：居中
  "nz": "center center", // 新西兰：居中
  "au": "center center", // 澳大利亚：居中
  "kr": "center center", // 韩国：太极居中
  "jo": "center center", // 约旦：星居中
  "dz": "center center", // 阿尔及利亚：月星居中
  "uz": "center center", // 乌兹别克：居中
  "cd": "center center", // 刚果(金)：居中
  "cv": "center center", // 佛得角：星居中
  "cw": "center center", // 库拉索：星居中
  "ci": "center center", // 科特迪瓦：三色条居中
  "pa": "center center", // 巴拿马：居中
  "ht": "center center", // 海地：居中
  "ba": "center center", // 波黑：星居中
  "za": "center center", // 南非：居中
  "ca": "center center", // 加拿大：枚叶居中
  "us": "center center", // 美国：居中
  "mx": "center center", // 墨西哥：盾形居中
  "cz": "center center", // 捷克：三色居中
  "tr": "center center", // 土耳其：月星居中
};

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

// ===== 赛果 Tab =====
interface TeamStanding {
  name: string;
  code: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  points: number;
}

interface KnockoutMatch {
  homeCode: string;
  homeName: string;
  awayCode: string;
  awayName: string;
  homeScore: number | null;
  awayScore: number | null;
  stage: string;
  id: string;
}

function initStandings(teams: { name: string; code: string }[]): TeamStanding[] {
  return teams.map(t => ({ name: t.name, code: t.code, played: 0, won: 0, drawn: 0, lost: 0, points: 0 }));
}

const knockoutMatches: KnockoutMatch[] = [
  ...Array.from({ length: 16 }, (_, i) => ({
    homeCode: "un", homeName: "待定", awayCode: "un", awayName: "待定",
    homeScore: null, awayScore: null, stage: "32强", id: `R32-${i + 1}`,
  })),
  ...Array.from({ length: 8 }, (_, i) => ({
    homeCode: "un", homeName: "32强胜者", awayCode: "un", awayName: "32强胜者",
    homeScore: null, awayScore: null, stage: "16强", id: `R16-${i + 1}`,
  })),
  ...Array.from({ length: 4 }, (_, i) => ({
    homeCode: "un", homeName: "16强胜者", awayCode: "un", awayName: "16强胜者",
    homeScore: null, awayScore: null, stage: "8强", id: `QF-${i + 1}`,
  })),
  ...Array.from({ length: 2 }, (_, i) => ({
    homeCode: "un", homeName: "8强胜者", awayCode: "un", awayName: "8强胜者",
    homeScore: null, awayScore: null, stage: "4强", id: `SF-${i + 1}`,
  })),
  { homeCode: "un", homeName: "4强负者", awayCode: "un", awayName: "4强负者", homeScore: null, awayScore: null, stage: "季军赛", id: "3rd" },
  { homeCode: "un", homeName: "4强胜者", awayCode: "un", awayName: "4强胜者", homeScore: null, awayScore: null, stage: "决赛", id: "Final" },
];

// ===== 淘汰赛 Bracket 对阵图（经典左右对称，全宽 SVG viewBox 自适应）=====
// 布局：左4列(32强→16强→8强→4强) + 中间决赛 + 右4列
// 每格只放一个国旗，用 viewBox 自动缩放适配手机宽度，线条和国旗同比例缩放

// 逻辑坐标系（固定大小，由viewBox缩放到屏幕）
// 卡片：宽36高32，内部两行各放一个国旗
const B = {
  CW: 20,    // 卡片宽（单个国旗的宽）
  CH: 40,    // 卡片高（两个正方形格子叠加）
  CGAP: 5,   // 列间距
  RGAP: 4,   // 行间距
  FW: 20,    // 国旗宽（铺满列宽）
  FH: 20,    // 国旗高（正方形）
  HALF: 8,   // 左半区行数
  TPAD: 4,   // 顶部无标签，只留少量padding
  NCOLS: 9,  // 总列数
};

// 左半区总高
const B_TOTAL_H = B.HALF * B.CH + (B.HALF - 1) * B.RGAP;
// SVG逻辑宽高
const B_SVG_W = B.NCOLS * B.CW + (B.NCOLS - 1) * B.CGAP;

// 计算某列某行卡片的中心Y
function bCY(col: number, idx: number): number {
  const count = B.HALF / Math.pow(2, col);
  const blockH = count * B.CH + (count - 1) * B.RGAP;
  const startY = B.TPAD + (B_TOTAL_H - blockH) / 2;
  if (col === 0) return startY + idx * (B.CH + B.RGAP) + B.CH / 2;
  return (bCY(col - 1, idx * 2) + bCY(col - 1, idx * 2 + 1)) / 2;
}

// 列X起始坐标
function bX(col: number): number {
  return col * (B.CW + B.CGAP);
}

// 阶段标签颜色
const STAGE_COLORS: Record<string, { bg: string; text: string }> = {
  "32强": { bg: "#1a2a3a", text: TEXT2 },
  "16强": { bg: "#1a4a2b", text: "#7FFFA0" },
  "8强":  { bg: "#1a3a8b", text: "#8ab4ff" },
  "4强":  { bg: "#6b0010", text: "#ffaaaa" },
  "决赛": { bg: GOLD, text: "#000" },
};

// 单个对阵格：国旗直接铺满格子，无外框
function BSlot({ m, x, y, isTop, highlight }: {
  m: KnockoutMatch; x: number; y: number; isTop: boolean; highlight?: boolean;
}) {
  const code = isTop ? m.homeCode : m.awayCode;
  const pending = code === "un";
  const slotH = B.CH / 2;
  return (
    <g>
      {pending ? (
        // 未确定：虚线占位框铺满格子
        <rect x={x} y={y} width={B.CW} height={slotH} rx={1}
          fill={highlight ? "rgba(255,215,0,0.08)" : "rgba(255,255,255,0.04)"}
          stroke={highlight ? GOLD : "rgba(255,255,255,0.18)"}
          strokeWidth={highlight ? 0.8 : 0.5} strokeDasharray="2,1" />
      ) : (
        // 有国旗：直接铺满，无外框
        <image href={`/flags/${code.toLowerCase()}.png`}
          x={x} y={y} width={B.CW} height={slotH}
          preserveAspectRatio="none" />
      )}
    </g>
  );
}

// 完整对阵卡片：两个格垂直叠加
function BCard2({ m, x, y, highlight }: { m: KnockoutMatch; x: number; y: number; highlight?: boolean }) {
  return (
    <g>
      <BSlot m={m} x={x} y={y} isTop highlight={highlight} />
      <BSlot m={m} x={x} y={y + B.CH / 2} isTop={false} highlight={highlight} />
    </g>
  );
}

function BracketView({ groups }: { groups: Record<string, { name: string; code: string }[]> }) {
  const r32   = knockoutMatches.filter(m => m.stage === "32强");
  const r16   = knockoutMatches.filter(m => m.stage === "16强");
  const qf    = knockoutMatches.filter(m => m.stage === "8强");
  const sf    = knockoutMatches.filter(m => m.stage === "4强");
  const final = knockoutMatches.find(m => m.stage === "决赛")!;
  const third = knockoutMatches.find(m => m.stage === "季军赛")!;

  const leftRounds  = [r32.slice(0, 8), r16.slice(0, 4), qf.slice(0, 2), [sf[0]]];
  const rightRounds = [r32.slice(8, 16), r16.slice(4, 8), qf.slice(2, 4), [sf[1]]];

  const colLabels = ["32强", "16强", "8强", "4强", "决赛", "4强", "8强", "16强", "32强"];

  // 决赛居中
const finalCY = B.TPAD + B_TOTAL_H / 2;
  const finalY  = finalCY - B.CH / 2;
  const thirdY  = finalY + B.CH + 6;
  const svgH = Math.max(B.TPAD + B_TOTAL_H + 8, thirdY + B.CH + 8);

  const lineColor = "rgba(255,255,255,0.25)";

  return (
    <div style={{ paddingBottom: 24, paddingLeft: 12, paddingRight: 12 }}>
      {/* SVG 全宽自适应， viewBox 固定逻辑坐标，自动缩放 */}
      <svg
        viewBox={`0 0 ${B_SVG_W} ${svgH}`}
        width="100%"
        style={{ display: "block" }}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* 顶部阶段标签已移除 */}

        {/* 左半区卡片 + 连线 */}
        {leftRounds.map((roundMatches, col) =>
          roundMatches.map((m, idx) => {
            const x  = bX(col);
            const cy = bCY(col, idx);
            const y  = cy - B.CH / 2;
            return (
              <g key={m.id}>
                <BCard2 m={m} x={x} y={y} />
                {col < 3 && (
                  <path
                    d={`M${x + B.CW},${cy} H${x + B.CW + B.CGAP / 2} V${bCY(col + 1, Math.floor(idx / 2))} H${bX(col + 1)}`}
                    fill="none" stroke={lineColor} strokeWidth={0.6}
                  />
                )}
              </g>
            );
          })
        )}

        {/* 左4强 → 决赛 */}
        <path d={`M${bX(3) + B.CW},${bCY(3, 0)} H${bX(4)}`}
          fill="none" stroke={GOLD} strokeWidth={0.8} strokeDasharray="2,2" />

        {/* 决赛卡片 */}
        <BCard2 m={final} x={bX(4)} y={finalY} highlight />

        {/* 季军赛 */}
        <text x={bX(4) + B.CW / 2} y={thirdY - 2} fontSize={6}
          fill={TEXT2} fontFamily="system-ui,sans-serif" textAnchor="middle">季军</text>
        <BCard2 m={third} x={bX(4)} y={thirdY} />

        {/* 右半区卡片 + 连线（镜像）*/}
        {rightRounds.map((roundMatches, col) => {
          const svgCol = 8 - col;
          return roundMatches.map((m, idx) => {
            const x  = bX(svgCol);
            const cy = bCY(col, idx);
            const y  = cy - B.CH / 2;
            return (
              <g key={m.id}>
                <BCard2 m={m} x={x} y={y} />
                {col < 3 && (
                  <path
                    d={`M${x},${cy} H${x - B.CGAP / 2} V${bCY(col + 1, Math.floor(idx / 2))} H${bX(svgCol - 1) + B.CW}`}
                    fill="none" stroke={lineColor} strokeWidth={0.6}
                  />
                )}
              </g>
            );
          });
        })}

        {/* 右4强 → 决赛 */}
        <path d={`M${bX(5)},${bCY(3, 0)} H${bX(4) + B.CW}`}
          fill="none" stroke={GOLD} strokeWidth={0.8} strokeDasharray="2,2" />
      </svg>

      {/* ===== 底部分组国旗阵列 ===== */}
      {/* A–L 共 12 组，每组一列：组标签 + 4 个国旗竖排（正方形拉伸） */}
      <div style={{ marginTop: 16 }}>
        <div className="flex items-center gap-2 px-3 py-1.5" style={{ backgroundColor: BG3 }}>
          <span style={{ backgroundColor: GOLD, color: "#000", borderRadius: 2, fontSize: 9, fontWeight: 900, padding: "1px 5px" }}>GROUPS</span>
        </div>
        <div className="flex" style={{ borderBottom: `1px solid ${BORDER}`, paddingTop: 4, paddingBottom: 4 }}>
          {["A","B","C","D","E","F","G","H","I","J","K","L"].map(g => (
            <div key={g} className="flex-1 flex flex-col items-center"
              style={{ borderRight: `1px solid ${BORDER}`, gap: 3, paddingTop: 4, paddingBottom: 4 }}>
              {/* 组标签 */}
              <span style={{ color: GOLD, fontSize: 8, fontWeight: 900, lineHeight: 1 }}>{g}</span>
              {/* 4 个国旗竖排，正方形裁剪，根据国旗视觉重心居中裁剪 */}
              {(groups[g] || []).map(t => (
                <img
                  key={t.code}
                  src={`/flags/${t.code.toLowerCase()}.png`}
                  alt={t.name}
                  title={t.name}
                  style={{
                    width: "80%",
                    aspectRatio: "1 / 1",
                    display: "block",
                    borderRadius: 1,
                    objectFit: "fill",
                  }}
                  onError={(e) => { (e.target as HTMLImageElement).style.opacity = "0.15"; }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ResultsTab({ groups }: { groups: Record<string, { name: string; code: string }[]> }) {
  const [view, setView] = useState<"group" | "knockout">("group");

  const stageColor = (stage: string) => {
    if (stage === "决赛") return { bg: GOLD, text: "#000" };
    if (stage === "季军赛") return { bg: "#6b4c00", text: GOLD };
    if (stage === "4强") return { bg: "#C0001A", text: "#fff" };
    if (stage === "8强") return { bg: "#1a3a8b", text: "#fff" };
    if (stage === "16强") return { bg: "#1a4a2b", text: "#7FFFA0" };
    return { bg: BG3, text: TEXT2 };
  };

  return (
    <div>
      {/* 子Tab切换 */}
      <div className="flex" style={{ backgroundColor: BG2, borderBottom: `1px solid ${BORDER}` }}>
        {([{ key: "group" as const, label: "小组赛积分" }, { key: "knockout" as const, label: "淘汰赛对阵" }]).map(t => (
          <button
            key={t.key}
            onClick={() => setView(t.key)}
            className="flex-1 py-2.5 text-sm font-semibold transition-all"
            style={{
              color: view === t.key ? GOLD : TEXT2,
              borderBottom: view === t.key ? `2px solid ${GOLD}` : "2px solid transparent",
              marginBottom: "-1px",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 小组赛积分榜 */}
      {view === "group" && (
        <div className="pb-8">
          {Object.entries(groups).map(([groupName, teams]) => {
            const standings = initStandings(teams);
            return (
              <div key={groupName} className="mb-1">
                <div className="flex items-center px-4 py-2" style={{ backgroundColor: BG3, borderBottom: `1px solid ${BORDER}` }}>
                  <span className="text-xs font-black px-2 py-0.5 mr-2" style={{ backgroundColor: GOLD, color: "#000", borderRadius: 2 }}>
                    {groupName}
                  </span>
                  <span className="text-xs font-semibold" style={{ color: TEXT2 }}>{groupName} 组</span>
                </div>
                {/* 表头 */}
                <div className="flex items-center px-4 py-1.5" style={{ backgroundColor: BG2, borderBottom: `1px solid ${BORDER}` }}>
                  <span className="flex-1 text-xs" style={{ color: TEXT2 }}>球队</span>
                  {["场", "胜", "平", "负", "积分"].map(h => (
                    <span key={h} className="text-xs font-semibold text-center" style={{ color: TEXT2, width: 32 }}>{h}</span>
                  ))}
                </div>
                {/* 球队行 */}
                {standings.map((s, i) => (
                  <div
                    key={s.code}
                    className="flex items-center px-4 py-2.5"
                    style={{ backgroundColor: i % 2 === 0 ? BG : BG2, borderBottom: `1px solid ${BORDER}` }}
                  >
                    <span className="text-xs font-bold mr-2 flex-shrink-0" style={{ color: i < 2 ? GOLD : TEXT2, width: 14 }}>
                      {i + 1}
                    </span>
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <Flag code={s.code} size={20} />
                      <span className="text-sm font-medium truncate" style={{ color: i < 2 ? TEXT : TEXT2 }}>{s.name}</span>
                    </div>
                    {[s.played, s.won, s.drawn, s.lost].map((v, j) => (
                      <span key={j} className="text-sm text-center" style={{ color: TEXT2, width: 32 }}>{v}</span>
                    ))}
                    <span className="text-sm font-black text-center" style={{ color: GOLD, width: 32 }}>{s.points}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* 淘汰赛对阵 - 经典左右对称Bracket图 */}
      {view === "knockout" && <BracketView groups={groups} />}
    </div>
  );
}

type TabType = "schedule" | "results" | "archive" | "champion";

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

      {/* 比赛列表（常驻展开，全内容单行自适应屏宽） */}
      {day.matches.map((match, i) => (
        <button
          key={i}
          onClick={() => onMatchClick(match)}
          className="w-full flex items-center text-left transition-colors active:opacity-70"
          style={{
            backgroundColor: BG,
            borderBottom: `1px solid ${BORDER}`,
            height: 56,
            paddingLeft: 8,
            paddingRight: 6,
            gap: 0,
            overflow: "hidden",
          }}
        >
          {/* 左区：单行布局，阶段标签+时间同行 */}
          <div
            className="flex items-center flex-shrink-0"
            style={{ gap: 4, marginRight: 4, width: 130, overflow: "hidden" }}
          >
            <span
              style={{
                backgroundColor: stageStyle(match.stage).bg,
                color: stageStyle(match.stage).color,
                fontSize: "11px",
                fontWeight: 700,
                padding: "1px 5px",
                borderRadius: 3,
                whiteSpace: "nowrap",
                lineHeight: "16px",
                flexShrink: 0,
              }}
            >
              {match.stage}
            </span>
            <span style={{ color: GOLD, fontSize: "12px", fontWeight: 700, whiteSpace: "nowrap", flexShrink: 0 }}>
              {match.time || "待定"}
            </span>
          </div>

          {/* 中区：三列固定宽度，VS居中固定对齐 */}
          <div
            className="flex items-center flex-1"
            style={{ minWidth: 0, overflow: "hidden" }}
          >
            {/* 主队：右对齐 */}
            <div className="flex items-center justify-end" style={{ flex: "1 1 0", minWidth: 0, gap: 3, overflow: "hidden" }}>
              <span
                style={{
                  color: TEXT,
                  fontSize: "13px",
                  fontWeight: 500,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >{match.home}</span>
              <Flag code={match.homeCode} size={18} />
            </div>
            {/* VS：固定宽度居中 */}
            <div className="flex items-center justify-center flex-shrink-0" style={{ width: 28 }}>
              <span style={{ color: GOLD, fontSize: "12px", fontWeight: 900 }}>VS</span>
            </div>
            {/* 客队：左对齐 */}
            <div className="flex items-center justify-start" style={{ flex: "1 1 0", minWidth: 0, gap: 3, overflow: "hidden" }}>
              <Flag code={match.awayCode} size={18} />
              <span
                style={{
                  color: TEXT,
                  fontSize: "13px",
                  fontWeight: 500,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >{match.away}</span>
            </div>
          </div>

          {/* 右侧小箭头 */}
          <ChevronRight className="flex-shrink-0" style={{ color: TEXT2, width: 13, height: 13, marginLeft: 4 }} />
        </button>
      ))}
    </div>
  );
}

// ===== 主组件 =====
export default function WorldCup() {
  const [activeTab, setActiveTab] = useState<TabType>("schedule");
  const today = new Date().toISOString().slice(0, 10);
  const [archiveView, setArchiveView] = useState<"team" | "player">("team");
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const { user } = useAuth();
  const isAdmin = user?.role === 'super_admin';

  const tabs: { key: TabType; label: string }[] = [
    { key: "schedule", label: "赛程" },
    { key: "results", label: "赛果" },
    { key: "archive", label: "档案" },
    { key: "champion", label: "AI冠军预测" },
  ];

  // 从 P012 最新快照拉取实时赔率
  const { data: liveOddsData, isLoading: liveOddsLoading } = trpc.wcOdds.getLatestChampionOdds.useQuery();

  // 如果有实时数据就用实时数据，否则备用静态数据
  const sortedOdds = liveOddsData && liveOddsData.teams.length > 0
    ? liveOddsData.teams
        .filter(t => t.pinnacleOdds !== null)
        .map(t => ({
          name: t.name,
          nameEn: t.code.toUpperCase(),
          code: t.code,
          odds: parseFloat(t.pinnacleOdds!),
        }))
        .sort((a, b) => a.odds - b.odds)
    : [...championOdds].sort((a, b) => a.odds - b.odds);

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: BG }}>
      <PageTag code="P011" />
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

        {/* 右上角按钮组 */}
        <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
          {/* 管理员设置入口 */}
          {isAdmin && (
            <Link href="/world-cup/admin">
              <button
                className="w-8 h-8 flex items-center justify-center rounded-full"
                style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
                title="管理设置"
              >
                <Settings className="w-4 h-4 text-white" />
              </button>
            </Link>
          )}
          {/* 刷新按钮 */}
          <button
            onClick={() => window.location.reload()}
            className="px-3 h-8 flex items-center justify-center rounded-full text-xs font-semibold"
            style={{ backgroundColor: "rgba(0,0,0,0.45)", color: "#fff" }}
          >
            刷新
          </button>
        </div>

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

        {/* ---- 赛果 Tab ---- */}
        {activeTab === "results" && (
          <ResultsTab groups={groups} />
        )}

        {/* ---- 档案 Tab ---- */}
        {activeTab === "archive" && (
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
                  <Link key={i} href={`/world-cup/teams/${team.code}`}>
                    <div
                      className="flex items-center px-4 py-3 cursor-pointer"
                      style={{ borderBottom: `1px solid ${BORDER}`, backgroundColor: BG }}
                    >
                      <Flag code={team.code} size={28} />
                      <span className="ml-3 text-sm font-medium" style={{ color: TEXT }}>
                        {team.name}
                      </span>
                      <span className="ml-auto text-xs" style={{ color: GOLD2 }}>
                        查看档案 &gt;
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* ---- AI冠军预测 Tab ---- */}
        {activeTab === "champion" && (
          <div>
            {/* 数据来源标注 */}
            <div className="flex items-center justify-between px-4 py-2" style={{ borderBottom: `1px solid ${BORDER}` }}>
              <span className="text-xs" style={{ color: TEXT2 }}>
                {liveOddsLoading ? "正在加载最新赔率..."
                  : liveOddsData && liveOddsData.teams.length > 0
                    ? `Pinnacle 实时赔率 · 共 ${sortedOdds.length} 支球队`
                    : "暂无实时数据，显示备用赔率"}
              </span>
              {liveOddsData?.fetchedAt && (
                <span className="text-xs" style={{ color: TEXT2 }}>
                  更新: {new Date(liveOddsData.fetchedAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
            </div>
            {/* 4列国旗网格：国旗统一尺寸，国家名在同一高度 */}
            <div
              className="grid grid-cols-4 px-2 pb-6"
              style={{ gap: "1px", backgroundColor: BORDER }}
            >
              {sortedOdds.map((team) => (
                <div
                  key={team.code + team.name}
                  className="flex flex-col items-center py-3 px-1"
                  style={{ backgroundColor: BG, gap: 0 }}
                >
                  {/* 国旗统一宽高，object-fit:cover拉伸裁切 */}
                  <div style={{ width: 48, height: 32, flexShrink: 0, overflow: "hidden", borderRadius: 3 }}>
                    <img
                      src={`/flags/${team.code.toLowerCase()}.png`}
                      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                      alt={team.name}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  </div>
                  {/* 中英文名在国旗下方，固定高度展示区域确保对齐 */}
                  <div style={{ height: 32, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", marginTop: 4 }}>
                    <span
                      className="text-xs font-semibold text-center leading-tight"
                      style={{ color: TEXT }}
                    >
                      {team.name}
                    </span>
                    <span
                      className="text-center leading-tight"
                      style={{ color: TEXT2, fontSize: "9px" }}
                    >
                      {team.nameEn}
                    </span>
                  </div>
                  <span
                    className="text-sm font-black"
                    style={{ color: GOLD, marginTop: 2 }}
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
