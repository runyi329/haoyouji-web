import { useLocation } from "wouter";
import { ArrowLeft, ChevronDown, ChevronRight, Trophy, Star } from "lucide-react";
import { useState } from "react";

// ===== 完整赛程数据（按日期） =====
interface Match {
  home: string;
  homeFlag: string;
  away: string;
  awayFlag: string;
  time?: string;
  venue?: string;
  stage: string;
}

interface DaySchedule {
  date: string;       // "2026-06-11"
  dateLabel: string;  // "6月11日 周四"
  matches: Match[];
}

const schedule: DaySchedule[] = [
  {
    date: "2026-06-11",
    dateLabel: "6月11日 周四",
    matches: [
      { home: "墨西哥", homeFlag: "🇲🇽", away: "南非", awayFlag: "🇿🇦", time: "03:00", venue: "墨西哥城", stage: "A组" },
      { home: "韩国", homeFlag: "🇰🇷", away: "捷克", awayFlag: "🇨🇿", time: "10:00", venue: "瓜达拉哈拉", stage: "A组" },
    ],
  },
  {
    date: "2026-06-12",
    dateLabel: "6月12日 周五",
    matches: [
      { home: "加拿大", homeFlag: "🇨🇦", away: "波黑", awayFlag: "🇧🇦", time: "03:00", venue: "多伦多", stage: "B组" },
      { home: "美国", homeFlag: "🇺🇸", away: "巴拉圭", awayFlag: "🇵🇾", time: "09:00", venue: "英格尔伍德", stage: "D组" },
    ],
  },
  {
    date: "2026-06-13",
    dateLabel: "6月13日 周六",
    matches: [
      { home: "卡塔尔", homeFlag: "🇶🇦", away: "瑞士", awayFlag: "🇨🇭", time: "03:00", venue: "圣克拉拉", stage: "B组" },
      { home: "巴西", homeFlag: "🇧🇷", away: "摩洛哥", awayFlag: "🇲🇦", time: "06:00", venue: "东卢瑟福", stage: "C组" },
      { home: "海地", homeFlag: "🇭🇹", away: "苏格兰", awayFlag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", time: "09:00", venue: "福克斯伯勒", stage: "C组" },
      { home: "澳大利亚", homeFlag: "🇦🇺", away: "土耳其", awayFlag: "🇹🇷", time: "12:00", venue: "温哥华", stage: "D组" },
    ],
  },
  {
    date: "2026-06-14",
    dateLabel: "6月14日 周日",
    matches: [
      { home: "德国", homeFlag: "🇩🇪", away: "库拉索", awayFlag: "🇨🇼", time: "01:00", venue: "休斯顿", stage: "E组" },
      { home: "荷兰", homeFlag: "🇳🇱", away: "日本", awayFlag: "🇯🇵", time: "04:00", venue: "阿灵顿", stage: "F组" },
      { home: "科特迪瓦", homeFlag: "🇨🇮", away: "厄瓜多尔", awayFlag: "🇪🇨", time: "07:00", venue: "费城", stage: "E组" },
      { home: "瑞典", homeFlag: "🇸🇪", away: "突尼斯", awayFlag: "🇹🇳", time: "10:00", venue: "蒙特雷", stage: "F组" },
    ],
  },
  {
    date: "2026-06-15",
    dateLabel: "6月15日 周一",
    matches: [
      { home: "比利时", homeFlag: "🇧🇪", away: "埃及", awayFlag: "🇪🇬", time: "03:00", venue: "西雅图", stage: "G组" },
      { home: "西班牙", homeFlag: "🇪🇸", away: "佛得角", awayFlag: "🇨🇻", time: "00:00", venue: "亚特兰大", stage: "H组" },
      { home: "沙特", homeFlag: "🇸🇦", away: "乌拉圭", awayFlag: "🇺🇾", time: "06:00", venue: "迈阿密", stage: "H组" },
      { home: "伊朗", homeFlag: "🇮🇷", away: "新西兰", awayFlag: "🇳🇿", time: "09:00", venue: "英格尔伍德", stage: "G组" },
    ],
  },
  {
    date: "2026-06-16",
    dateLabel: "6月16日 周二",
    matches: [
      { home: "法国", homeFlag: "🇫🇷", away: "塞内加尔", awayFlag: "🇸🇳", time: "03:00", venue: "东卢瑟福", stage: "I组" },
      { home: "伊拉克", homeFlag: "🇮🇶", away: "挪威", awayFlag: "🇳🇴", time: "06:00", venue: "福克斯伯勒", stage: "I组" },
      { home: "阿根廷", homeFlag: "🇦🇷", away: "阿尔及利亚", awayFlag: "🇩🇿", time: "09:00", venue: "堪萨斯城", stage: "J组" },
      { home: "奥地利", homeFlag: "🇦🇹", away: "约旦", awayFlag: "🇯🇴", time: "12:00", venue: "圣克拉拉", stage: "J组" },
    ],
  },
  {
    date: "2026-06-17",
    dateLabel: "6月17日 周三",
    matches: [
      { home: "葡萄牙", homeFlag: "🇵🇹", away: "刚果(金)", awayFlag: "🇨🇩", time: "01:00", venue: "休斯顿", stage: "K组" },
      { home: "英格兰", homeFlag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", away: "克罗地亚", awayFlag: "🇭🇷", time: "04:00", venue: "阿灵顿", stage: "L组" },
      { home: "加纳", homeFlag: "🇬🇭", away: "巴拿马", awayFlag: "🇵🇦", time: "07:00", venue: "多伦多", stage: "L组" },
      { home: "乌兹别克", homeFlag: "🇺🇿", away: "哥伦比亚", awayFlag: "🇨🇴", time: "10:00", venue: "墨西哥城", stage: "K组" },
    ],
  },
  {
    date: "2026-06-18",
    dateLabel: "6月18日 周四",
    matches: [
      { home: "捷克", homeFlag: "🇨🇿", away: "南非", awayFlag: "🇿🇦", time: "00:00", venue: "亚特兰大", stage: "A组" },
      { home: "瑞士", homeFlag: "🇨🇭", away: "波黑", awayFlag: "🇧🇦", time: "03:00", venue: "英格尔伍德", stage: "B组" },
      { home: "加拿大", homeFlag: "🇨🇦", away: "卡塔尔", awayFlag: "🇶🇦", time: "06:00", venue: "温哥华", stage: "B组" },
      { home: "墨西哥", homeFlag: "🇲🇽", away: "韩国", awayFlag: "🇰🇷", time: "09:00", venue: "瓜达拉哈拉", stage: "A组" },
    ],
  },
  {
    date: "2026-06-19",
    dateLabel: "6月19日 周五",
    matches: [
      { home: "苏格兰", homeFlag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", away: "摩洛哥", awayFlag: "🇲🇦", time: "06:00", venue: "福克斯伯勒", stage: "C组" },
      { home: "巴西", homeFlag: "🇧🇷", away: "海地", awayFlag: "🇭🇹", time: "08:30", venue: "费城", stage: "C组" },
      { home: "美国", homeFlag: "🇺🇸", away: "澳大利亚", awayFlag: "🇦🇺", time: "03:00", venue: "西雅图", stage: "D组" },
      { home: "土耳其", homeFlag: "🇹🇷", away: "巴拉圭", awayFlag: "🇵🇾", time: "11:00", venue: "圣克拉拉", stage: "D组" },
    ],
  },
  {
    date: "2026-06-20",
    dateLabel: "6月20日 周六",
    matches: [
      { home: "荷兰", homeFlag: "🇳🇱", away: "瑞典", awayFlag: "🇸🇪", time: "01:00", venue: "休斯顿", stage: "F组" },
      { home: "德国", homeFlag: "🇩🇪", away: "科特迪瓦", awayFlag: "🇨🇮", time: "04:00", venue: "多伦多", stage: "E组" },
      { home: "厄瓜多尔", homeFlag: "🇪🇨", away: "库拉索", awayFlag: "🇨🇼", time: "08:00", venue: "堪萨斯城", stage: "E组" },
      { home: "突尼斯", homeFlag: "🇹🇳", away: "日本", awayFlag: "🇯🇵", time: "12:00", venue: "蒙特雷", stage: "F组" },
    ],
  },
  {
    date: "2026-06-21",
    dateLabel: "6月21日 周日",
    matches: [
      { home: "西班牙", homeFlag: "🇪🇸", away: "沙特", awayFlag: "🇸🇦", time: "00:00", venue: "亚特兰大", stage: "H组" },
      { home: "比利时", homeFlag: "🇧🇪", away: "伊朗", awayFlag: "🇮🇷", time: "03:00", venue: "英格尔伍德", stage: "G组" },
      { home: "乌拉圭", homeFlag: "🇺🇾", away: "佛得角", awayFlag: "🇨🇻", time: "06:00", venue: "迈阿密", stage: "H组" },
      { home: "新西兰", homeFlag: "🇳🇿", away: "埃及", awayFlag: "🇪🇬", time: "09:00", venue: "温哥华", stage: "G组" },
    ],
  },
  {
    date: "2026-06-22",
    dateLabel: "6月22日 周一",
    matches: [
      { home: "阿根廷", homeFlag: "🇦🇷", away: "奥地利", awayFlag: "🇦🇹", time: "01:00", venue: "阿灵顿", stage: "J组" },
      { home: "法国", homeFlag: "🇫🇷", away: "伊拉克", awayFlag: "🇮🇶", time: "05:00", venue: "费城", stage: "I组" },
      { home: "挪威", homeFlag: "🇳🇴", away: "塞内加尔", awayFlag: "🇸🇳", time: "08:00", venue: "东卢瑟福", stage: "I组" },
      { home: "约旦", homeFlag: "🇯🇴", away: "阿尔及利亚", awayFlag: "🇩🇿", time: "11:00", venue: "圣克拉拉", stage: "J组" },
    ],
  },
  {
    date: "2026-06-23",
    dateLabel: "6月23日 周二",
    matches: [
      { home: "葡萄牙", homeFlag: "🇵🇹", away: "乌兹别克", awayFlag: "🇺🇿", time: "01:00", venue: "休斯顿", stage: "K组" },
      { home: "英格兰", homeFlag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", away: "加纳", awayFlag: "🇬🇭", time: "04:00", venue: "福克斯伯勒", stage: "L组" },
      { home: "巴拿马", homeFlag: "🇵🇦", away: "克罗地亚", awayFlag: "🇭🇷", time: "07:00", venue: "多伦多", stage: "L组" },
      { home: "哥伦比亚", homeFlag: "🇨🇴", away: "刚果(金)", awayFlag: "🇨🇩", time: "10:00", venue: "瓜达拉哈拉", stage: "K组" },
    ],
  },
  {
    date: "2026-06-24",
    dateLabel: "6月24日 周三",
    matches: [
      { home: "瑞士", homeFlag: "🇨🇭", away: "加拿大", awayFlag: "🇨🇦", time: "03:00", venue: "温哥华", stage: "B组" },
      { home: "波黑", homeFlag: "🇧🇦", away: "卡塔尔", awayFlag: "🇶🇦", time: "03:00", venue: "西雅图", stage: "B组" },
      { home: "捷克", homeFlag: "🇨🇿", away: "墨西哥", awayFlag: "🇲🇽", time: "09:00", venue: "墨西哥城", stage: "A组" },
      { home: "南非", homeFlag: "🇿🇦", away: "韩国", awayFlag: "🇰🇷", time: "09:00", venue: "蒙特雷", stage: "A组" },
      { home: "苏格兰", homeFlag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", away: "巴西", awayFlag: "🇧🇷", time: "06:00", venue: "迈阿密", stage: "C组" },
      { home: "摩洛哥", homeFlag: "🇲🇦", away: "海地", awayFlag: "🇭🇹", time: "06:00", venue: "亚特兰大", stage: "C组" },
    ],
  },
  {
    date: "2026-06-25",
    dateLabel: "6月25日 周四",
    matches: [
      { home: "土耳其", homeFlag: "🇹🇷", away: "美国", awayFlag: "🇺🇸", time: "10:00", venue: "英格尔伍德", stage: "D组" },
      { home: "巴拉圭", homeFlag: "🇵🇾", away: "澳大利亚", awayFlag: "🇦🇺", time: "10:00", venue: "圣克拉拉", stage: "D组" },
      { home: "库拉索", homeFlag: "🇨🇼", away: "科特迪瓦", awayFlag: "🇨🇮", time: "04:00", venue: "费城", stage: "E组" },
      { home: "厄瓜多尔", homeFlag: "🇪🇨", away: "德国", awayFlag: "🇩🇪", time: "04:00", venue: "东卢瑟福", stage: "E组" },
      { home: "日本", homeFlag: "🇯🇵", away: "瑞典", awayFlag: "🇸🇪", time: "07:00", venue: "阿灵顿", stage: "F组" },
      { home: "突尼斯", homeFlag: "🇹🇳", away: "荷兰", awayFlag: "🇳🇱", time: "07:00", venue: "堪萨斯城", stage: "F组" },
    ],
  },
  {
    date: "2026-06-26",
    dateLabel: "6月26日 周五",
    matches: [
      { home: "埃及", homeFlag: "🇪🇬", away: "伊朗", awayFlag: "🇮🇷", time: "11:00", venue: "西雅图", stage: "G组" },
      { home: "新西兰", homeFlag: "🇳🇿", away: "比利时", awayFlag: "🇧🇪", time: "11:00", venue: "温哥华", stage: "G组" },
      { home: "佛得角", homeFlag: "🇨🇻", away: "沙特", awayFlag: "🇸🇦", time: "08:00", venue: "休斯顿", stage: "H组" },
      { home: "乌拉圭", homeFlag: "🇺🇾", away: "西班牙", awayFlag: "🇪🇸", time: "08:00", venue: "瓜达拉哈拉", stage: "H组" },
      { home: "挪威", homeFlag: "🇳🇴", away: "法国", awayFlag: "🇫🇷", time: "03:00", venue: "福克斯伯勒", stage: "I组" },
      { home: "塞内加尔", homeFlag: "🇸🇳", away: "伊拉克", awayFlag: "🇮🇶", time: "03:00", venue: "多伦多", stage: "I组" },
    ],
  },
  {
    date: "2026-06-27",
    dateLabel: "6月27日 周六",
    matches: [
      { home: "约旦", homeFlag: "🇯🇴", away: "阿根廷", awayFlag: "🇦🇷", time: "10:00", venue: "阿灵顿", stage: "J组" },
      { home: "阿尔及利亚", homeFlag: "🇩🇿", away: "奥地利", awayFlag: "🇦🇹", time: "10:00", venue: "堪萨斯城", stage: "J组" },
      { home: "哥伦比亚", homeFlag: "🇨🇴", away: "葡萄牙", awayFlag: "🇵🇹", time: "07:30", venue: "迈阿密", stage: "K组" },
      { home: "刚果(金)", homeFlag: "🇨🇩", away: "乌兹别克", awayFlag: "🇺🇿", time: "07:30", venue: "亚特兰大", stage: "K组" },
      { home: "巴拿马", homeFlag: "🇵🇦", away: "英格兰", awayFlag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", time: "05:00", venue: "东卢瑟福", stage: "L组" },
      { home: "克罗地亚", homeFlag: "🇭🇷", away: "加纳", awayFlag: "🇬🇭", time: "05:00", venue: "费城", stage: "L组" },
    ],
  },
  // 淘汰赛
  {
    date: "2026-06-28",
    dateLabel: "6月28日 周日",
    matches: [
      { home: "A组第2", homeFlag: "⚽", away: "B组第2", awayFlag: "⚽", time: "03:00", venue: "英格尔伍德", stage: "1/16决赛" },
    ],
  },
  {
    date: "2026-06-29",
    dateLabel: "6月29日 周一",
    matches: [
      { home: "C组第1", homeFlag: "⚽", away: "F组第2", awayFlag: "⚽", time: "01:00", venue: "休斯顿", stage: "1/16决赛" },
      { home: "E组第1", homeFlag: "⚽", away: "第三名*", awayFlag: "⚽", time: "04:30", venue: "福克斯伯勒", stage: "1/16决赛" },
      { home: "F组第1", homeFlag: "⚽", away: "C组第2", awayFlag: "⚽", time: "09:00", venue: "蒙特雷", stage: "1/16决赛" },
    ],
  },
  {
    date: "2026-06-30",
    dateLabel: "6月30日 周二",
    matches: [
      { home: "E组第2", homeFlag: "⚽", away: "I组第2", awayFlag: "⚽", time: "01:00", venue: "阿灵顿", stage: "1/16决赛" },
      { home: "I组第1", homeFlag: "⚽", away: "第三名*", awayFlag: "⚽", time: "05:00", venue: "东卢瑟福", stage: "1/16决赛" },
      { home: "A组第1", homeFlag: "⚽", away: "第三名*", awayFlag: "⚽", time: "09:00", venue: "墨西哥城", stage: "1/16决赛" },
    ],
  },
  {
    date: "2026-07-01",
    dateLabel: "7月1日 周三",
    matches: [
      { home: "L组第1", homeFlag: "⚽", away: "第三名*", awayFlag: "⚽", time: "00:00", venue: "亚特兰大", stage: "1/16决赛" },
      { home: "G组第1", homeFlag: "⚽", away: "第三名*", awayFlag: "⚽", time: "04:00", venue: "西雅图", stage: "1/16决赛" },
      { home: "D组第1", homeFlag: "⚽", away: "第三名*", awayFlag: "⚽", time: "08:00", venue: "圣克拉拉", stage: "1/16决赛" },
    ],
  },
  {
    date: "2026-07-02",
    dateLabel: "7月2日 周四",
    matches: [
      { home: "H组第1", homeFlag: "⚽", away: "J组第2", awayFlag: "⚽", time: "03:00", venue: "英格尔伍德", stage: "1/16决赛" },
      { home: "K组第2", homeFlag: "⚽", away: "L组第2", awayFlag: "⚽", time: "07:00", venue: "多伦多", stage: "1/16决赛" },
      { home: "B组第1", homeFlag: "⚽", away: "第三名*", awayFlag: "⚽", time: "11:00", venue: "温哥华", stage: "1/16决赛" },
    ],
  },
  {
    date: "2026-07-03",
    dateLabel: "7月3日 周五",
    matches: [
      { home: "D组第2", homeFlag: "⚽", away: "G组第2", awayFlag: "⚽", time: "02:00", venue: "阿灵顿", stage: "1/16决赛" },
      { home: "J组第1", homeFlag: "⚽", away: "H组第2", awayFlag: "⚽", time: "06:00", venue: "迈阿密", stage: "1/16决赛" },
      { home: "K组第1", homeFlag: "⚽", away: "第三名*", awayFlag: "⚽", time: "09:30", venue: "堪萨斯城", stage: "1/16决赛" },
    ],
  },
  {
    date: "2026-07-04",
    dateLabel: "7月4日 周六",
    matches: [
      { home: "1/16胜者", homeFlag: "⚽", away: "1/16胜者", awayFlag: "⚽", time: "01:00", venue: "休斯顿", stage: "1/8决赛" },
      { home: "1/16胜者", homeFlag: "⚽", away: "1/16胜者", awayFlag: "⚽", time: "05:00", venue: "费城", stage: "1/8决赛" },
    ],
  },
  {
    date: "2026-07-05",
    dateLabel: "7月5日 周日",
    matches: [
      { home: "1/16胜者", homeFlag: "⚽", away: "1/16胜者", awayFlag: "⚽", time: "04:00", venue: "东卢瑟福", stage: "1/8决赛" },
      { home: "1/16胜者", homeFlag: "⚽", away: "1/16胜者", awayFlag: "⚽", time: "08:00", venue: "墨西哥城", stage: "1/8决赛" },
    ],
  },
  {
    date: "2026-07-06",
    dateLabel: "7月6日 周一",
    matches: [
      { home: "1/16胜者", homeFlag: "⚽", away: "1/16胜者", awayFlag: "⚽", time: "03:00", venue: "阿灵顿", stage: "1/8决赛" },
      { home: "1/16胜者", homeFlag: "⚽", away: "1/16胜者", awayFlag: "⚽", time: "08:00", venue: "西雅图", stage: "1/8决赛" },
    ],
  },
  {
    date: "2026-07-07",
    dateLabel: "7月7日 周二",
    matches: [
      { home: "1/16胜者", homeFlag: "⚽", away: "1/16胜者", awayFlag: "⚽", time: "00:00", venue: "亚特兰大", stage: "1/8决赛" },
      { home: "1/16胜者", homeFlag: "⚽", away: "1/16胜者", awayFlag: "⚽", time: "04:00", venue: "温哥华", stage: "1/8决赛" },
    ],
  },
  {
    date: "2026-07-09",
    dateLabel: "7月9日 周四",
    matches: [
      { home: "1/8胜者", homeFlag: "⚽", away: "1/8胜者", awayFlag: "⚽", time: "04:00", venue: "福克斯伯勒", stage: "四分之一决赛" },
    ],
  },
  {
    date: "2026-07-10",
    dateLabel: "7月10日 周五",
    matches: [
      { home: "1/8胜者", homeFlag: "⚽", away: "1/8胜者", awayFlag: "⚽", time: "03:00", venue: "英格尔伍德", stage: "四分之一决赛" },
    ],
  },
  {
    date: "2026-07-11",
    dateLabel: "7月11日 周六",
    matches: [
      { home: "1/8胜者", homeFlag: "⚽", away: "1/8胜者", awayFlag: "⚽", time: "05:00", venue: "迈阿密", stage: "四分之一决赛" },
      { home: "1/8胜者", homeFlag: "⚽", away: "1/8胜者", awayFlag: "⚽", time: "09:00", venue: "堪萨斯城", stage: "四分之一决赛" },
    ],
  },
  {
    date: "2026-07-14",
    dateLabel: "7月14日 周二",
    matches: [
      { home: "四强胜者", homeFlag: "⚽", away: "四强胜者", awayFlag: "⚽", time: "03:00", venue: "阿灵顿", stage: "半决赛" },
    ],
  },
  {
    date: "2026-07-15",
    dateLabel: "7月15日 周三",
    matches: [
      { home: "四强胜者", homeFlag: "⚽", away: "四强胜者", awayFlag: "⚽", time: "03:00", venue: "亚特兰大", stage: "半决赛" },
    ],
  },
  {
    date: "2026-07-18",
    dateLabel: "7月18日 周六",
    matches: [
      { home: "半决赛负者", homeFlag: "⚽", away: "半决赛负者", awayFlag: "⚽", time: "05:00", venue: "迈阿密", stage: "季军赛" },
    ],
  },
  {
    date: "2026-07-19",
    dateLabel: "7月19日 周日 🏆",
    matches: [
      { home: "半决赛胜者", homeFlag: "🏆", away: "半决赛胜者", awayFlag: "🏆", time: "03:00", venue: "东卢瑟福 大都会球场", stage: "决赛" },
    ],
  },
];

// 小组赛数据
const groups: Record<string, { name: string; flag: string }[]> = {
  A: [
    { name: "墨西哥", flag: "🇲🇽" },
    { name: "南非", flag: "🇿🇦" },
    { name: "韩国", flag: "🇰🇷" },
    { name: "捷克", flag: "🇨🇿" },
  ],
  B: [
    { name: "加拿大", flag: "🇨🇦" },
    { name: "波黑", flag: "🇧🇦" },
    { name: "卡塔尔", flag: "🇶🇦" },
    { name: "瑞士", flag: "🇨🇭" },
  ],
  C: [
    { name: "巴西", flag: "🇧🇷" },
    { name: "摩洛哥", flag: "🇲🇦" },
    { name: "海地", flag: "🇭🇹" },
    { name: "苏格兰", flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿" },
  ],
  D: [
    { name: "美国", flag: "🇺🇸" },
    { name: "巴拉圭", flag: "🇵🇾" },
    { name: "澳大利亚", flag: "🇦🇺" },
    { name: "土耳其", flag: "🇹🇷" },
  ],
  E: [
    { name: "德国", flag: "🇩🇪" },
    { name: "库拉索", flag: "🇨🇼" },
    { name: "科特迪瓦", flag: "🇨🇮" },
    { name: "厄瓜多尔", flag: "🇪🇨" },
  ],
  F: [
    { name: "荷兰", flag: "🇳🇱" },
    { name: "日本", flag: "🇯🇵" },
    { name: "瑞典", flag: "🇸🇪" },
    { name: "突尼斯", flag: "🇹🇳" },
  ],
  G: [
    { name: "比利时", flag: "🇧🇪" },
    { name: "埃及", flag: "🇪🇬" },
    { name: "伊朗", flag: "🇮🇷" },
    { name: "新西兰", flag: "🇳🇿" },
  ],
  H: [
    { name: "西班牙", flag: "🇪🇸" },
    { name: "佛得角", flag: "🇨🇻" },
    { name: "沙特", flag: "🇸🇦" },
    { name: "乌拉圭", flag: "🇺🇾" },
  ],
  I: [
    { name: "法国", flag: "🇫🇷" },
    { name: "塞内加尔", flag: "🇸🇳" },
    { name: "伊拉克", flag: "🇮🇶" },
    { name: "挪威", flag: "🇳🇴" },
  ],
  J: [
    { name: "阿根廷", flag: "🇦🇷" },
    { name: "阿尔及利亚", flag: "🇩🇿" },
    { name: "奥地利", flag: "🇦🇹" },
    { name: "约旦", flag: "🇯🇴" },
  ],
  K: [
    { name: "葡萄牙", flag: "🇵🇹" },
    { name: "刚果(金)", flag: "🇨🇩" },
    { name: "乌兹别克", flag: "🇺🇿" },
    { name: "哥伦比亚", flag: "🇨🇴" },
  ],
  L: [
    { name: "英格兰", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
    { name: "克罗地亚", flag: "🇭🇷" },
    { name: "加纳", flag: "🇬🇭" },
    { name: "巴拿马", flag: "🇵🇦" },
  ],
};

// 阶段颜色
const stageColor = (stage: string) => {
  if (stage.includes("决赛") || stage.includes("季军")) return "#C0001A";
  if (stage.includes("半决赛")) return "#8B0000";
  if (stage.includes("四分之一")) return "#1a3a8b";
  return "#555";
};

type TabType = "schedule" | "groups" | "guess";

// 日期行组件
function DayRow({
  day,
  isExpanded,
  onToggle,
  isToday,
}: {
  day: DaySchedule;
  isExpanded: boolean;
  onToggle: () => void;
  isToday: boolean;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const isPast = day.date < today;

  return (
    <div>
      {/* 日期行 */}
      <button
        onClick={onToggle}
        className="w-full flex items-center px-4 py-3 text-left"
        style={{
          borderBottom: "1px solid #f0f0f0",
          backgroundColor: isExpanded ? "#fff8f8" : "white",
        }}
      >
        {/* 日期标签 */}
        <div className="flex-1 flex items-center gap-2">
          {isToday && (
            <span
              className="text-xs font-bold px-1.5 py-0.5 rounded"
              style={{ backgroundColor: "#C0001A", color: "white" }}
            >
              今天
            </span>
          )}
          <span
            className="text-sm font-semibold"
            style={{ color: isPast && !isToday ? "#aaa" : "#222" }}
          >
            {day.dateLabel}
          </span>
        </div>

        {/* 右侧：小国旗预览 + 场次 + 箭头 */}
        <div className="flex items-center gap-1.5">
          {/* 最多显示4个国旗 */}
          <div className="flex items-center gap-0.5">
            {day.matches.slice(0, 4).map((m, i) => (
              <span key={i} className="text-base leading-none">
                {m.homeFlag}
              </span>
            ))}
            {day.matches.length > 4 && (
              <span className="text-xs text-gray-400 ml-0.5">+{day.matches.length - 4}</span>
            )}
          </div>
          <span className="text-xs text-gray-400 ml-1">{day.matches.length}场</span>
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-gray-400 ml-1" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-400 ml-1" />
          )}
        </div>
      </button>

      {/* 展开的比赛列表 */}
      {isExpanded && (
        <div style={{ backgroundColor: "#fafafa" }}>
          {day.matches.map((match, i) => (
            <div
              key={i}
              className="flex items-center px-4 py-2.5"
              style={{
                borderBottom: i < day.matches.length - 1 ? "1px solid #f0f0f0" : "none",
              }}
            >
              {/* 阶段标签 */}
              <span
                className="text-xs px-1.5 py-0.5 rounded mr-2 font-medium flex-shrink-0"
                style={{
                  backgroundColor: stageColor(match.stage),
                  color: "white",
                  fontSize: "10px",
                  minWidth: 48,
                  textAlign: "center",
                }}
              >
                {match.stage}
              </span>

              {/* 主队 */}
              <div className="flex items-center gap-1 flex-1 justify-end">
                <span className="text-sm font-medium text-gray-700 text-right">{match.home}</span>
                <span className="text-lg leading-none">{match.homeFlag}</span>
              </div>

              {/* VS + 时间 */}
              <div className="flex flex-col items-center mx-2 flex-shrink-0" style={{ minWidth: 36 }}>
                <span
                  className="text-xs font-black"
                  style={{ color: "#C0001A" }}
                >
                  VS
                </span>
                {match.time && (
                  <span className="text-xs text-gray-400" style={{ fontSize: "10px" }}>
                    {match.time}
                  </span>
                )}
              </div>

              {/* 客队 */}
              <div className="flex items-center gap-1 flex-1 justify-start">
                <span className="text-lg leading-none">{match.awayFlag}</span>
                <span className="text-sm font-medium text-gray-700">{match.away}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function WorldCup() {
  const [activeTab, setActiveTab] = useState<TabType>("schedule");
  const today = new Date().toISOString().slice(0, 10);

  // 默认展开今天或最近一场比赛的日期
  const defaultExpanded = (() => {
    const todayIdx = schedule.findIndex((d) => d.date === today);
    if (todayIdx >= 0) return today;
    // 找最近未来的日期
    const future = schedule.find((d) => d.date >= today);
    return future ? future.date : schedule[0]?.date;
  })();

  const [expandedDate, setExpandedDate] = useState<string | null>(defaultExpanded || null);

  const tabs: { key: TabType; label: string; icon: React.ReactNode }[] = [
    { key: "schedule", label: "赛程", icon: null },
    { key: "groups", label: "小组", icon: null },
    { key: "guess", label: "竞猜", icon: null },
  ];

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#F5F5F5" }}>
      {/* ===== 顶部海报 ===== */}
      <div style={{ position: "relative" }}>
        {/* 返回按钮 */}
        <button
          onClick={() => window.history.back()}
          className="absolute top-4 left-4 z-20 w-8 h-8 flex items-center justify-center rounded-full"
          style={{ backgroundColor: "rgba(0,0,0,0.35)" }}
        >
          <ArrowLeft className="w-4 h-4 text-white" />
        </button>

        {/* 海报图片 */}
        <div style={{ width: "100%", aspectRatio: "16/9", overflow: "hidden" }}>
          <img
            src="https://d2xsxph8kpxj0f.cloudfront.net/310519663279996243/ivirPqo3t2YCdg32vqitTK/wc2026-banner-8CUuuGEm5TC7Mio8WLi4z2.webp"
            alt="FIFA World Cup 2026"
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        </div>

        {/* Tab 栏 */}
        <div
          className="flex"
          style={{
            backgroundColor: "#C0001A",
            borderTop: "1px solid rgba(255,255,255,0.2)",
          }}
        >
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="flex-1 py-3 text-sm font-bold transition-all"
              style={{
                color: activeTab === tab.key ? "#FFD700" : "rgba(255,255,255,0.7)",
                borderBottom: activeTab === tab.key ? "2px solid #FFD700" : "2px solid transparent",
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
              <DayRow
                key={day.date}
                day={day}
                isExpanded={expandedDate === day.date}
                onToggle={() =>
                  setExpandedDate(expandedDate === day.date ? null : day.date)
                }
                isToday={day.date === today}
              />
            ))}
          </div>
        )}

        {/* ---- 小组 Tab ---- */}
        {activeTab === "groups" && (
          <div className="pt-2">
            <div className="px-4 py-2 text-xs text-gray-400">12组 · 共48支球队 · 每组前2名+8个最佳第三名晋级</div>
            {Object.entries(groups).map(([groupName, teams]) => (
              <div key={groupName}>
                {/* 组标题行 */}
                <div
                  className="px-4 py-2 flex items-center"
                  style={{
                    backgroundColor:
                      groupName <= "D"
                        ? "#C0001A"
                        : groupName <= "H"
                        ? "#1a3a8b"
                        : "#1a6b1a",
                  }}
                >
                  <span className="text-white font-black text-sm">{groupName} 组</span>
                </div>
                {/* 球队列表 */}
                {teams.map((team, i) => (
                  <div
                    key={i}
                    className="flex items-center px-4 py-2.5 bg-white"
                    style={{ borderBottom: "1px solid #f5f5f5" }}
                  >
                    <span className="text-xl mr-3">{team.flag}</span>
                    <span className="text-sm font-medium text-gray-700 flex-1">{team.name}</span>
                    <div className="flex gap-4 text-xs text-gray-400">
                      <span>积分 -</span>
                      <span>净胜 -</span>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* ---- 竞猜 Tab ---- */}
        {activeTab === "guess" && (
          <div className="px-4 pt-6 flex flex-col items-center">
            <Trophy className="w-16 h-16 mb-4" style={{ color: "#C0001A" }} />
            <h2 className="text-lg font-bold text-gray-800 mb-2">冠军竞猜</h2>
            <p className="text-sm text-gray-500 text-center mb-6">
              你认为谁会夺得2026年世界杯冠军？
            </p>
            <div className="w-full grid grid-cols-3 gap-3">
              {[
                { name: "阿根廷", flag: "🇦🇷" },
                { name: "法国", flag: "🇫🇷" },
                { name: "巴西", flag: "🇧🇷" },
                { name: "英格兰", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
                { name: "西班牙", flag: "🇪🇸" },
                { name: "德国", flag: "🇩🇪" },
                { name: "葡萄牙", flag: "🇵🇹" },
                { name: "荷兰", flag: "🇳🇱" },
                { name: "美国", flag: "🇺🇸" },
              ].map((team) => (
                <button
                  key={team.name}
                  className="flex flex-col items-center py-4 rounded-xl bg-white shadow-sm active:scale-95 transition-transform"
                  style={{ border: "1px solid #f0f0f0" }}
                  onClick={() => alert(`你选择了 ${team.flag} ${team.name}！`)}
                >
                  <span className="text-3xl mb-1">{team.flag}</span>
                  <span className="text-xs font-medium text-gray-700">{team.name}</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-4">功能即将上线，敬请期待</p>
          </div>
        )}
      </div>
    </div>
  );
}
