import { useEffect, useRef, useState } from "react";
import { WalletCards, X } from "lucide-react";
import { getCryptoAssetIconSrc } from "@/lib/cryptoAssetIcons";
import { getInternalTransferPresentation } from "@/lib/walletTransferPresentation";
import { selectWalletAccountByLatestFlow } from "@/lib/walletAccountSelection";

// MySQL timestamp strings are stored as Beijing wall-clock values; format with UTC accessors.
const fmtBJTime = (d: any, withTime = true): string => {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '';
  const mo = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const da = String(dt.getUTCDate()).padStart(2, '0');
  if (!withTime) return `${mo}/${da}`;
  const hh = String(dt.getUTCHours()).padStart(2, '0');
  const mi = String(dt.getUTCMinutes()).padStart(2, '0');
  return `${mo}/${da} ${hh}:${mi}`;
};

const SNAPSHOT_ASSET_ACCENTS: Record<string, string> = {
  USDT: '#26A17B',
  BTC: '#F7931A',
  ETH: '#627EEA',
  SOL: '#A55CFF',
  BNB: '#F3BA2F',
  SUI: '#4DA2FF',
  CNY: '#C9A84C',
};

function SnapshotAssetIcon({ assetCode, size = 'md' }: { assetCode: unknown; size?: 'sm' | 'md' }) {
  const code = String(assetCode || '').trim().toUpperCase() || '—';
  const iconSrc = getCryptoAssetIconSrc(code);
  const accent = SNAPSHOT_ASSET_ACCENTS[code] || '#8AA0B8';
  const dimension = size === 'sm' ? 'h-4 w-4 text-[8px]' : 'h-9 w-9 text-xs';
  return (
    <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold ${dimension}`} style={{ background: `${accent}25`, color: accent, border: `1px solid ${accent}55` }}>
      {iconSrc ? <img src={iconSrc} alt={`${code} 币种图标`} className="h-full w-full object-contain" /> : (code === 'CNY' ? '¥' : code.slice(0, 1))}
    </span>
  );
}

// 共享成员钱包快照：黑金信息层级仅展示资产与流水，不提供任何资金操作。
// 每个入口均使用各自的专属只读接口，并由服务端再次校验目标成员的查看范围。
export function ReadonlyWalletSnapshot({ snapshot, onClose }: {
  snapshot: any;
  onClose: () => void;
}) {
  const [account, setAccount] = useState<'CRYPTO' | 'CNY'>(() => selectWalletAccountByLatestFlow(
    [
      ...(snapshot?.balanceHistory || []).filter((entry: any) => !String(entry.description || '').startsWith('[CNY]')),
      ...(snapshot?.multiAssetHistory || []).filter((entry: any) => entry.eventType !== 'collateral_lock' && entry.eventType !== 'collateral_release'),
    ],
    snapshot?.cnyHistory || [],
  ));
  const [flowFilter, setFlowFilter] = useState('USDT');
  const autoFlowFilterRef = useRef(true);
  const usdtBalance = Number(snapshot?.usdtBalance || 0);
  const cnyBalance = Number(snapshot?.cnyBalance || 0);
  const usdtCnyRate = Number(snapshot?.usdtCnyRate || 7.25);
  const visibleAssets = new Set((snapshot?.visibleAssets || []).map((asset: unknown) => String(asset).toUpperCase()));
  const multiAssets = (snapshot?.multiAssetBalances || []).filter((asset: any) =>
    visibleAssets.has(String(asset.assetCode || '').toUpperCase())
    && Number(asset.totalBalance ?? (Number(asset.availableBalance || 0) + Number(asset.frozenBalance || 0))) > 0,
  );
  const digitalAssets = [
    ...(usdtBalance > 0 ? [{ assetCode: 'USDT', totalBalance: usdtBalance, availableBalance: usdtBalance, frozenBalance: 0, priceUsdt: 1 }] : []),
    ...multiAssets,
  ];
  const digitalTotalUsdt = usdtBalance + multiAssets.reduce((sum: number, asset: any) => sum + Number(asset.totalBalance || 0) * Number(asset.priceUsdt || 0), 0);
  const multiHistory = (snapshot?.multiAssetHistory || [])
    .filter((entry: any) => entry.eventType !== 'collateral_lock' && entry.eventType !== 'collateral_release');
  const usdtFlows = (snapshot?.balanceHistory || [])
    .filter((entry: any) => !String(entry.description || '').startsWith('[CNY]'))
    .map((entry: any) => ({ ...entry, assetCode: 'USDT', flowType: 'usdt' }));
  const allFlows = [
    ...usdtFlows,
    ...multiHistory.map((entry: any) => ({ ...entry, flowType: 'asset' })),
  ].sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const latestFlowAsset = String(allFlows[0]?.assetCode || '').toUpperCase();
  // 全部、USDT 固定在前；最近发生资金变动的币种固定第三位，其余币种随后排列。
  const flowOptions = Array.from(new Set([
    'ALL',
    'USDT',
    ...(latestFlowAsset && latestFlowAsset !== 'USDT' ? [latestFlowAsset] : []),
    ...digitalAssets.map((asset: any) => String(asset.assetCode || '').toUpperCase()),
    ...multiHistory.map((entry: any) => String(entry.assetCode || '').toUpperCase()),
  ])).filter(Boolean);
  useEffect(() => {
    if (account === 'CRYPTO' && autoFlowFilterRef.current) {
      setFlowFilter(latestFlowAsset || 'USDT');
    }
  }, [account, latestFlowAsset]);
  const flows = allFlows
    .filter((entry: any) => flowFilter === 'ALL' || String(entry.assetCode || '').toUpperCase() === flowFilter)
    .slice(0, 10);
  const money = (value: number, decimals = 2) => value.toLocaleString('zh-CN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const assetAmount = (asset: any) => {
    const code = String(asset.assetCode || '').toUpperCase();
    const digits = code === 'USDT' ? 2 : code === 'BTC' ? 8 : 4;
    return Number(asset.totalBalance || 0).toLocaleString('zh-CN', { maximumFractionDigits: digits });
  };
  const flowPresentation = (entry: any) => {
    const amount = Number(entry.amount || 0);
    const incoming = amount >= 0;
    const rawNote = String(entry.note || entry.description || '');
    const isTransfer = entry.flowType === 'asset'
      ? entry.eventType === 'transfer_in' || entry.eventType === 'transfer_out'
      : rawNote.includes('[站内转账]');
    const transfer = isTransfer
      ? getInternalTransferPresentation(rawNote, entry.eventType === 'transfer_in' || (!entry.eventType && incoming) ? 'in' : 'out', entry.counterpartyName)
      : null;
    return {
      primary: transfer?.primary || (entry.flowType === 'asset'
        ? (incoming ? '入账' : '扣除')
        : rawNote.replace(/^\[[^\]]+\]\s*/, '').trim() || (incoming ? '入账' : '扣除')),
      detail: transfer?.secondary || rawNote.replace(/^\[[^\]]+\]\s*/, '').replace(/\[站内转账\]\s*/g, '').trim(),
      incoming,
    };
  };
  const cnyFlows = (snapshot?.cnyHistory || []).slice(0, 10);

  return (
    <div className="fixed inset-0 z-[220] flex items-end justify-center bg-black/65" onClick={onClose}>
      <div className="w-full max-w-[480px] overflow-hidden rounded-t-[22px]" style={{ maxHeight: '88vh', background: 'linear-gradient(165deg,#181818 0%,#080808 100%)', border: '1px solid rgba(201,168,76,0.55)', boxShadow: '0 -12px 40px rgba(0,0,0,.5)' }} onClick={(event) => event.stopPropagation()}>
        <div className="h-px" style={{ background: 'linear-gradient(90deg,transparent 5%,#c9a84c 40%,#f5d78e 60%,transparent 95%)' }} />
        <div className="max-h-[calc(88vh-1px)] overflow-y-auto px-4 pb-7 pt-4">
          <div className="mb-3 rounded-xl px-3 py-2.5" style={{ background: 'linear-gradient(135deg, rgba(201,168,76,.13), rgba(255,255,255,.035))', border: '1px solid rgba(201,168,76,.32)' }}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-1.5 text-sm font-bold text-[#f5d78e]">
                <WalletCards className="h-4 w-4 shrink-0" />
                <span className="truncate">钱包实时快照</span>
                <span className="shrink-0 text-[10px] font-semibold text-white/55">·</span>
                <span className="shrink-0 text-[10px] font-semibold text-[#f5d78e]">只读模式，请查看</span>
              </div>
              <button type="button" onClick={onClose} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ background: 'rgba(255,255,255,.08)', color: '#f5d78e', border: '1px solid rgba(201,168,76,.34)' }} aria-label="关闭钱包快照"><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-1 flex min-w-0 flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-white/55">
              <span className="truncate">用户昵称：{snapshot?.member?.name || '成员'}</span>
              <span className="truncate">用户名：{snapshot?.member?.username ? `@${snapshot.member.username}` : '未设置'}</span>
            </div>
          </div>

          <div className="mb-3 grid grid-cols-2 gap-2 rounded-xl p-1" style={{ background: 'rgba(255,255,255,.045)', border: '1px solid rgba(255,255,255,.1)' }}>
            {([['CRYPTO', '数字币账户'], ['CNY', '人民币账户']] as const).map(([key, label]) => (
              <button key={key} type="button" onClick={() => setAccount(key)} className="rounded-lg py-2 text-xs font-semibold transition-colors" style={{ background: account === key ? 'rgba(201,168,76,.2)' : 'transparent', color: account === key ? '#f5d78e' : 'rgba(255,255,255,.52)' }}>{label}</button>
            ))}
          </div>

          {account === 'CRYPTO' ? <>
            <div className="mb-3 rounded-2xl px-4 py-3" style={{ background: 'rgba(201,168,76,.08)', border: '1px solid rgba(201,168,76,.24)' }}>
              <div className="text-[10px] tracking-[.08em] text-[#a88942]">数字资产总估值</div>
              <div className="mt-1 flex items-baseline gap-2"><span className="text-[28px] font-bold tabular-nums text-[#f5d78e]">{money(digitalTotalUsdt)}</span><span className="text-sm font-semibold text-[#a88942]">USDT</span></div>
              <div className="mt-1 text-[11px] text-white/45">≈ ¥{money(digitalTotalUsdt * usdtCnyRate)} 人民币 · 实时行情估值</div>
            </div>
            <div className="overflow-hidden rounded-xl" style={{ border: '1px solid rgba(255,255,255,.1)', background: 'rgba(255,255,255,.025)' }}>
              <div className="flex items-center justify-between border-b px-3 py-2 text-[11px]" style={{ borderColor: 'rgba(255,255,255,.09)', color: 'rgba(255,255,255,.52)' }}><span className="font-semibold text-white/85">数字资产</span><span>数量 / 估值（u）</span></div>
              {digitalAssets.length ? digitalAssets.map((asset: any, index: number) => {
                const available = Number(asset.availableBalance || 0);
                const frozen = Number(asset.frozenBalance || 0);
                const valuation = Number(asset.totalBalance || 0) * Number(asset.priceUsdt || 0);
                return <div key={asset.assetCode} className="flex items-center justify-between gap-2 px-3 py-3" style={{ borderBottom: index < digitalAssets.length - 1 ? '1px solid rgba(255,255,255,.08)' : 'none' }}>
                  <div className="flex min-w-0 items-center gap-2.5"><SnapshotAssetIcon assetCode={asset.assetCode} /><div className="min-w-0"><div className="text-sm font-bold text-white">{asset.assetCode}</div><div className="mt-0.5 text-[10px] text-white/45">可用 {assetAmount({ ...asset, totalBalance: available })}{frozen > 0 ? ` · 冻结 ${assetAmount({ ...asset, totalBalance: frozen })}` : ''}</div></div></div>
                  <div className="shrink-0 text-right"><div className="text-base font-bold tabular-nums text-white">{assetAmount(asset)} <span className="text-[10px] text-white/50">{asset.assetCode}</span></div><div className="mt-0.5 text-[11px] text-[#f5d78e]">≈ {money(valuation)} u</div></div>
                </div>;
              }) : <div className="px-3 py-7 text-center text-xs text-white/40">暂无数字资产</div>}
            </div>
            <div className="mt-3 border-t pt-3" style={{ borderColor: 'rgba(255,255,255,.1)' }}>
              <div className="mb-2 flex items-center justify-between"><div><span className="text-xs font-semibold text-white">最近资金明细</span><span className="ml-1.5 text-[10px] text-white/45">仅显示最近 10 笔</span></div><span className="text-[10px] text-white/45">优先最近变动币种</span></div>
              <div className="mb-2 flex gap-1.5 overflow-x-auto pb-0.5">
                {flowOptions.map((option) => <button key={option} type="button" onClick={() => { autoFlowFilterRef.current = false; setFlowFilter(option); }} className="flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-semibold" style={{ background: flowFilter === option ? 'linear-gradient(135deg, #F5D78E 0%, #C9A84C 100%)' : 'rgba(255,255,255,.06)', color: flowFilter === option ? '#15110A' : 'rgba(255,255,255,.52)', border: flowFilter === option ? '1px solid transparent' : '1px solid rgba(201,168,76,.25)' }}>{option !== 'ALL' && <SnapshotAssetIcon assetCode={option} size="sm" />}{option === 'ALL' ? '全部' : option}</button>)}
              </div>
              {flows.length ? flows.map((entry: any, index: number) => {
                const amount = Number(entry.amount || 0);
                const presentation = flowPresentation(entry);
                const assetCode = String(entry.assetCode || '').toUpperCase();
                return <div key={`${entry.flowType}-${entry.id}`} className="flex items-start justify-between gap-3 py-2.5" style={{ borderBottom: index < flows.length - 1 ? '1px solid rgba(255,255,255,.08)' : 'none' }}><div className="flex min-w-0 items-start gap-2.5"><span className="relative mt-0.5"><SnapshotAssetIcon assetCode={assetCode} size="md" /><span className="absolute bottom-0 right-0 h-2 w-2 rounded-full border-2" style={{ background: presentation.incoming ? '#6ee7b7' : '#fca5a5', borderColor: '#111' }} /></span><div className="min-w-0 pr-1"><div className="truncate text-xs font-medium text-white">{presentation.primary} <span className="font-normal text-white/45">· {assetCode}</span></div><div className="mt-0.5 text-[10px] text-white/45">{fmtBJTime(entry.createdAt, true)}</div>{presentation.detail && <div className="mt-0.5 max-w-48 truncate text-[10px] text-white/40">{presentation.detail}</div>}</div></div><div className="shrink-0 text-right"><div className="text-sm font-bold tabular-nums" style={{ color: presentation.incoming ? '#6ee7b7' : '#fca5a5' }}>{presentation.incoming ? '+' : '-'}{Math.abs(amount).toLocaleString('zh-CN', { maximumFractionDigits: assetCode === 'USDT' ? 2 : 8 })} {assetCode}</div></div></div>;
              }) : <div className="py-6 text-center text-xs text-white/40">暂无对应资金明细</div>}
            </div>
          </> : <>
            <div className="mb-3 rounded-2xl px-4 py-3" style={{ background: 'rgba(201,168,76,.08)', border: '1px solid rgba(201,168,76,.24)' }}><div className="text-[10px] tracking-[.08em] text-[#a88942]">人民币账户余额</div><div className="mt-1 flex items-baseline gap-2"><span className="text-[28px] font-bold tabular-nums text-[#f5d78e]">{money(cnyBalance)}</span><span className="text-sm font-semibold text-[#a88942]">CNY</span></div><div className="mt-1 text-[11px] text-white/45">≈ {money(cnyBalance / usdtCnyRate)} USDT</div></div>
            <div className="mt-3 border-t pt-3" style={{ borderColor: 'rgba(255,255,255,.1)' }}><div className="mb-2 flex items-center justify-between"><div><span className="text-xs font-semibold text-white">最近资金明细</span><span className="ml-1.5 text-[10px] text-white/45">仅显示最近 10 笔</span></div><span className="text-[10px] text-white/45">CNY</span></div>{cnyFlows.length ? cnyFlows.map((entry: any, index: number) => { const amount = Number(entry.amount || 0); const isIn = amount >= 0; return <div key={entry.id} className="flex items-start justify-between gap-3 py-2.5" style={{ borderBottom: index < cnyFlows.length - 1 ? '1px solid rgba(255,255,255,.08)' : 'none' }}><div className="flex min-w-0 items-start gap-2.5"><span className="relative mt-0.5"><SnapshotAssetIcon assetCode="CNY" /><span className="absolute bottom-0 right-0 h-2 w-2 rounded-full border-2" style={{ background: isIn ? '#6ee7b7' : '#fca5a5', borderColor: '#111' }} /></span><div className="min-w-0"><div className="truncate text-xs font-medium text-white">{String(entry.note || '').replace(/^\[CNY\]\s*/, '') || (isIn ? '入账' : '扣除')} <span className="font-normal text-white/45">· CNY</span></div><div className="mt-0.5 text-[10px] text-white/45">{fmtBJTime(entry.created_at || entry.createdAt, true)}</div></div></div><div className="shrink-0 text-right"><div className="text-sm font-bold tabular-nums" style={{ color: isIn ? '#6ee7b7' : '#fca5a5' }}>{isIn ? '+' : '-'}{Math.abs(amount).toFixed(2)} CNY</div></div></div>; }) : <div className="py-6 text-center text-xs text-white/40">暂无人民币资金明细</div>}</div>
          </>}
        </div>
      </div>
    </div>
  );
}
