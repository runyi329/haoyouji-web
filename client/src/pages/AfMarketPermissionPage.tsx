import React, { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { ArrowLeft } from "lucide-react";

function ToggleSwitch({ enabled, onChange, disabled }: { enabled: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      className="flex-shrink-0 relative inline-flex items-center rounded-full transition-colors duration-200 focus:outline-none"
      style={{
        width: 44,
        height: 26,
        backgroundColor: enabled ? '#3B82F6' : '#D1D5DB',
        opacity: disabled ? 0.6 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      <span
        className="inline-block rounded-full bg-white shadow transition-transform duration-200"
        style={{
          width: 20,
          height: 20,
          transform: enabled ? 'translateX(20px)' : 'translateX(3px)',
        }}
      />
    </button>
  );
}

export default function AfMarketPermissionPage() {
  const [, params] = useRoute("/ledger/:id/af-market-permission");
  const [, setLocation] = useLocation();
  const ledgerId = params?.id ? Number(params.id) : 0;
  const [search, setSearch] = useState('');

  const { data: permissions = [], refetch } = trpc.ledger.afGetMarketOrderPermissions.useQuery(
    { ledgerId },
    { enabled: !!ledgerId }
  );

  const setPermissionMutation = trpc.ledger.afSetMarketOrderPermission.useMutation({
    onSuccess: () => refetch(),
    onError: (e: any) => alert('设置失败：' + e.message),
  });

  const filtered = (permissions as any[]).filter((p: any) =>
    !search || (p.name || '').includes(search) || (p.username || '').includes(search)
  );

  const enabledCount = (permissions as any[]).filter((p: any) => p.enabled).length;

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#F5F5F5' }}>
      {/* 导航栏 */}
      <div style={{ background: 'linear-gradient(135deg,#1e3a8a 0%,#2563EB 100%)' }}>
        <div className="flex items-center px-4 pt-4 pb-3">
          <button
            onClick={() => setLocation(`/ledger/${ledgerId}/af-invite-tree`)}
            className="w-8 h-8 flex items-center justify-center rounded-full mr-3"
            style={{ background: 'rgba(255,255,255,0.18)' }}
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <div className="flex-1">
            <span className="text-white font-semibold text-base">市价键管理</span>
          </div>
          <div className="text-xs text-white opacity-70">
            已开启 {enabledCount} / {(permissions as any[]).length} 人
          </div>
        </div>
        {/* 说明文字 */}
        <div className="mx-4 mb-3 px-3 py-2 rounded-lg text-xs text-white opacity-80" style={{ background: 'rgba(255,255,255,0.12)' }}>
          开启后，该用户在下单页面可以看到并使用市价单功能；关闭则不可见。
          <br /><br />
          <span style={{ fontWeight: 600, color: '#FDE68A' }}>注意：</span>试价单单笔金额上限为 3000U，超过 3000U 请通过委托单下单。
        </div>
      </div>

      {/* 搜索框 */}
      <div className="mx-3 mt-3">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="搜索用户名..."
          className="w-full text-sm px-3 py-2 rounded-xl border border-gray-200 outline-none"
          style={{ backgroundColor: '#fff' }}
        />
      </div>

      {/* 用户列表 */}
      <div className="mx-3 mt-2 space-y-2">
        {filtered.length === 0 && (
          <div className="text-center py-10 text-gray-300 text-sm">暂无数据</div>
        )}
        {filtered.map((p: any) => (
          <div
            key={p.userId}
            className="flex items-center justify-between px-3 py-3 rounded-xl"
            style={{
              backgroundColor: '#fff',
              border: '1px solid #E5E7EB',
            }}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                style={{ backgroundColor: p.enabled ? '#3B82F6' : '#9E9E9E' }}
              >
                {(p.name || '?').charAt(0)}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold text-gray-800 truncate">{p.name}</span>
                  <span className="text-xs text-gray-400 flex-shrink-0">{p.username}</span>
                </div>
                <div className="text-xs text-gray-400">{p.orderCount ?? 0} 单</div>
              </div>
            </div>
            <ToggleSwitch
              enabled={p.enabled}
              onChange={() => setPermissionMutation.mutate({ ledgerId, userId: p.userId, enabled: !p.enabled })}
              disabled={setPermissionMutation.isLoading}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
