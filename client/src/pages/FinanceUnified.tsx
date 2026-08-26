import { useState, useCallback, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { ChevronLeft } from "lucide-react";
import FunderManagement from "./FunderManagement";
export default function FinanceUnified() {
  const [, params] = useRoute("/ledger/:id/finance-unified");
  const [, setLocation] = useLocation();
  const ledgerId = params?.id ? parseInt(params.id) : 0;
  const [activeTab, setActiveTab] = useState<'funder' | 'admin' | 'finance'>('funder');
  // 观察视角：从 URL ?viewAs=xxx 读取
  const urlSearchParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const viewAsUserId = urlSearchParams.get('viewAs') ? parseInt(urlSearchParams.get('viewAs')!) : undefined;
  // 回收站打开函数引用
  const openRecycleBinRef = useRef<(() => void) | null>(null);
  const handleRecycleBinRef = useCallback((openFn: () => void) => {
    openRecycleBinRef.current = openFn;
  }, []);
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F0F4FF' }}>
      {/* 顶部导航 */}
      <div
        className="sticky top-0 z-10"
        style={{ background: 'linear-gradient(135deg, #1A56DB 0%, #3B82F6 100%)' }}
      >
        <div className="px-4 py-3 flex items-center gap-3">
          <button onClick={() => setLocation(`/ledger/${ledgerId}/settings${viewAsUserId ? `?viewAs=${viewAsUserId}` : ''}`)} className="p-1 -ml-2">
            <ChevronLeft className="w-6 h-6 text-white" />
          </button>
          <h1 className="text-lg font-semibold text-white flex-1">融资付息订单管理</h1>
          <button
            onClick={() => setLocation(`/ledger/${ledgerId}/af-recharge-manage?tab=adjust`)}
            className="text-sm font-medium px-2.5 py-1 rounded-full"
            style={{ color: 'rgba(255,255,255,0.95)', background: 'rgba(255,255,255,0.15)' }}
            title="充值管理－手动调账"
          >充值</button>
          <button
            onClick={() => openRecycleBinRef.current?.()}
            className="p-1.5 rounded-full"
            style={{ background: 'rgba(255,255,255,0.15)' }}
            title="回收站"
          >
            <svg className="w-4.5 h-4.5 text-white" width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          </button>
          <button
            onClick={() => window.location.reload()}
            className="text-sm font-medium px-3 py-1 rounded-full"
            style={{ color: 'rgba(255,255,255,0.9)', background: 'rgba(255,255,255,0.15)' }}
          >刷新</button>
        </div>
        {/* Tab 切换 - 三个 tab */}
        <div className="flex px-4 pb-0">
          <button
            onClick={() => setActiveTab('funder')}
            className="flex-1 py-2 text-sm font-medium text-center transition-all relative"
            style={{ color: activeTab === 'funder' ? '#fff' : 'rgba(255,255,255,0.6)' }}
          >
            左侧（资方）
            {activeTab === 'funder' && (
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-0.5 bg-white rounded-full" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('admin')}
            className="flex-1 py-2 text-sm font-medium text-center transition-all relative"
            style={{ color: activeTab === 'admin' ? '#fff' : 'rgba(255,255,255,0.6)' }}
          >
            中侧（管理）
            {activeTab === 'admin' && (
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-0.5 bg-white rounded-full" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('finance')}
            className="flex-1 py-2 text-sm font-medium text-center transition-all relative"
            style={{ color: activeTab === 'finance' ? '#fff' : 'rgba(255,255,255,0.6)' }}
          >
            右侧（借方）
            {activeTab === 'finance' && (
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-0.5 bg-white rounded-full" />
            )}
          </button>
        </div>
      </div>
      {/* Tab 内容 */}
      <div>
        {activeTab === 'funder' && (
          <FunderManagement ledgerIdProp={ledgerId} hideHeader onRecycleBinRef={handleRecycleBinRef} />
        )}
        {activeTab === 'admin' && (
          <FunderManagement ledgerIdProp={ledgerId} hideHeader adminOnly onRecycleBinRef={handleRecycleBinRef} />
        )}
        {activeTab === 'finance' && (
          <FunderManagement ledgerIdProp={ledgerId} hideHeader financeOnly onRecycleBinRef={handleRecycleBinRef} />
        )}
      </div>
    </div>
  );
}
