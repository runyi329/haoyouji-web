// AJ 企业报销事项与会计科目目录。前后端必须复用此文件，不能自行猜测映射。
export const EXPENSE_CATEGORIES = [
  {
    key: "travel",
    label: "差旅费",
    items: [
      { key: "flight", label: "机票" },
      { key: "train", label: "高铁/动车" },
      { key: "train_regular", label: "普通火车" },
      { key: "bus", label: "长途汽车" },
      { key: "hotel", label: "住宿费" },
      { key: "local_transport", label: "市内交通（出租/滴滴）" },
      { key: "allowance", label: "出差补贴" },
      { key: "toll", label: "过路过桥费" },
    ],
  },
  {
    key: "entertainment",
    label: "业务招待费",
    items: [
      { key: "dining", label: "餐饮宴请" },
      { key: "gift", label: "礼品礼金" },
      { key: "tea", label: "茶水饮品" },
      { key: "reception", label: "商务活动接待" },
    ],
  },
  {
    key: "meeting",
    label: "会议费",
    items: [
      { key: "venue", label: "会议场地租金" },
      { key: "materials", label: "会议资料印刷" },
      { key: "meeting_hotel", label: "会议住宿" },
      { key: "meeting_dining", label: "会议餐饮" },
      { key: "registration", label: "培训注册费" },
    ],
  },
  {
    key: "office",
    label: "办公费",
    items: [
      { key: "supplies", label: "办公用品" },
      { key: "print", label: "文件打印复印" },
      { key: "express", label: "快递邮寄" },
      { key: "utilities", label: "水电杂费" },
      { key: "consumables", label: "设备耗材" },
    ],
  },
  {
    key: "communication",
    label: "通讯费",
    items: [
      { key: "phone", label: "手机话费" },
      { key: "internet", label: "网络宽带" },
      { key: "video_conf", label: "视频会议工具" },
    ],
  },
  {
    key: "transport",
    label: "交通费",
    items: [
      { key: "taxi", label: "市内打车/公交/地铁" },
      { key: "parking", label: "停车费" },
      { key: "fuel", label: "加油费" },
      { key: "car_repair", label: "车辆维修保养" },
    ],
  },
  {
    key: "maintenance",
    label: "维修维护费",
    items: [
      { key: "equipment", label: "办公设备维修" },
      { key: "vehicle", label: "车辆维修" },
      { key: "building", label: "房屋维修" },
    ],
  },
  {
    key: "rental",
    label: "租赁费",
    items: [
      { key: "office_rent", label: "办公场地租金" },
      { key: "equipment_rent", label: "设备租赁" },
      { key: "car_rent", label: "车辆租赁" },
    ],
  },
  {
    key: "marketing",
    label: "广告宣传费",
    items: [
      { key: "ad", label: "广告投放" },
      { key: "promo_material", label: "宣传物料" },
      { key: "market_promo", label: "市场推广" },
      { key: "exhibition", label: "展会费用" },
    ],
  },
  {
    key: "welfare",
    label: "员工福利费",
    items: [
      { key: "holiday", label: "节日福利" },
      { key: "medical", label: "员工体检" },
      { key: "team_building", label: "团建活动" },
      { key: "labor_protection", label: "劳保用品" },
    ],
  },
  {
    key: "training",
    label: "培训教育费",
    items: [
      { key: "external_training", label: "外部培训" },
      { key: "certification", label: "考证费用" },
      { key: "books", label: "书籍资料" },
      { key: "online_course", label: "在线课程" },
    ],
  },
  {
    key: "other",
    label: "其他专项",
    items: [
      { key: "project_advance", label: "项目垫付" },
      { key: "misc_purchase", label: "零星采购" },
      { key: "unclassified", label: "不可归类支出" },
    ],
  },
];

// 从 AJOwnerPanel 原目录复制；保留其 code/name/children 结构供原科目选择器复用。
export const ACCOUNTING_SUBJECTS = [
  { code: '1001', name: '库存现金', children: [] },
  { code: '1002', name: '银行存款', children: [] },
  { code: '1122', name: '应收账款', children: [] },
  { code: '1221', name: '其他应收款', children: [] },
  { code: '1401', name: '原材料', children: [] },
  { code: '1403', name: '库存商品', children: [] },
  { code: '1601', name: '固定资产', children: ['办公设备','电子设备','交通运输工具','机械设备'] },
  { code: '1701', name: '无形资产', children: ['软件使用权','商标权','专利权'] },
  { code: '1801', name: '长期待摊费用', children: ['装修费','开办费'] },
  { code: '2202', name: '应付账款', children: [] },
  { code: '2241', name: '其他应付款', children: [] },
  { code: '5001', name: '生产成本', children: ['直接材料','直接人工','制造费用'] },
  { code: '6001', name: '主营业务收入', children: [] },
  { code: '6051', name: '其他业务收入', children: [] },
  { code: '6401', name: '主营业务成本', children: [] },
  { code: '6601', name: '销售费用', children: ['广告费','宣传费','业务招待费','运输费','销售人员工资','展览费'] },
  { code: '6602', name: '管理费用', children: ['办公费','差旅费','咨询费','租赁费','水电费','物业费','劳保费','职工教育经费','福利费','车辆费','会议费','软件服务费','折旧费','维修费','业务招待费'] },
  { code: '6603', name: '财务费用', children: ['利息支出','手续费','汇兑损益'] },
  { code: '6711', name: '营业外支出', children: ['罚款支出','捐赠支出'] },
];

// accountingCode 是现有账本保存的科目名称（或“科目名称-明细”），不是数字编号。
export const ACCOUNTING_OPTIONS: string[] = ACCOUNTING_SUBJECTS.flatMap((subject) => [
  subject.name,
  ...subject.children.map((detail) => `${subject.name}-${detail}`),
]);
const accountingOptionSet = new Set(ACCOUNTING_OPTIONS);

export function isValidAccountingCode(value: unknown): value is string {
  return typeof value === "string" && accountingOptionSet.has(value);
}

export type AJExpenseConfig = Record<string, {
  enabled: boolean;
  items: Record<string, boolean>;
  accountingMap?: Record<string, string>;
}>;

export type AJEnabledExpenseItem = {
  categoryKey: string;
  itemKey: string;
  categoryLabel: string;
  itemLabel: string;
  accountingCode: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSafeKey(key: string): boolean {
  return key !== "__proto__" && key !== "constructor" && key !== "prototype";
}

// 兼容旧行为：缺少的类目/子项默认启用，但绝不生成企业会计科目映射。
export function getDefaultExpenseConfig(): AJExpenseConfig {
  const config: AJExpenseConfig = {};
  for (const category of EXPENSE_CATEGORIES) {
    config[category.key] = {
      enabled: true,
      items: Object.fromEntries(category.items.map((item) => [item.key, true])),
    };
  }
  return config;
}

/**
 * 接收历史配置或不可信输入，合并旧默认目录，不修改入参。
 * 保留未知但合法的类目、布尔子项和科目映射，避免开关/保存丢失旧配置；
 * 非法科目不会进入结果。关闭类目/子项不会删除其映射。
 */
export function normalizeExpenseConfig(value: unknown): AJExpenseConfig {
  const config = getDefaultExpenseConfig();
  if (!isRecord(value)) return config;

  for (const [categoryKey, rawCategory] of Object.entries(value)) {
    if (!isSafeKey(categoryKey) || !isRecord(rawCategory)) continue;
    const previous = config[categoryKey];
    const items: Record<string, boolean> = { ...previous?.items };
    if (isRecord(rawCategory.items)) {
      for (const [itemKey, enabled] of Object.entries(rawCategory.items)) {
        if (isSafeKey(itemKey) && typeof enabled === "boolean") items[itemKey] = enabled;
      }
    }
    const category: AJExpenseConfig[string] = {
      enabled: typeof rawCategory.enabled === "boolean" ? rawCategory.enabled : true,
      items,
    };
    if (isRecord(rawCategory.accountingMap)) {
      const accountingMap: Record<string, string> = {};
      for (const [itemKey, accountingCode] of Object.entries(rawCategory.accountingMap)) {
        if (isSafeKey(itemKey) && isValidAccountingCode(accountingCode)) {
          accountingMap[itemKey] = accountingCode;
        }
      }
      category.accountingMap = accountingMap;
    }
    config[categoryKey] = category;
  }
  return config;
}

// AI 候选只来自已知事项目录中的已启用项；未知字段仅保留，不擅自生成标签。
export function getEnabledExpenseItems(value: unknown): AJEnabledExpenseItem[] {
  const config = normalizeExpenseConfig(value);
  const result: AJEnabledExpenseItem[] = [];
  for (const category of EXPENSE_CATEGORIES) {
    const categoryConfig = config[category.key];
    if (!categoryConfig?.enabled) continue;
    for (const item of category.items) {
      if (categoryConfig.items[item.key] !== true) continue;
      const accountingCode = categoryConfig.accountingMap?.[item.key];
      result.push({
        categoryKey: category.key,
        itemKey: item.key,
        categoryLabel: category.label,
        itemLabel: item.label,
        accountingCode: isValidAccountingCode(accountingCode) ? accountingCode : null,
      });
    }
  }
  return result;
}
