import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { ChevronLeft } from "lucide-react";
import { PageTag } from "@/components/PageTag";
import FunderManagement from "./FunderManagement";
import FinanceManagement from "./FinanceManagement";

export default function FinanceUnified() {
  const [, params] = useRoute("/ledger/:id/finance-unified");
  const [, setLocation] = useLocation();
  const ledgerId = params?.id ? parseInt(params.id) : 0;
  const [activeTab, setActiveTab] = useState<'funder' | 'finance'>('funder');

  // 观察视角：从 URL ?viewAs=xxx 读取
  const urlSearchParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const viewAsUserId = urlSearchParams.get('viewAs') ? parseInt(urlSearchParams.get('viewAs')!) : undefined;

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F0F4FF' }}>
      <PageTag code="P095" />
      {/* 顶部导航 */}
      <div
        className="sticky top-0 z-10"
        style={{ background: 'linear-gradient(135deg, #1A56DB 0%, #3B82F6 100%)' }}
      >
        <div className="px-4 py-3 flex items-center gap-3">
          <button onClick={() => setLocation(`/ledger/${ledgerId}/settings${viewAsUserId ? `?viewAs=${viewAsUserId}` : ''}`)} className="p-1 -ml-2">
            <ChevronLeft className="w-6 h-6 text-white" />
          </button>
          <h1 className="text-lg font-semibold text-white">融资付息订单管理</h1>
        </div>
        {/* Tab 切换 */}
        <div className="flex px-4 pb-0">
          <button
            onClick={() => setActiveTab('funder')}
            className="flex-1 py-2 text-sm font-medium text-center transition-all relative"
            style={{ color: activeTab === 'funder' ? '#fff' : 'rgba(255,255,255,0.6)' }}
          >
            资方管理
            {activeTab === 'funder' && (
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-0.5 bg-white rounded-full" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('finance')}
            className="flex-1 py-2 text-sm font-medium text-center transition-all relative"
            style={{ color: activeTab === 'finance' ? '#fff' : 'rgba(255,255,255,0.6)' }}
          >
            融资付息
            {activeTab === 'finance' && (
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-0.5 bg-white rounded-full" />
            )}
          </button>
        </div>
      </div>

      {/* Tab 内容 */}
      <div>
        {activeTab === 'funder' && (
          <FunderManagement ledgerIdProp={ledgerId} hideHeader />
        )}
        {activeTab === 'finance' && (
          <FinanceManagement ledgerIdProp={ledgerId} hideHeader />
        )}
      </div>
    </div>
  );
}
