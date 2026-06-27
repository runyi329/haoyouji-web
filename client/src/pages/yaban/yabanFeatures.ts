/**
 * 牙伴齿科管理 - 全功能字典与「首页快捷」配置工具
 * 供首页(YabanHome)、全部功能页(YabanFeatures)、首页功能管理页(YabanFeaturesCustomize)共用。
 *
 * 设计：
 * - ALL_FEATURE_DICT：平台全部功能的统一字典（key 唯一，作为配置存储标识）。
 * - 首页最多展示 HOME_MAX 个功能（末位固定为「更多」入口，不占额度）。
 * - 用户自定义的首页功能 key 列表存于 localStorage，按门店(tenantId)区分；
 *   未配置时回退到 DEFAULT_HOME_KEYS。
 */

export const ICON_BASE =
  "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/icons/yaban";

export type FeatureDef = {
  key: string; // 唯一标识，用于配置存储
  name: string;
  icon: string;
  route: string; // 为空表示功能开发中
  badge?: string;
};

// 全部功能字典（首页可选项的全集）
export const ALL_FEATURE_DICT: FeatureDef[] = [
  // —— 常用核心 ——
  { key: "schedule", name: "客户预约", icon: `${ICON_BASE}/richeng.webp`, route: "/yaban/schedule" },
  { key: "clinic_shift", name: "诊所排班", icon: `${ICON_BASE}/zhensuo_paiban.webp`, route: "/yaban/clinic-shift" },
  { key: "patients", name: "顾客档案", icon: `${ICON_BASE}/huanzhe.webp`, route: "/yaban/patients" },
  { key: "followup", name: "随访", icon: `${ICON_BASE}/suifang.webp`, route: "/yaban/followup" },
  { key: "ops_report", name: "运营报表", icon: `${ICON_BASE}/yunying_baobiao.webp`, route: "/yaban/ops-report" },
  { key: "inventory", name: "库存", icon: `${ICON_BASE}/kucun.webp`, route: "/yaban/inventory" },
  // —— 全部功能 ——
  { key: "attendance", name: "考勤打卡", icon: `${ICON_BASE}/kaoqin_daka.webp`, route: "" },
  { key: "purchase", name: "采购", icon: `${ICON_BASE}/caigou.webp`, route: "" },
  { key: "goods", name: "物品", icon: `${ICON_BASE}/wupin.webp`, route: "" },
  { key: "wechat_consult", name: "微信咨询", icon: `${ICON_BASE}/weixin_zixun.webp`, route: "https://work.weixin.qq.com/kfid/wkCdHxNQAAqjbKv2yEIWLxgY92dnYngA" },
  { key: "online_booking", name: "网络预约", icon: `${ICON_BASE}/wangluo_yuyue.webp`, route: "" },
  { key: "approval", name: "审批", icon: `${ICON_BASE}/shenpi.webp`, route: "" },
  { key: "work_remind", name: "工作提醒", icon: `${ICON_BASE}/gongzuo_tixing.webp`, route: "" },
  { key: "doctor_video", name: "医患视频", icon: `${ICON_BASE}/yihuan_shipin.webp`, route: "" },
  { key: "value_added", name: "增值服务", icon: `${ICON_BASE}/zengzhi_fuwu.webp`, route: "" },
  { key: "requisition", name: "领用", icon: `${ICON_BASE}/lingyong.webp`, route: "" },
  { key: "revisit", name: "回访管理", icon: `${ICON_BASE}/huifang_guanli.webp`, route: "" },
  { key: "lab_process", name: "技加工", icon: `${ICON_BASE}/ji_jiagong.webp`, route: "" },
  { key: "partner_profile", name: "合伙人档案", icon: `${ICON_BASE}/hehuoren_dangan.webp`, route: "/yaban/partner-profile" },
  { key: "staff_profile", name: "员工档案", icon: `${ICON_BASE}/yuangong_dangan.webp`, route: "/yaban/staff" },
  { key: "dental_shop", name: "牙科商店", icon: `${ICON_BASE}/yake_shangdian.webp`, route: "/yaban/shop" },
  { key: "ai_valuation", name: "AI估值", icon: `${ICON_BASE}/ai_guzhi.webp`, route: "/yaban/ai-valuation" },
  // 客户登记表（图标暂用 CDN 直链，后续迁移至 COS icons/yaban/kehu_dengji.webp）
  { key: "customer_register", name: "客户登记表", icon: "https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/MjkgZpDMsZ9UBDF2bQVNsp/customer_register_icon-MziUUywrhEip8GvtTwRUeG.webp", route: "/yaban/customer-register" },
];

// 首页快捷位最大数量（末位固定「更多」入口，不计入此数）
export const HOME_MAX = 7;

// 默认首页功能（与改版前一致：6 个核心功能）
export const DEFAULT_HOME_KEYS: string[] = [
  "schedule",
  "clinic_shift",
  "patients",
  "followup",
  "ops_report",
  "inventory",
  "wechat_consult",
];

export function getFeatureByKey(key: string): FeatureDef | undefined {
  return ALL_FEATURE_DICT.find((f) => f.key === key);
}

const STORAGE_PREFIX = "yaban_home_features";

function storageKey(tenantId?: number | null): string {
  return tenantId != null ? `${STORAGE_PREFIX}_t${tenantId}` : STORAGE_PREFIX;
}

/** 读取首页功能 key 列表（带去脏与回退默认） */
export function loadHomeFeatureKeys(tenantId?: number | null): string[] {
  try {
    const raw = localStorage.getItem(storageKey(tenantId));
    if (!raw) return [...DEFAULT_HOME_KEYS];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [...DEFAULT_HOME_KEYS];
    // 过滤掉字典里已不存在的 key，并截断到上限
    const valid = arr.filter((k) => typeof k === "string" && getFeatureByKey(k)).slice(0, HOME_MAX);
    return valid.length > 0 ? valid : [...DEFAULT_HOME_KEYS];
  } catch {
    return [...DEFAULT_HOME_KEYS];
  }
}

/** 保存首页功能 key 列表 */
export function saveHomeFeatureKeys(keys: string[], tenantId?: number | null): void {
  try {
    const valid = keys.filter((k) => getFeatureByKey(k)).slice(0, HOME_MAX);
    localStorage.setItem(storageKey(tenantId), JSON.stringify(valid));
  } catch {
    /* ignore */
  }
}

/** 解析为首页可渲染的功能对象列表 */
export function loadHomeFeatures(tenantId?: number | null): FeatureDef[] {
  return loadHomeFeatureKeys(tenantId)
    .map((k) => getFeatureByKey(k))
    .filter((f): f is FeatureDef => !!f);
}
