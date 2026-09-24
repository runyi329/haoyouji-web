import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import { getDbConnection } from "./db";
import { AI_WALLET_ASSET_CATALOG, AI_WALLET_ASSETS, type AiWalletAsset } from "../shared/ai-wallet-assets";

const WALLET_ASSETS = AI_WALLET_ASSETS;
const PROFILE_TEMPLATES = ["cny_simple", "stablecoin", "blockchain", "hybrid", "custom"] as const;
const RATE_POLICIES = ["not_required", "live_market", "order_snapshot"] as const;
const TARGET_TYPES = ["ledger", "site_version"] as const;

type WalletProfileRow = {
  id: number;
  target_type: "ledger" | "site_version";
  target_key: string;
  target_name: string;
  ledger_id: number | null;
  version_key: string | null;
  template_key: (typeof PROFILE_TEMPLATES)[number];
  enabled: number;
  visible_assets: string | string[] | null;
  default_asset: string;
  allow_recharge: number;
  allow_withdrawal: number;
  allow_transfer: number;
  allow_admin_adjustment: number;
  allow_order_debit: number;
  show_market: number;
  show_networks: number;
  rate_policy: (typeof RATE_POLICIES)[number];
  created_at: string;
  updated_at: string;
  project_name?: string | null;
  project_type?: string | null;
  project_currency?: string | null;
  project_enabled?: number | null;
};

type WalletProfile = {
  id: number;
  targetType: "ledger" | "site_version";
  targetKey: string;
  targetName: string;
  targetMeta: { ledgerId?: number; versionKey?: string; ledgerType?: string; primaryCurrency?: string; projectEnabled?: boolean };
  templateKey: (typeof PROFILE_TEMPLATES)[number];
  enabled: boolean;
  visibleAssets: AiWalletAsset[];
  defaultAsset: AiWalletAsset;
  allowRecharge: boolean;
  allowWithdrawal: boolean;
  allowTransfer: boolean;
  allowAdminAdjustment: boolean;
  allowOrderDebit: boolean;
  showMarket: boolean;
  showNetworks: boolean;
  ratePolicy: (typeof RATE_POLICIES)[number];
  createdAt: string;
  updatedAt: string;
};

let walletProfileTableReady: Promise<void> | null = null;

function assertSuperAdmin(ctx: any) {
  if (ctx?.user?.role !== "super_admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "仅系统管理员可访问 AI 智能钱包配置" });
  }
}

function toBool(value: unknown): boolean {
  return Number(value ?? 0) === 1;
}

function sanitizeAssets(value: unknown): AiWalletAsset[] {
  let raw: unknown[] = [];
  try {
    raw = Array.isArray(value) ? value : JSON.parse(String(value || "[]"));
  } catch {
    raw = [];
  }
  const assets = raw
    .map((asset) => String(asset).toUpperCase())
    .filter((asset): asset is AiWalletAsset => (WALLET_ASSETS as readonly string[]).includes(asset));
  return Array.from(new Set(assets));
}

function normalizeProfile(row: WalletProfileRow): WalletProfile {
  const visibleAssets = sanitizeAssets(row.visible_assets);
  const fallbackAsset: AiWalletAsset = visibleAssets.includes("CNY")
    ? "CNY"
    : (visibleAssets[0] || "CNY");
  const defaultAsset = (WALLET_ASSETS as readonly string[]).includes(String(row.default_asset).toUpperCase())
    ? String(row.default_asset).toUpperCase() as AiWalletAsset
    : fallbackAsset;
  const targetName = String(row.project_name || row.target_name || row.target_key);
  return {
    id: Number(row.id),
    targetType: row.target_type,
    targetKey: String(row.target_key),
    targetName,
    targetMeta: {
      ...(row.ledger_id ? { ledgerId: Number(row.ledger_id) } : {}),
      ...(row.version_key ? { versionKey: String(row.version_key) } : {}),
      ...(row.project_type ? { ledgerType: String(row.project_type) } : {}),
      ...(row.project_currency ? { primaryCurrency: String(row.project_currency) } : {}),
      ...(row.project_enabled !== null && row.project_enabled !== undefined ? { projectEnabled: toBool(row.project_enabled) } : {}),
    },
    templateKey: (PROFILE_TEMPLATES as readonly string[]).includes(String(row.template_key))
      ? row.template_key
      : "custom",
    enabled: toBool(row.enabled),
    visibleAssets,
    defaultAsset: visibleAssets.includes(defaultAsset) ? defaultAsset : fallbackAsset,
    allowRecharge: toBool(row.allow_recharge),
    allowWithdrawal: toBool(row.allow_withdrawal),
    allowTransfer: toBool(row.allow_transfer),
    allowAdminAdjustment: toBool(row.allow_admin_adjustment),
    allowOrderDebit: toBool(row.allow_order_debit),
    showMarket: toBool(row.show_market),
    showNetworks: toBool(row.show_networks),
    ratePolicy: (RATE_POLICIES as readonly string[]).includes(String(row.rate_policy))
      ? row.rate_policy
      : "not_required",
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
  };
}

async function ensureWalletProjectProfileTable(): Promise<void> {
  if (!walletProfileTableReady) {
    walletProfileTableReady = (async () => {
      const conn = await getDbConnection();
      if (!conn) throw new Error("数据库连接失败，无法初始化 AI 智能钱包项目档案");
      await (conn as any).execute(`
        CREATE TABLE IF NOT EXISTS ai_wallet_project_profiles (
          id INT AUTO_INCREMENT PRIMARY KEY,
          target_type VARCHAR(24) NOT NULL COMMENT 'ledger 或 site_version',
          target_key VARCHAR(120) NOT NULL COMMENT '稳定目标键，例如 ledger:52',
          target_name VARCHAR(150) NOT NULL DEFAULT '',
          ledger_id INT NULL,
          version_key VARCHAR(80) NULL,
          template_key VARCHAR(32) NOT NULL DEFAULT 'custom',
          enabled TINYINT(1) NOT NULL DEFAULT 0,
          visible_assets JSON NOT NULL,
          default_asset VARCHAR(16) NOT NULL DEFAULT 'CNY',
          allow_recharge TINYINT(1) NOT NULL DEFAULT 0,
          allow_withdrawal TINYINT(1) NOT NULL DEFAULT 0,
          allow_transfer TINYINT(1) NOT NULL DEFAULT 0,
          allow_admin_adjustment TINYINT(1) NULL DEFAULT NULL,
          allow_order_debit TINYINT(1) NULL DEFAULT NULL,
          show_market TINYINT(1) NOT NULL DEFAULT 0,
          show_networks TINYINT(1) NOT NULL DEFAULT 0,
          rate_policy VARCHAR(32) NOT NULL DEFAULT 'not_required',
          created_by INT NULL,
          updated_by INT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uk_ai_wallet_target (target_type, target_key),
          KEY idx_ai_wallet_ledger (ledger_id),
          KEY idx_ai_wallet_version (version_key),
          KEY idx_ai_wallet_enabled (enabled)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI智能钱包项目账户档案'
      `);
      // 旧表是在本次新增“资金通道”前创建的。生产库的 MySQL 版本不支持
      // `ADD COLUMN IF NOT EXISTS`，因此先读元数据、再按缺失列迁移；绝不重建或清空档案表。
      const [profileColumnRows] = await (conn as any).execute(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'ai_wallet_project_profiles'
      `) as any[];
      const existingProfileColumns = new Set((profileColumnRows as any[]).map((row) => String(row.column_name)));
      const addProfileColumn = async (name: string, definition: string) => {
        if (existingProfileColumns.has(name)) return;
        try {
          await (conn as any).execute(`ALTER TABLE ai_wallet_project_profiles ADD COLUMN ${name} ${definition}`);
        } catch (error: any) {
          // 多个实例同时升级时，另一个实例可能已成功补列；该重复列错误可安全忽略。
          if (error?.code !== 'ER_DUP_FIELDNAME') throw error;
        }
        existingProfileColumns.add(name);
      };
      await addProfileColumn('allow_admin_adjustment', 'TINYINT(1) NULL DEFAULT NULL AFTER allow_transfer');
      await addProfileColumn('allow_order_debit', 'TINYINT(1) NULL DEFAULT NULL AFTER allow_admin_adjustment');
      // 新字段首次上线时，只有既有真实资金项目继承当前已运行的能力；之后管理员保存的 0/1 不会被重写。
      await (conn as any).execute(`
        UPDATE ai_wallet_project_profiles
        SET allow_admin_adjustment = CASE WHEN target_key = 'ledger:52' THEN 1 ELSE 0 END,
            allow_order_debit = CASE WHEN target_key IN ('ledger:52', 'version:proj_hzxm2t') THEN 1 ELSE 0 END
        WHERE allow_admin_adjustment IS NULL OR allow_order_debit IS NULL
      `);

      // 为已实际使用统一钱包的两个项目写入首批可追溯配置。INSERT IGNORE 不覆盖人工更新。
      await (conn as any).execute(
        `INSERT IGNORE INTO ai_wallet_project_profiles
          (target_type, target_key, target_name, ledger_id, template_key, enabled, visible_assets, default_asset,
           allow_recharge, allow_withdrawal, allow_transfer, allow_admin_adjustment, allow_order_debit, show_market, show_networks, rate_policy)
         VALUES ('ledger', 'ledger:52', '52号账本', 52, 'blockchain', 1, ?, 'USDT', 1, 1, 1, 1, 1, 1, 1, 'live_market')`,
        [JSON.stringify(["USDT", "CNY"])]
      );
      await (conn as any).execute(
        `INSERT IGNORE INTO ai_wallet_project_profiles
          (target_type, target_key, target_name, version_key, template_key, enabled, visible_assets, default_asset,
           allow_recharge, allow_withdrawal, allow_transfer, allow_admin_adjustment, allow_order_debit, show_market, show_networks, rate_policy)
         VALUES ('site_version', 'version:proj_hzxm2t', '米伴', 'proj_hzxm2t', 'hybrid', 1, ?, 'CNY', 0, 0, 0, 0, 1, 0, 0, 'order_snapshot')`,
        [JSON.stringify(["CNY", "USDT"])]
      );
    })().catch((error) => {
      walletProfileTableReady = null;
      throw error;
    });
  }
  await walletProfileTableReady;
}

export type AiWalletOperation = "recharge" | "withdrawal" | "transfer" | "admin_adjustment" | "order_debit";

/**
 * Service-side gate for newly initiated wallet actions. It deliberately excludes
 * refunds, completed-order settlements, and audit corrections so a paused entry
 * cannot freeze funds that are already owed to a user.
 */
export async function assertAiWalletOperationEnabled(targetKey: string, operation: AiWalletOperation): Promise<void> {
  await ensureWalletProjectProfileTable();
  const conn = await getDbConnection();
  if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI 智能钱包配置服务暂不可用" });
  const columnByOperation: Record<AiWalletOperation, string> = {
    recharge: "allow_recharge",
    withdrawal: "allow_withdrawal",
    transfer: "allow_transfer",
    admin_adjustment: "allow_admin_adjustment",
    order_debit: "allow_order_debit",
  };
  const operationLabel: Record<AiWalletOperation, string> = {
    recharge: "充值入口",
    withdrawal: "提现入口",
    transfer: "站内转账",
    admin_adjustment: "管理员手动调账",
    order_debit: "业务订单扣款",
  };
  const column = columnByOperation[operation];
  const [rows] = await (conn as any).execute(
    `SELECT enabled, ${column} AS operation_enabled FROM ai_wallet_project_profiles WHERE target_key = ? LIMIT 1`,
    [targetKey],
  ) as any[];
  const profile = (rows as any[])?.[0];
  if (!profile || Number(profile.enabled) !== 1 || Number(profile.operation_enabled) !== 1) {
    throw new TRPCError({ code: "FORBIDDEN", message: `该项目的${operationLabel[operation]}当前未启用，请联系管理员在 AI 智能钱包配置中核对` });
  }
}

const TEMPLATE_CATALOG = [
  {
    key: "cny_simple",
    name: "人民币简洁",
    description: "只显示人民币余额与必要的资金操作；不展示区块链网络和数字资产行情。",
    defaults: { visibleAssets: ["CNY"], defaultAsset: "CNY", allowRecharge: false, allowWithdrawal: false, allowTransfer: false, showMarket: false, showNetworks: false, ratePolicy: "not_required" },
  },
  {
    key: "stablecoin",
    name: "稳定币",
    description: "面向 USDT 的简洁钱包展示；适用于仅需稳定币余额和站内流转的项目。",
    defaults: { visibleAssets: ["USDT"], defaultAsset: "USDT", allowRecharge: true, allowWithdrawal: true, allowTransfer: true, showMarket: true, showNetworks: true, ratePolicy: "live_market" },
  },
  {
    key: "blockchain",
    name: "区块链资产",
    description: "展示 USDT 与人民币估值，并可呈现已配置的链网络、充值、提现和站内转账能力。",
    defaults: { visibleAssets: ["USDT", "CNY"], defaultAsset: "USDT", allowRecharge: true, allowWithdrawal: true, allowTransfer: true, showMarket: true, showNetworks: true, ratePolicy: "live_market" },
  },
  {
    key: "hybrid",
    name: "综合资产",
    description: "人民币与 USDT 并列，用于业务内部扣款或混合结算；默认不对用户直接开放资金入口。",
    defaults: { visibleAssets: ["CNY", "USDT"], defaultAsset: "CNY", allowRecharge: false, allowWithdrawal: false, allowTransfer: false, showMarket: false, showNetworks: false, ratePolicy: "order_snapshot" },
  },
  {
    key: "custom",
    name: "自定义档案",
    description: "由管理员按项目逐项选择展示资产、入口、行情和结算口径。",
    defaults: { visibleAssets: ["CNY"], defaultAsset: "CNY", allowRecharge: false, allowWithdrawal: false, allowTransfer: false, showMarket: false, showNetworks: false, ratePolicy: "not_required" },
  },
] as const;

function getRatePolicyLabel(policy: WalletProfile["ratePolicy"]): string {
  if (policy === "live_market") return "实时展示估值：按系统多源 USDT/CNY 汇率与数字资产行情服务读取；来源异常时使用服务端缓存。";
  if (policy === "order_snapshot") return "业务结算快照：订单在创建时锁定 CNY/USDT 换算值，退款与订单追溯使用该订单快照。";
  return "不需要跨币种估值：仅按原始币种展示与记账。";
}

function getRuntimeFacts(profile: WalletProfile): string[] {
  const baseline = [
    "所有用户余额仍由现有全局钱包余额与流水体系承载；项目档案不复制或拆分用户资产。",
    "站内转账当前仅支持 CNY 与 USDT，服务端以原子双边记账、请求幂等与不可撤回审计处理。",
    "订单退款、成交结算回款、系统奖励或佣金入账属于已产生业务义务，不作为可关闭的新资金入口；暂停项目入口不能阻断这类应收款。",
  ];
  if (profile.targetKey === "ledger:52") {
    return [
      "52号账本已存在黑金智能钱包入口，当前已接入充值、提现和站内转账入口。",
      "USDT 充值按已配置网络和收款地址创建订单，到账经扫描/人工确认后入账；可用网络取决于当前已启用地址。",
      "USDT 提现目前使用既有审核、冻结与外部地址流程。人民币用户端充值/提现尚未形成真实申请闭环，人民币现阶段以后台调账和内部业务记账为准。",
      ...baseline,
    ];
  }
  if (profile.targetKey === "version:proj_hzxm2t") {
    return [
      "米伴当前使用全局钱包进行订单扣款、退款和佣金入账；下单优先扣 CNY，不足部分按订单时的 CNY/USDT 换算值扣 USDT。",
      "米伴项目暂未在用户端开放独立充值、提现或站内转账页面；本档案用于保留当前业务口径并为后续入口接入提供授权依据。",
      ...baseline,
    ];
  }
  return [
    "该项目已建立钱包档案，但现有用户端入口尚未与本档案自动绑定；上线入口前应由开发在服务端校验项目、资产和操作权限。",
    ...baseline,
  ];
}

function buildArchive(profile: WalletProfile) {
  const assetText = profile.visibleAssets.length ? profile.visibleAssets.join("、") : "未启用资产";
  const operationText = [
    profile.allowRecharge ? "充值" : null,
    profile.allowWithdrawal ? "提现" : null,
    profile.allowTransfer ? "站内转账" : null,
    profile.allowAdminAdjustment ? "管理员手动调账" : null,
    profile.allowOrderDebit ? "业务订单扣款" : null,
  ].filter(Boolean).join("、") || "仅查看余额与流水";
  return {
    title: `${profile.targetName} · AI 智能钱包档案`,
    subtitle: "由当前项目配置与既有服务端能力自动生成；本页不提供文字修改入口。",
    generatedAt: profile.updatedAt,
    sections: [
      {
        title: "项目绑定",
        lines: [
          `项目对象：${profile.targetType === "ledger" ? "账本" : "站点项目"} · ${profile.targetName}`,
          `稳定标识：${profile.targetKey}`,
          `运行状态：${profile.enabled ? "已启用项目档案" : "档案已保存，暂不启用"}`,
          `钱包模板：${TEMPLATE_CATALOG.find((item) => item.key === profile.templateKey)?.name || "自定义档案"}`,
        ],
      },
      {
        title: "资产与展示",
        lines: [
          `可见资产：${assetText}`,
          `默认资产：${profile.defaultAsset}`,
          `行情与估值显示：${profile.showMarket ? "显示" : "隐藏"}`,
          `区块链网络信息：${profile.showNetworks ? "显示（仅展示系统已配置并启用的网络）" : "隐藏"}`,
        ],
      },
      {
        title: "资金操作权限",
        lines: [
          `项目允许操作：${operationText}`,
          `管理员手动调账：${profile.allowAdminAdjustment ? "已启用；仅具有既有管理员权限的后台人员可使用" : "未启用；不会新增人工加减余额"}`,
          `业务订单扣款：${profile.allowOrderDebit ? "已启用；新建业务订单可从钱包扣款" : "未启用；新建业务订单不会发起钱包扣款"}`,
          "退款、已成交订单结算回款和既有流水纠正不受上述新单入口开关限制，避免因暂停入口而冻结客户已有资金。",
          "说明：项目档案定义该项目计划开放的能力；所有实际资金操作仍必须经过既有服务端余额、角色、限额与审核校验。",
        ],
      },
      {
        title: "估值与结算口径",
        lines: [getRatePolicyLabel(profile.ratePolicy)],
      },
      {
        title: "当前实际系统说明",
        lines: getRuntimeFacts(profile),
      },
    ],
  };
}

async function listProfiles(conn: any): Promise<WalletProfile[]> {
  const [rows] = await conn.execute(`
    SELECT p.*,
      COALESCE(l.name, v.name, p.target_name) AS project_name,
      l.type AS project_type,
      l.currency AS project_currency,
      v.enabled AS project_enabled
    FROM ai_wallet_project_profiles p
    LEFT JOIN ledgers l ON p.target_type = 'ledger' AND p.ledger_id = l.id
    LEFT JOIN site_versions v ON p.target_type = 'site_version' AND p.version_key = v.version_key
    ORDER BY p.enabled DESC, p.updated_at DESC, p.id DESC
  `) as any[];
  return (rows as WalletProfileRow[]).map(normalizeProfile);
}

async function listProjectTargets(conn: any) {
  const [ledgerRows] = await conn.execute(`
    SELECT id, name, type, currency, isArchived
    FROM ledgers
    WHERE isArchived = 0
    ORDER BY CASE WHEN id = 52 THEN 0 ELSE 1 END, id ASC
  `) as any[];
  const [versionRows] = await conn.execute(`
    SELECT id, version_key, name, enabled, landing_path
    FROM site_versions
    ORDER BY sort_order ASC, id ASC
  `) as any[];
  const targets = [
    ...(ledgerRows as any[]).map((row) => ({
      type: "ledger" as const,
      key: `ledger:${Number(row.id)}`,
      id: Number(row.id),
      name: String(row.name || `账本${row.id}`),
      subtitle: `${Number(row.id) === 52 ? "52号 · " : ""}${String(row.type || "账本")} · ${String(row.currency || "CNY")}`,
      available: Number(row.isArchived) !== 1,
    })),
    ...(versionRows as any[]).map((row) => ({
      type: "site_version" as const,
      key: `version:${String(row.version_key)}`,
      id: Number(row.id),
      name: String(row.name || row.version_key),
      subtitle: `站点项目 · ${String(row.version_key)}`,
      available: toBool(row.enabled),
    })),
  ];
  return targets;
}

async function resolveTarget(conn: any, input: { targetType: "ledger" | "site_version"; targetKey: string }) {
  if (input.targetType === "ledger") {
    const match = input.targetKey.match(/^ledger:(\d+)$/);
    if (!match) throw new TRPCError({ code: "BAD_REQUEST", message: "账本目标格式无效" });
    const ledgerId = Number(match[1]);
    const [rows] = await conn.execute(
      `SELECT id, name, type, currency, isArchived FROM ledgers WHERE id = ? LIMIT 1`,
      [ledgerId]
    ) as any[];
    const row = (rows as any[])[0];
    if (!row || Number(row.isArchived) === 1) throw new TRPCError({ code: "NOT_FOUND", message: "账本不存在或已归档" });
    return { targetName: String(row.name || `账本${ledgerId}`), ledgerId, versionKey: null };
  }
  const match = input.targetKey.match(/^version:([a-z0-9_]+)$/);
  if (!match) throw new TRPCError({ code: "BAD_REQUEST", message: "站点项目目标格式无效" });
  const versionKey = match[1];
  const [rows] = await conn.execute(
    `SELECT version_key, name FROM site_versions WHERE version_key = ? LIMIT 1`,
    [versionKey]
  ) as any[];
  const row = (rows as any[])[0];
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "站点项目不存在" });
  return { targetName: String(row.name || versionKey), ledgerId: null, versionKey: String(row.version_key) };
}

const profileInput = z.object({
  id: z.number().int().positive().optional(),
  targetType: z.enum(TARGET_TYPES),
  targetKey: z.string().min(4).max(120),
  templateKey: z.enum(PROFILE_TEMPLATES),
  enabled: z.boolean(),
  visibleAssets: z.array(z.enum(WALLET_ASSETS)).min(1).max(WALLET_ASSETS.length),
  defaultAsset: z.enum(WALLET_ASSETS),
  allowRecharge: z.boolean(),
  allowWithdrawal: z.boolean(),
  allowTransfer: z.boolean(),
  allowAdminAdjustment: z.boolean(),
  allowOrderDebit: z.boolean(),
  showMarket: z.boolean(),
  showNetworks: z.boolean(),
  ratePolicy: z.enum(RATE_POLICIES),
});

export const aiWalletRouter = router({
  overview: protectedProcedure.query(async ({ ctx }) => {
    assertSuperAdmin(ctx);
    await ensureWalletProjectProfileTable();
    const conn = await getDbConnection();
    if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库不可用" });
    const [profiles, targets] = await Promise.all([listProfiles(conn), listProjectTargets(conn)]);
    return {
      catalog: {
        assets: AI_WALLET_ASSET_CATALOG,
        templates: TEMPLATE_CATALOG,
        ratePolicies: [
          { key: "not_required", name: "不需要换算", description: "仅按原始币种展示与记账。" },
          { key: "live_market", name: "系统实时估值", description: "使用现有多源汇率和数字资产行情服务；服务异常时回退缓存。" },
          { key: "order_snapshot", name: "业务订单快照", description: "订单创建时锁定换算值，适用于扣款、退款与订单追溯。" },
        ],
      },
      targets,
      profiles: profiles.map((profile) => ({ ...profile, archive: buildArchive(profile) })),
      systemArchive: {
        title: "全局 AI 智能钱包基础档案",
        subtitle: "来自当前统一钱包服务的只读系统说明；项目档案在此基础上定义项目范围与展示策略。",
        generatedAt: new Date().toISOString(),
        sections: [
          {
            title: "统一钱包底座",
            lines: [
              "用户资产目前以全局钱包余额和流水为唯一口径，项目不复制独立余额。",
              "当前已投入使用、可记账的资金资产为 CNY 与 USDT。52号账本的 32 种数字资产已进入全局行情与仓位展示库，但尚未创建独立钱包余额或资金通道。",
              "全局流水、用户余额、手动调账、充值监控和站内转账在现有后台模块中统一核对。",
            ],
          },
          {
            title: "资金进出与风控",
            lines: [
              "USDT：现有充值订单、收款地址、链上扫描、人工确认、提现申请和审核链路已接入。",
              "CNY：现有后台调账与内部业务记账已接入；用户端法币充值/提现仍需建设正式申请、匹配和审核流程。",
              "站内转账：仅 CNY/USDT，采用双边原子记账、幂等键和不可撤回审计；需要纠正时应新建反向流水。",
              "人工加减余额与新建业务订单扣款可由项目档案按项目暂停；退款、成交结算、奖励与佣金等既有资金义务不会被暂停，以避免用户资金冻结。",
            ],
          },
          {
            title: "行情与汇率服务",
            lines: [
              "USDT/CNY 展示汇率优先使用 CoinGecko Tether/CNY，其次 OKX C2C，再回退到其他汇率服务和进程缓存。",
              "数字资产行情缓存当前覆盖 52号账本可选的 32 种数字资产，优先 Gate.io，备用 HTX 与 OKX；行情资产只有在用户存在实际仓位或进行中订单时才会在 52号首页显示。",
              "展示估值与业务结算应分开保存：展示可使用实时价，订单结算应保存订单快照。",
            ],
          },
          {
            title: "权限边界",
            lines: [
              "本配置中心仅系统超级管理员可访问和修改。",
              "项目档案正文由结构化配置和现有系统能力自动生成，不提供自由文本编辑，避免说明与真实配置脱节。",
            ],
          },
        ],
      },
    };
  }),

  runtimeProfile: protectedProcedure
    .input(z.object({ targetKey: z.string().regex(/^(ledger:\d+|version:[a-z0-9_]+)$/) }))
    .query(async ({ input }) => {
      await ensureWalletProjectProfileTable();
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI 智能钱包配置服务暂不可用" });
      const [rows] = await (conn as any).execute(
        `SELECT enabled, allow_recharge, allow_withdrawal, allow_transfer, allow_admin_adjustment, allow_order_debit
         FROM ai_wallet_project_profiles WHERE target_key = ? LIMIT 1`,
        [input.targetKey],
      ) as any[];
      const row = (rows as any[])?.[0];
      const enabled = Boolean(row && Number(row.enabled) === 1);
      return {
        configured: Boolean(row),
        enabled,
        allowRecharge: enabled && Number(row.allow_recharge) === 1,
        allowWithdrawal: enabled && Number(row.allow_withdrawal) === 1,
        allowTransfer: enabled && Number(row.allow_transfer) === 1,
        allowAdminAdjustment: enabled && Number(row.allow_admin_adjustment) === 1,
        allowOrderDebit: enabled && Number(row.allow_order_debit) === 1,
      };
    }),

  saveProfile: protectedProcedure.input(profileInput).mutation(async ({ ctx, input }) => {
    assertSuperAdmin(ctx);
    await ensureWalletProjectProfileTable();
    const conn = await getDbConnection();
    if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库不可用" });
    const target = await resolveTarget(conn, input);
    const visibleAssets = Array.from(new Set(input.visibleAssets));
    if (!visibleAssets.includes(input.defaultAsset)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "默认资产必须在可见资产中" });
    }

    const params = [
      input.targetType,
      input.targetKey,
      target.targetName,
      target.ledgerId,
      target.versionKey,
      input.templateKey,
      input.enabled ? 1 : 0,
      JSON.stringify(visibleAssets),
      input.defaultAsset,
      input.allowRecharge ? 1 : 0,
      input.allowWithdrawal ? 1 : 0,
      input.allowTransfer ? 1 : 0,
      input.allowAdminAdjustment ? 1 : 0,
      input.allowOrderDebit ? 1 : 0,
      input.showMarket ? 1 : 0,
      input.showNetworks ? 1 : 0,
      input.ratePolicy,
      ctx.user.id,
      ctx.user.id,
    ];

    if (input.id) {
      const [rows] = await conn.execute(`SELECT id FROM ai_wallet_project_profiles WHERE id = ? LIMIT 1`, [input.id]) as any[];
      if (!(rows as any[])[0]) throw new TRPCError({ code: "NOT_FOUND", message: "项目钱包档案不存在" });
      await conn.execute(
        `UPDATE ai_wallet_project_profiles SET
          target_type = ?, target_key = ?, target_name = ?, ledger_id = ?, version_key = ?, template_key = ?, enabled = ?,
          visible_assets = ?, default_asset = ?, allow_recharge = ?, allow_withdrawal = ?, allow_transfer = ?,
          allow_admin_adjustment = ?, allow_order_debit = ?, show_market = ?, show_networks = ?, rate_policy = ?, updated_by = ?, updated_at = NOW()
         WHERE id = ?`,
        [...params.slice(0, -1), input.id]
      );
      return { success: true, id: input.id };
    }

    const [duplicate] = await conn.execute(
      `SELECT id FROM ai_wallet_project_profiles WHERE target_type = ? AND target_key = ? LIMIT 1`,
      [input.targetType, input.targetKey]
    ) as any[];
    if ((duplicate as any[])[0]) {
      throw new TRPCError({ code: "CONFLICT", message: "该项目已有钱包档案，请编辑原档案" });
    }
    const [result] = await conn.execute(
      `INSERT INTO ai_wallet_project_profiles
        (target_type, target_key, target_name, ledger_id, version_key, template_key, enabled, visible_assets, default_asset,
         allow_recharge, allow_withdrawal, allow_transfer, allow_admin_adjustment, allow_order_debit, show_market, show_networks, rate_policy, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params
    ) as any[];
    return { success: true, id: Number((result as any).insertId) };
  }),
});

export type AiWalletProfileInput = z.infer<typeof profileInput>;
export { ensureWalletProjectProfileTable };
