/**
 * 多版本（皮肤）解析服务
 *
 * 规则（与产品确认）：
 * - 每个用户身上有三项：
 *   - version_key：管理员为该用户单独指定的版本（为空表示沿推荐链继承）
 *   - version_switch_enabled：是否允许在右上角自由切换版本
 *   - version_switch_scope：允许切换到的版本 key 列表（逗号分隔，为空表示全部已启用版本）
 * - 用户「生效版本」判定采用「最高优先追溯」：
 *   从用户自己开始，沿 invited_by_user_id 一路向上，记录沿途所有被管理员明确设置过 version_key 的祖先，
 *   取「最顶层」那个设置者的版本为准；若一路到顶都没人设置过，则使用系统默认版本（is_default=1，通常为脉动版）。
 */
import { getDbConnection } from "./db";

export interface SiteVersion {
  id: number;
  versionKey: string;
  name: string;
  loginUi: string;
  landingPath: string;
  isDefault: boolean;
  enabled: boolean;
  sortOrder: number;
}

export interface ResolvedUserVersion {
  // 生效版本
  versionKey: string;
  versionName: string;
  landingPath: string;
  loginUi: string;
  // 版本来源说明
  source: "self" | "inherited" | "default";
  sourceUserId: number | null; // 决定版本的祖先用户ID（self 时为自己，default 时为 null）
  sourceUserName: string | null; // 决定版本的祖先用户名
  // 切换权限
  switchEnabled: boolean;
  switchableVersionKeys: string[]; // 允许切换到的版本key列表（已解析为具体列表）
}

const MAX_DEPTH = 50; // 防止推荐链异常成环

/** 读取所有已启用版本（按 sort_order 升序） */
export async function listSiteVersions(includeDisabled = false): Promise<SiteVersion[]> {
  const conn = await getDbConnection();
  if (!conn) return [];
  const where = includeDisabled ? "" : "WHERE enabled = 1";
  const [rows]: any = await conn.execute(
    `SELECT id, version_key, name, login_ui, landing_path, is_default, enabled, sort_order
     FROM site_versions ${where} ORDER BY sort_order ASC, id ASC`
  );
  return (rows as any[]).map(mapVersionRow);
}

function mapVersionRow(r: any): SiteVersion {
  return {
    id: Number(r.id),
    versionKey: String(r.version_key),
    name: String(r.name),
    loginUi: String(r.login_ui || "maidong"),
    landingPath: String(r.landing_path || "/"),
    isDefault: Number(r.is_default) === 1,
    enabled: Number(r.enabled) === 1,
    sortOrder: Number(r.sort_order || 0),
  };
}

/** 取系统默认版本（is_default=1）；找不到则回退到 maidong 兜底 */
async function getDefaultVersion(versions: SiteVersion[]): Promise<SiteVersion> {
  const def = versions.find((v) => v.isDefault) || versions.find((v) => v.versionKey === "maidong");
  if (def) return def;
  // 兜底：版本表为空时返回脉动版默认配置
  return {
    id: 0,
    versionKey: "maidong",
    name: "脉动版",
    loginUi: "maidong",
    landingPath: "/",
    isDefault: true,
    enabled: true,
    sortOrder: 0,
  };
}

/**
 * 沿推荐链向上追溯，返回「最顶层被设置过 version_key 的祖先」的 { userId, name, versionKey }。
 * 实现：从自己开始向上走，每遇到一个设置过 version_key 的节点就记录为候选（覆盖之前的候选），
 * 走到顶端后，最后一次记录的就是「最顶层设置者」。
 */
async function resolveTopSetter(
  startUserId: number
): Promise<{ userId: number; name: string | null; versionKey: string } | null> {
  const conn = await getDbConnection();
  if (!conn) return null;

  let currentId: number | null = startUserId;
  let depth = 0;
  let topSetter: { userId: number; name: string | null; versionKey: string } | null = null;
  const visited = new Set<number>();

  while (currentId != null && depth < MAX_DEPTH) {
    if (visited.has(currentId)) break; // 防成环
    visited.add(currentId);

    const [rows]: any = await conn.execute(
      `SELECT id, name, version_key, invited_by_user_id FROM users WHERE id = ? LIMIT 1`,
      [currentId]
    );
    const row = (rows as any[])[0];
    if (!row) break;

    const vk = row.version_key ? String(row.version_key).trim() : "";
    if (vk) {
      // 记录为候选（越往上走越会覆盖，最终保留最顶层的设置者）
      topSetter = { userId: Number(row.id), name: row.name ?? null, versionKey: vk };
    }

    currentId = row.invited_by_user_id != null ? Number(row.invited_by_user_id) : null;
    depth++;
  }

  return topSetter;
}

/**
 * 计算某用户的生效版本与来源、切换权限。
 */
export async function resolveUserVersion(userId: number): Promise<ResolvedUserVersion> {
  const versions = await listSiteVersions(false);
  const defaultVersion = await getDefaultVersion(versions);

  const conn = await getDbConnection();
  // 读取用户自身的切换权限设置
  let switchEnabled = false;
  let switchScopeRaw = "";
  let selfVersionKey = "";
  if (conn) {
    const [rows]: any = await conn.execute(
      `SELECT version_key, version_switch_enabled, version_switch_scope FROM users WHERE id = ? LIMIT 1`,
      [userId]
    );
    const row = (rows as any[])[0];
    if (row) {
      selfVersionKey = row.version_key ? String(row.version_key).trim() : "";
      switchEnabled = Number(row.version_switch_enabled) === 1;
      switchScopeRaw = row.version_switch_scope ? String(row.version_switch_scope) : "";
    }
  }

  // 追溯最顶层设置者
  const topSetter = await resolveTopSetter(userId);

  // 决定生效版本
  let effectiveKey = defaultVersion.versionKey;
  let source: ResolvedUserVersion["source"] = "default";
  let sourceUserId: number | null = null;
  let sourceUserName: string | null = null;

  if (topSetter) {
    // 校验该版本仍然存在且启用
    const exists = versions.find((v) => v.versionKey === topSetter.versionKey);
    if (exists) {
      effectiveKey = topSetter.versionKey;
      sourceUserId = topSetter.userId;
      sourceUserName = topSetter.name;
      source = topSetter.userId === userId ? "self" : "inherited";
    }
  }

  const effective =
    versions.find((v) => v.versionKey === effectiveKey) || defaultVersion;

  // 解析可切换版本范围
  let switchableVersionKeys: string[] = [];
  if (switchEnabled) {
    if (switchScopeRaw.trim()) {
      const scoped = switchScopeRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      switchableVersionKeys = versions
        .filter((v) => scoped.includes(v.versionKey))
        .map((v) => v.versionKey);
    } else {
      // 为空表示全部已启用版本
      switchableVersionKeys = versions.map((v) => v.versionKey);
    }
    // 确保生效版本本身也在可切换列表里
    if (!switchableVersionKeys.includes(effective.versionKey)) {
      switchableVersionKeys.unshift(effective.versionKey);
    }
  }

  return {
    versionKey: effective.versionKey,
    versionName: effective.name,
    landingPath: effective.landingPath,
    loginUi: effective.loginUi,
    source,
    sourceUserId,
    sourceUserName,
    switchEnabled,
    switchableVersionKeys,
  };
}
