/**
 * 牙伴齿科管理 - 全局“当前医院”状态 hook
 *
 * 设计要点（严禁 Emoji）：
 *   - 通过 yabanClinic.myClinics 拉取当前用户所属医院列表（已按权限过滤）。
 *   - 当前选中医院 tenantId 持久化到 localStorage("yaban_current_tenant")，跨页面一致。
 *   - 切换时广播自定义事件，让同页其它使用该 hook 的组件实时同步。
 *   - 牙伴模拟医院(tenant=9999) 所有用户均可见，承载演示数据。
 */
import { useCallback, useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";

export const YABAN_TENANT_KEY = "yaban_current_tenant";
export const YABAN_MODEL_TENANT_ID = 9999;
const TENANT_CHANGE_EVENT = "yaban-tenant-change";

export interface YabanClinic {
  tenantId: number;
  clinicId: number | null;
  name: string;
  shortName: string;
  roleKey: string;
  status: string;
}

function readStoredTenant(): number | null {
  try {
    const v = localStorage.getItem(YABAN_TENANT_KEY);
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}

export function useYabanClinic() {
  const { data, isLoading } = trpc.yabanClinic.myClinics.useQuery();
  const clinics: YabanClinic[] = (data?.clinics as YabanClinic[]) || [];

  const [currentTenantId, setCurrentTenantId] = useState<number | null>(() => readStoredTenant());

  // 当列表加载完成后，校正当前选中（无效则回退到第一家）
  useEffect(() => {
    if (clinics.length === 0) return;
    const exists = currentTenantId != null && clinics.some((c) => c.tenantId === currentTenantId);
    if (!exists) {
      const tid = clinics[0].tenantId;
      setCurrentTenantId(tid);
      try { localStorage.setItem(YABAN_TENANT_KEY, String(tid)); } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // 跨组件同步：监听切换事件
  useEffect(() => {
    const handler = (e: Event) => {
      const tid = (e as CustomEvent).detail as number;
      setCurrentTenantId(tid);
    };
    window.addEventListener(TENANT_CHANGE_EVENT, handler as EventListener);
    return () => window.removeEventListener(TENANT_CHANGE_EVENT, handler as EventListener);
  }, []);

  const selectClinic = useCallback((tid: number) => {
    setCurrentTenantId(tid);
    try { localStorage.setItem(YABAN_TENANT_KEY, String(tid)); } catch {}
    window.dispatchEvent(new CustomEvent(TENANT_CHANGE_EVENT, { detail: tid }));
  }, []);

  const current = clinics.find((c) => c.tenantId === currentTenantId) || clinics[0] || null;
  const isModel = current?.tenantId === YABAN_MODEL_TENANT_ID;

  return {
    clinics,
    isLoading,
    currentTenantId: current?.tenantId ?? currentTenantId ?? null,
    current,
    isModel,
    selectClinic,
    hasMultiple: clinics.length > 1,
  };
}
