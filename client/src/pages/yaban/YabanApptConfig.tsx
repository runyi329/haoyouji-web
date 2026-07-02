/**
 * 牙伴齿科管理 - 客户预约设置
 * 路由：/yaban/settings/appt-config
 * 功能：管理新建预约第2步"选择角色成员"中显示哪些角色、显示顺序
 *
 * 逻辑：
 *   - 角色来源：yabanRole.listRoles（内置 + 该诊所自定义）
 *   - 配置存储：localStorage（key = yaban_appt_role_cfg_{tenantId}）
 *   - 配置内容：{ roles: { role_key, visible }[] }（顺序即显示顺序）
 *   - 如果角色列表为空，引导去权限管理创建角色
 */
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useSmartBack } from "@/hooks/useSmartBack";
import {
  ChevronLeft, ChevronRight, Eye, EyeOff, ArrowUp, ArrowDown,
  UserCog, Plus, Check,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import YabanClinicHeader from "./YabanClinicHeader";
import { useYabanClinic } from "./useYabanClinic";

// ── 内置角色预设（role_key → 中文名，用于无数据库时的兜底） ──
export const BUILTIN_ROLE_PRESETS: { role_key: string; name: string }[] = [
  { role_key: "doctor",       name: "医生" },
  { role_key: "nurse",        name: "护士" },
  { role_key: "assistant",    name: "助理" },
  { role_key: "receptionist", name: "前台" },
  { role_key: "finance",      name: "财务" },
];

export interface RoleVisibility {
  role_key: string;
  name: string;
  visible: boolean;
}

export interface ApptRoleConfig {
  roles: RoleVisibility[];
}

function lsKey(tenantId: number | null) {
  return `yaban_appt_role_cfg_${tenantId ?? 0}`;
}

export function loadApptRoleConfig(
  tenantId: number | null,
  allRoles: { role_key: string; name: string }[]
): ApptRoleConfig {
  try {
    const raw = localStorage.getItem(lsKey(tenantId));
    if (raw) {
      const parsed = JSON.parse(raw) as ApptRoleConfig;
      if (parsed.roles && parsed.roles.length > 0) {
        // 补充新角色（权限管理里新加的），按后端 allRoles 顺序插入
        const existing = new Set(parsed.roles.map((r) => r.role_key));
        const newRoles: RoleVisibility[] = [];
        for (let i = 0; i < allRoles.length; i++) {
          const r = allRoles[i];
          if (!existing.has(r.role_key)) {
            // 找到插入位置：在 allRoles 中前一个已存在角色的后面
            let insertAfterKey: string | null = null;
            for (let j = i - 1; j >= 0; j--) {
              if (existing.has(allRoles[j].role_key)) {
                insertAfterKey = allRoles[j].role_key;
                break;
              }
            }
            newRoles.push({ role_key: r.role_key, name: r.name, visible: true, _insertAfter: insertAfterKey } as any);
            existing.add(r.role_key);
          }
        }
        // 按插入位置将新角色插入到正确位置
        for (const nr of newRoles) {
          const insertAfterKey = (nr as any)._insertAfter;
          if (insertAfterKey) {
            const idx = parsed.roles.findIndex(r => r.role_key === insertAfterKey);
            if (idx >= 0) {
              parsed.roles.splice(idx + 1, 0, { role_key: nr.role_key, name: nr.name, visible: nr.visible });
              continue;
            }
          }
          // 找不到前一个，就按 allRoles 中的后续角色找到插入点
          let insertBeforeKey: string | null = null;
          const nrIdx = allRoles.findIndex(r => r.role_key === nr.role_key);
          for (let j = nrIdx + 1; j < allRoles.length; j++) {
            const existingIdx = parsed.roles.findIndex(r => r.role_key === allRoles[j].role_key);
            if (existingIdx >= 0) {
              insertBeforeKey = allRoles[j].role_key;
              break;
            }
          }
          if (insertBeforeKey) {
            const idx = parsed.roles.findIndex(r => r.role_key === insertBeforeKey);
            parsed.roles.splice(idx, 0, { role_key: nr.role_key, name: nr.name, visible: nr.visible });
          } else {
            parsed.roles.push({ role_key: nr.role_key, name: nr.name, visible: nr.visible });
          }
        }
        return parsed;
      }
    }
  } catch {}
  // 默认：所有角色可见，按 allRoles 顺序
  return {
    roles: allRoles.map((r) => ({ role_key: r.role_key, name: r.name, visible: true })),
  };
}

function saveApptRoleConfig(tenantId: number | null, cfg: ApptRoleConfig) {
  localStorage.setItem(lsKey(tenantId), JSON.stringify(cfg));
}

// ── 颜色 ──
const SKY = "#3D9FD6", SKY_D = "#1E88D6", SKY_L = "#EBF5FB";
const INK = "#26303C", GRAY = "#6B7A8D", GRAY_L = "#9AA7B5", LINE = "#ECEFF3", BG = "#F6F8FA";

export default function YabanApptConfig() {
  const [, navigate] = useLocation();
  const goBack = useSmartBack("/yaban/settings/website-features");
  const { currentTenantId } = useYabanClinic();

  // 从 yabanRole.listRoles 获取该诊所所有角色
  const { data: rolesData, isLoading } = trpc.yabanRole.listRoles.useQuery(
    { tenantId: currentTenantId ?? undefined },
    { enabled: true }
  );

  // 合并内置预设 + 数据库角色（去重）
  const allRoles: { role_key: string; name: string }[] = (() => {
    if (rolesData && rolesData.length > 0) {
      return (rolesData as any[]).map((r) => ({ role_key: r.role_key, name: r.name }));
    }
    return BUILTIN_ROLE_PRESETS;
  })();

  const [config, setConfig] = useState<ApptRoleConfig>({ roles: [] });
  const [dirty, setDirty] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // 角色数据加载完成后初始化配置
  useEffect(() => {
    if (allRoles.length > 0 && !initialized) {
      setConfig(loadApptRoleConfig(currentTenantId ?? null, allRoles));
      setInitialized(true);
    }
  }, [allRoles.length, currentTenantId, initialized]);

  const update = (fn: (c: ApptRoleConfig) => ApptRoleConfig) => {
    setConfig((prev) => fn(prev));
    setDirty(true);
  };

  const toggleVisible = (roleKey: string) => {
    update((c) => ({
      roles: c.roles.map((r) =>
        r.role_key === roleKey ? { ...r, visible: !r.visible } : r
      ),
    }));
  };

  const moveUp = (idx: number) => {
    if (idx === 0) return;
    update((c) => {
      const roles = [...c.roles];
      [roles[idx - 1], roles[idx]] = [roles[idx], roles[idx - 1]];
      return { roles };
    });
  };

  const moveDown = (idx: number) => {
    update((c) => {
      if (idx >= c.roles.length - 1) return c;
      const roles = [...c.roles];
      [roles[idx], roles[idx + 1]] = [roles[idx + 1], roles[idx]];
      return { roles };
    });
  };

  const handleSave = () => {
    saveApptRoleConfig(currentTenantId ?? null, config);
    setDirty(false);
    toast.success("预约角色配置已保存");
  };

  const visibleCount = config.roles.filter((r) => r.visible).length;

  return (
    <div style={{ minHeight: "100vh", background: BG, paddingBottom: 100 }}>
      {/* 顶栏 */}
      <div style={{ background: `linear-gradient(90deg,${SKY},#3BA9E0)`, color: "#fff", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px" }}>
          <button onClick={goBack} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", padding: 0 }}>
            <ChevronLeft size={24} />
          </button>
          <span style={{ fontSize: 16, fontWeight: 700, flex: 1, textAlign: "center" }}>客户预约设置</span>
          <YabanClinicHeader compact />
        </div>
      </div>

      <div style={{ padding: "14px 14px 0" }}>
        {/* 说明卡片 */}
        <div style={{ background: SKY_L, borderRadius: 6, padding: "12px 14px", marginBottom: 16, borderLeft: `3px solid ${SKY_D}` }}>
          <p style={{ fontSize: 13, color: SKY_D, margin: 0, lineHeight: 1.6 }}>
            新建预约第2步「选择角色成员」中，将按下方顺序展示各角色供选择。
            可调整显示顺序、隐藏不需要的角色。
          </p>
          <p style={{ fontSize: 12, color: GRAY_L, margin: "6px 0 0", lineHeight: 1.5 }}>
            角色来源：账号权限管理 → 角色列表。如需新增角色，请前往权限管理创建。
          </p>
        </div>

        {/* 加载中 */}
        {isLoading && (
          <div style={{ textAlign: "center", padding: "40px 0", color: GRAY_L, fontSize: 14 }}>
            加载角色列表中…
          </div>
        )}

        {/* 角色列表为空时引导 */}
        {!isLoading && config.roles.length === 0 && (
          <div style={{ background: "#fff", borderRadius: 7, padding: "32px 20px", textAlign: "center", boxShadow: "0 1px 3px rgba(38,48,60,.05)" }}>
            <UserCog size={40} color={GRAY_L} style={{ marginBottom: 12 }} />
            <p style={{ fontSize: 15, color: INK, fontWeight: 600, marginBottom: 6 }}>暂无角色</p>
            <p style={{ fontSize: 13, color: GRAY_L, marginBottom: 20 }}>
              请先在账号权限管理中创建角色，再回来配置预约流程
            </p>
            <button
              onClick={() => navigate("/yaban/settings/roles")}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 20px", background: `linear-gradient(90deg,${SKY_D},${SKY})`, color: "#fff", border: "none", borderRadius: 5, fontSize: 14, fontWeight: 600, cursor: "pointer" }}
            >
              <UserCog size={16} />
              前往角色管理
              <ChevronRight size={16} />
            </button>
          </div>
        )}

        {/* 角色排序卡片 */}
        {config.roles.length > 0 && (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: GRAY }}>
                角色列表（{visibleCount}/{config.roles.length} 个显示）
              </span>
              <button
                onClick={() => navigate("/yaban/settings/roles")}
                style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: SKY_D, background: "none", border: "none", cursor: "pointer" }}
              >
                <Plus size={13} />
                管理角色
              </button>
            </div>

            <div style={{ background: "#fff", borderRadius: 7, overflow: "hidden", boxShadow: "0 1px 3px rgba(38,48,60,.05)" }}>
              {config.roles.map((role, idx) => (
                <div
                  key={role.role_key}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "12px 14px",
                    borderBottom: idx < config.roles.length - 1 ? `1px solid ${LINE}` : "none",
                    background: role.visible ? "#fff" : "#FAFBFC",
                    opacity: role.visible ? 1 : 0.6,
                    transition: "opacity .15s",
                  }}
                >
                  {/* 序号 */}
                  <div style={{
                    width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
                    background: role.visible ? SKY_D : GRAY_L,
                    color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, fontWeight: 700,
                  }}>
                    {idx + 1}
                  </div>

                  {/* 角色名 */}
                  <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: role.visible ? INK : GRAY_L }}>
                    {role.name}
                  </span>

                  {/* 显示/隐藏 */}
                  <button
                    onClick={() => toggleVisible(role.role_key)}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex", alignItems: "center" }}
                    title={role.visible ? "点击隐藏" : "点击显示"}
                  >
                    {role.visible
                      ? <Eye size={18} color={SKY_D} />
                      : <EyeOff size={18} color={GRAY_L} />}
                  </button>

                  {/* 上移 */}
                  <button
                    onClick={() => moveUp(idx)}
                    disabled={idx === 0}
                    style={{ background: "none", border: "none", cursor: idx === 0 ? "default" : "pointer", padding: 4, opacity: idx === 0 ? 0.25 : 1 }}
                  >
                    <ArrowUp size={16} color={GRAY} />
                  </button>

                  {/* 下移 */}
                  <button
                    onClick={() => moveDown(idx)}
                    disabled={idx === config.roles.length - 1}
                    style={{ background: "none", border: "none", cursor: idx === config.roles.length - 1 ? "default" : "pointer", padding: 4, opacity: idx === config.roles.length - 1 ? 0.25 : 1 }}
                  >
                    <ArrowDown size={16} color={GRAY} />
                  </button>
                </div>
              ))}
            </div>

            {/* 提示 */}
            <p style={{ fontSize: 12, color: GRAY_L, marginTop: 10, lineHeight: 1.6 }}>
              · 隐藏的角色不会出现在新建预约的第2步中<br />
              · 顺序决定第2步中各角色的展示顺序<br />
              · 如需新增自定义角色（如"顾问"），请前往
              <button
                onClick={() => navigate("/yaban/settings/roles")}
                style={{ color: SKY_D, background: "none", border: "none", cursor: "pointer", fontSize: 12, padding: "0 2px" }}
              >
                账号权限管理
              </button>
              创建
            </p>
          </>
        )}
      </div>

      {/* 保存按钮 */}
      <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, background: "#fff", padding: "10px 16px calc(10px + env(safe-area-inset-bottom))", borderTop: `1px solid ${LINE}`, maxWidth: 480, margin: "0 auto" }}>
        <button
          onClick={handleSave}
          disabled={!dirty}
          style={{
            width: "100%", padding: "13px 0", textAlign: "center", fontSize: 15,
            color: "#fff", fontWeight: 600,
            background: dirty ? `linear-gradient(90deg, ${SKY_D}, ${SKY})` : GRAY_L,
            border: "none", borderRadius: 6,
            cursor: dirty ? "pointer" : "default",
            boxShadow: dirty ? `0 4px 12px rgba(30,136,214,.28)` : "none",
          }}
        >
          <Check size={16} style={{ display: "inline", marginRight: 6, verticalAlign: "middle" }} />
          保存配置
        </button>
      </div>
    </div>
  );
}
