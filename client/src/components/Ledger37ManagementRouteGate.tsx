import type { ReactNode } from 'react';
import { useLocation, useSearch } from 'wouter';
import { useAuth } from '@/_core/hooks/useAuth';
import { Ledger37PresentationGate, useLedger37PresentationContext } from '@/components/Ledger37AiHome';

const MANAGEMENT_PAGES = [
  'settings', 'equity-manage', 'equity-weight-manage', 'member-manage', 'shortcut-buttons',
  'interest-manage', 'aa-initial-balance', 'deposit-manage', 'aa-dividend-manage',
  'admin-transactions', 'import', 'edit-name', 'invite', 'permissions', 'approval-settings',
  'member-info', 'pending-approvals', 'ai-employees', 'admin-management', 'categories',
  'features', 'deleted-records', 'af-withdraw-manage', 'af-recharge-manage', 'af-order-manage',
  'af-payout-manage', 'wave-ratio-manage', 'live-price-admin', 'market-eval-settings',
];

export function isLedger37ManagementPath(path: string): boolean {
  const match = /^\/ledger\/([^/]+)\/([^/?#]+)/.exec(path);
  return Boolean(match && Number(match[1]) === 37 && MANAGEMENT_PAGES.indexOf(match[2]) >= 0);
}

function Ledger37OwnerPage({ children }: { children: ReactNode }) {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { user } = useAuth();
  const presentation = useLedger37PresentationContext({ ledgerId: 37, search, authUserId: user?.id });
  return <Ledger37PresentationGate ledgerId={37} presentation={presentation} onBack={() => setLocation('/ledger/37')}>
    {presentation.context?.canManage === true ? children : <div className="min-h-screen bg-[#FAF3ED] p-5">
      <p role="alert" className="mt-10 text-center text-sm text-[#757575]">此管理页面仅账本所有者可用</p>
      <button type="button" onClick={() => setLocation('/ledger/37')} className="mt-4 w-full text-sm text-[#D32F2F]">返回账本</button>
    </div>}
  </Ledger37PresentationGate>;
}

/** 普通页和非37完全直通；37管理页先确认owner，再挂载Switch内原页面及其查询。 */
export default function Ledger37ManagementRouteGate({ children }: { children: ReactNode }) {
  const [path] = useLocation();
  return isLedger37ManagementPath(path) ? <Ledger37OwnerPage>{children}</Ledger37OwnerPage> : <>{children}</>;
}
