import { useLocation } from 'wouter';
import { useAuth } from '@/_core/hooks/useAuth';
import { trpc } from '@/lib/trpc';
import MoutaiDetailView from '@/components/MoutaiDetailView';
import MoutaiWalletPayment from './MoutaiWalletPayment';

/** Draft product review only. The native page uses the existing tRPC auth.me
 * identity. No query-string role, mock identity, cart mutation or order write. */
export default function MoutaiFeitianDetail() {
  const [, setLocation] = useLocation();
  const { user, loading, refresh } = useAuth();
  const isAdmin = !!user && (['super_admin', 'admin', 'parent'].includes(user.role) || (user as any).mibanRole === 'parent');
  const cryptoPrices = trpc.getCryptoPrices.useQuery(undefined, {
    enabled: isAdmin,
    refetchInterval: 30_000,
    staleTime: 30_000,
  });
  const rawRate = Number(cryptoPrices.data?.usdtCnyRate ?? 0);
  const usdtCnyRate = !cryptoPrices.isError && cryptoPrices.data?.usdtCnyFx?.stale === false && Number.isFinite(rawRate) && rawRate > 0 ? rawRate : null;
  const fxAsOf = cryptoPrices.data?.usdtCnyFx && typeof cryptoPrices.data.usdtCnyFx === 'object'
    ? ((cryptoPrices.data.usdtCnyFx as { asOf?: string | null }).asOf ?? null)
    : null;
  if (!loading && !isAdmin) {
    return <div className="mx-auto min-h-screen max-w-[480px] bg-[#F4EBDD] px-6 py-10 text-center text-sm text-[#7A6B5A]">
      <p>商品资料审核中，仅管理员可预览。</p>
      <button type="button" onClick={() => setLocation('/p/proj_hzxm2t/limited')} className="mt-5 rounded-[8px] bg-[#9E2528] px-5 py-2.5 text-white">返回精选商品</button>
    </div>;
  }
  return <MoutaiDetailView
    identity={user && isAdmin ? { verified: true, name: user.name || user.username || '管理员', role: user.role, mibanRole: (user as any).mibanRole, mode: 'readonly-admin-preview' } : null}
    identityLoading={loading}
    onRetryIdentity={() => { void refresh(); }}
    onBack={() => setLocation('/p/proj_hzxm2t/limited/guizhou')}
    usdtCnyRate={usdtCnyRate}
    fxAsOf={fxAsOf}
    renderPayment={(total) => <MoutaiWalletPayment totalCny={total} />}
  />;
}
