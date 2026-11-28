import { useMemo, useState } from 'react';
import { useLocation, useParams } from 'wouter';
import { ChevronDown, ChevronLeft, RefreshCw, Settings2, X } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { UserAvatar } from '@/components/UserAvatar';
import Ledger37MemberCalendar from '@/components/Ledger37MemberCalendar';
import { ledger37DataDailyRows, ledger37MemberConfigPath, type Ledger37DataManagementResult, type Ledger37DataMember } from '@shared/ledger37-data-management';
import { ledger37MoneyText as money, ledger37MoneyColor as color } from '@/lib/ledger37-money-display';

const shortDate = (date: string | null) => date ? date.slice(2).replaceAll('-', '/') : '未设置';
const memberReturn = (member: Ledger37DataMember) => member.totalPnl ?? member.verifiedSubtotal;
const memberDaily = (member: Ledger37DataMember) => member.latestDailyPnl ?? member.dailyVerifiedSubtotal ?? null;
function realView(): boolean {
  try { const params = new URLSearchParams(window.location.search); return !params.has('viewAs') && sessionStorage.getItem('view-as-user-id') === null && !['1', 'true'].includes(params.get('readonly') ?? ''); } catch { return false; }
}

function MemberDetails({ member, canEdit, onClose, onSettings }: { member: Ledger37DataMember; canEdit: boolean; onClose: () => void; onSettings: () => void }) {
  const [tab, setTab] = useState<'tags' | 'daily' | 'calendar'>('tags');
  const [month, setMonth] = useState('');
  const [dailyPage, setDailyPage] = useState(1);
  const [openTag, setOpenTag] = useState<number | null>(null);
  const dailyRows = useMemo(() => ledger37DataDailyRows(member.tags), [member]);
  const orderedTags = useMemo(() => [...member.tags].sort((a, b) =>
    Number(b.name.trim().toUpperCase() === 'R1') - Number(a.name.trim().toUpperCase() === 'R1')
    || Number(a.status === 'paused') - Number(b.status === 'paused')), [member.tags]);
  const filteredDays = dailyRows.filter(row => !month || row.date.startsWith(month));
  const totalPages = Math.max(1, Math.ceil(filteredDays.length / 10));
  const dayPage = Math.min(dailyPage, totalPages);
  return <section className="border-y border-[#E8E4E0] bg-[#FAF9F7]" data-testid="member-detail">
    <div className="flex items-center justify-between px-3 pt-3">
      <div className="flex min-w-0 items-center gap-2"><UserAvatar username={member.username} nickname={member.displayName} avatar={member.avatar} size="sm" className="h-8 w-8 rounded-full" /><div className="min-w-0"><div className="truncate text-sm font-semibold text-[#333]">{member.displayName}</div><div className="text-[10px] text-gray-400">@{member.username} · 开始 {shortDate(member.startDate)}</div></div></div>
      <div className="flex shrink-0 gap-1">{canEdit && <button type="button" onClick={onSettings} className="flex items-center gap-1 rounded-md border border-[#E4D8D1] bg-white px-2 py-1.5 text-[11px] text-[#8D5C42]"><Settings2 size={12} />数据设置</button>}<button aria-label="收起用户详情" onClick={onClose} className="p-1.5 text-gray-400"><X size={16} /></button></div>
    </div>
    <div className="grid grid-cols-2 gap-3 px-3 py-3">
      <div><div className="text-[10px] text-gray-500">{member.totalPnl === null && member.verifiedSubtotal !== null ? '已确认累计小计' : '累计回报'} · 元</div><div className="mt-1 font-mono text-lg font-semibold" style={{ color: color(memberReturn(member)) }}>{money(memberReturn(member))}</div><div className="mt-1 text-[10px] leading-4 text-gray-400">{member.asOfDates.length === 1 ? `截至 ${member.asOfDates[0]}` : member.asOfDates.length ? '各标签截至各自已确认日期' : '暂无已确认回报'}</div></div>
      <div><div className="text-[10px] text-gray-500">{member.latestDailyPnl === null && member.dailyVerifiedSubtotal != null ? '已更新日回报小计' : '最近日回报'} · 元</div><div className="mt-1 font-mono text-lg font-semibold" style={{ color: color(memberDaily(member)) }}>{money(memberDaily(member))}</div><div className="mt-1 text-[10px] leading-4 text-gray-400">{member.dailyDate ?? member.dailyAsOf ?? (member.dailyPendingCount ? '部分标签尚未更新' : '暂无日回报')}{member.latestDailyPnl === null && member.dailyPendingCount > 0 ? ` · ${member.dailyPendingCount} 个标签未计入` : ''}</div></div>
    </div>
    {member.pendingTagNames.length > 0 && <div className="mx-3 mb-3 rounded-md bg-[#F1EDE7] px-2.5 py-2 text-[11px] leading-5 text-[#826D57]">已确认标签小计 <span style={{ color: color(member.verifiedSubtotal) }}>{money(member.verifiedSubtotal)}</span> 元；完整累计暂不可用。未计入：{member.pendingTagNames.join('、')}。</div>}
    <div className="flex border-b border-[#E5E1DD] px-3">{([['tags', `标签回报（${member.tagCount}）`], ['daily', '每日回报'], ['calendar', '日历模式']] as const).map(([key, title]) => <button key={key} onClick={() => setTab(key)} className={`flex-1 py-2 text-xs ${tab === key ? 'border-b-2 border-[#B45E4F] font-semibold text-[#A74D40]' : 'text-gray-400'}`}>{title}</button>)}</div>
    {tab === 'calendar' ? <Ledger37MemberCalendar member={member} /> : tab === 'tags' ? <div className="px-3 pb-3">
      <div className="grid grid-cols-[1.4fr_1fr_1fr] gap-2 px-2 py-2 text-[10px] text-gray-400"><span>标签 / 开始日期</span><span className="text-right">累计回报</span><span className="text-right">最近日回报</span></div>
      {member.tags.length === 0 && <div className="py-6 text-center text-xs text-gray-400">该用户暂无参与标签</div>}
      {orderedTags.map(tag => <div key={tag.categoryId} data-member-tag-status={tag.status} className={`border-t border-[#EAE7E3] ${tag.status === 'paused' ? 'bg-[#EAE7E3]' : 'bg-white'}`}><button onClick={() => setOpenTag(openTag === tag.categoryId ? null : tag.categoryId)} className="grid w-full grid-cols-[1.4fr_1fr_1fr] items-center gap-2 px-2 py-2 text-left">
        <div className="min-w-0"><div className="flex items-center gap-1 text-xs"><span className="truncate text-[#45413D]">{tag.name}</span><ChevronDown size={11} className={`shrink-0 text-gray-400 ${openTag === tag.categoryId ? 'rotate-180' : ''}`} /></div><div className="mt-0.5 text-[9px] text-gray-400">{shortDate(tag.startDate)}{tag.status === 'paused' ? ' · 已暂停' : tag.status === 'ended' ? ' · 已结束' : ''}</div></div>
        <div className="text-right"><div className="font-mono text-[11px]" style={{ color: color(tag.totalPnl) }}>{money(tag.totalPnl)}</div><div className="mt-0.5 text-[9px] text-gray-400">{tag.asOf?.slice(5) ?? '—'}</div></div>
        <div className="text-right"><div className="font-mono text-[11px]" style={{ color: color(tag.dailyPnl) }}>{money(tag.dailyPnl)}</div><div className="mt-0.5 text-[9px] text-gray-400">{tag.dailyDate?.slice(5) ?? '—'}</div></div>
      </button>{openTag === tag.categoryId && <div className={`mx-2 mb-2 rounded-md px-2.5 py-2 text-[11px] leading-5 text-gray-500 ${tag.status === 'paused' ? 'bg-[#F3F1EE]' : 'bg-white'}`}>{tag.notice ?? '按该用户的实际参与数据计算。'}<div className="text-[10px] text-gray-400">{tag.accountingMode === 'stock_portfolio' ? '个人持仓已确认日结；不含观察账户或总盘' : '个人账户回报；追加本金和提现不计作盈亏'}</div></div>}</div>)}
    </div> : <div className="px-3 pb-3">
      <div className="flex items-center justify-between py-2"><span className="text-[10px] text-gray-400">同日合计，缺少数据不按 0 计</span><input aria-label="筛选回报月份" type="month" value={month} onChange={event => { setMonth(event.target.value); setDailyPage(1); }} className="max-w-[140px] rounded border border-[#E5E1DD] bg-white px-1 py-1 text-[11px] text-gray-500" /></div>
      {month && <button onClick={() => { setMonth(''); setDailyPage(1); }} className="mb-2 text-[10px] text-[#A74D40]">查看全部日期</button>}
      {filteredDays.length === 0 && <div className="py-6 text-center text-xs text-gray-400">该区间暂无已确认日回报</div>}
      {filteredDays.slice((dayPage - 1) * 10, dayPage * 10).map(row => <details key={row.date} className="border-t border-[#EAE7E3]">
        <summary className="flex cursor-pointer list-none items-center justify-between py-2 text-xs"><span className="flex items-center gap-1 text-gray-600">{row.date}<ChevronDown size={11} /></span><span className="font-mono" style={{ color: color(row.amount ?? row.verifiedSubtotal) }}>{money(row.amount ?? row.verifiedSubtotal)} <span className="text-[9px] text-gray-400">{row.amount === null && row.verifiedSubtotal !== null ? '元 · 小计' : '元'}</span></span></summary>
        <div className="mb-2 space-y-1 rounded-md bg-white p-2 text-[11px]">{row.parts.map(part => <div key={part.categoryId} className="flex justify-between gap-2"><span className="truncate text-gray-500">{part.name}</span><span className="shrink-0 font-mono" style={{ color: color(part.point?.dailyPnl ?? null) }}>{money(part.point?.dailyPnl ?? null)}</span></div>)}{row.pending > 0 && <p className="pt-1 text-[10px] text-gray-400">{row.pending} 个标签该日尚无已确认回报，以上只为已确认小计，不是完整日合计。</p>}</div>
      </details>)}
      {totalPages > 1 && <div className="mt-3 flex items-center justify-center gap-5 text-[11px] text-gray-500"><button disabled={dayPage <= 1} onClick={() => setDailyPage(dayPage - 1)} className="p-1 disabled:opacity-30">上一页</button><span>{dayPage} / {totalPages}</span><button disabled={dayPage >= totalPages} onClick={() => setDailyPage(dayPage + 1)} className="p-1 disabled:opacity-30">下一页</button></div>}
    </div>}
  </section>;
}

export default function Ledger37DataManagement() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const [selectedUserId, setSelectedUserId] = useState<number | null>(() => {
    const raw = new URLSearchParams(window.location.search).get('userId');
    const id = Number(raw); return raw && Number.isSafeInteger(id) && id > 0 ? id : null;
  });
  const auth = trpc.auth.me.useQuery();
  const ledger = trpc.ledger.getById.useQuery({ ledgerId: 37 }, { enabled: !!auth.data?.id && Number(params.id) === 37 && realView(), staleTime: 0, refetchOnMount: 'always' });
  const enabled = Number(params.id) === 37 && realView() && !!auth.data?.id && !ledger.error && ['owner', 'admin'].includes(ledger.data?.userRole ?? '');
  const list = trpc.ledger.adminGetLedger37DataManagement.useQuery({ ledgerId: 37, allMembers: true }, { enabled, placeholderData: undefined, staleTime: 30_000, refetchOnWindowFocus: false, retry: false });
  const detail = trpc.ledger.adminGetLedger37DataManagement.useQuery({ ledgerId: 37, targetUserId: selectedUserId ?? undefined }, { enabled: enabled && !!selectedUserId, placeholderData: undefined, staleTime: 15_000, retry: false });
  const data = list.data as Ledger37DataManagementResult | undefined;
  const selected = (detail.data as Ledger37DataManagementResult | undefined)?.members[0];
  const close = () => setSelectedUserId(null);
  const renderDetails = () => selected ? <MemberDetails key={selected.userId} member={selected} canEdit={!!detail.data?.canEdit} onClose={close} onSettings={() => setLocation(ledger37MemberConfigPath(selected.userId))} /> : <div className="border-y bg-[#FAF9F7] px-4 py-6 text-center text-xs text-gray-400">{detail.error ? <><span>{detail.error.message}</span><button className="ml-2 text-[#A74D40]" onClick={() => void detail.refetch()}>重试</button><button className="ml-2" onClick={close}>收起</button></> : '正在读取该用户详情…'}</div>;
  const denied = Number(params.id) !== 37 || !realView() || auth.isError || (!auth.isPending && !auth.data) || ledger.isError || (!!ledger.data && !enabled);
  return <div className="min-h-screen bg-[#F4F3F1] pb-12"><div className="mx-auto max-w-[480px]">
    <header className="sticky top-0 z-10 border-b border-[#E7E2DC] bg-[#FAF9F7]/95 px-3 backdrop-blur"><div className="flex h-14 items-center justify-between"><button aria-label="返回账本设置" onClick={() => setLocation('/ledger/37/settings')} className="p-2 -ml-1 text-gray-600"><ChevronLeft size={21} /></button><h1 className="text-base font-semibold text-[#4A4039]">数据管理</h1><button aria-label="刷新数据" disabled={!enabled || list.isFetching} onClick={() => { void list.refetch(); if (selectedUserId) void detail.refetch(); }} className="p-2 text-[#947866] disabled:opacity-40"><RefreshCw size={17} className={list.isFetching ? 'animate-spin' : ''} /></button></div></header>
    {denied ? <div className="px-6 py-16 text-center text-sm text-gray-500">此页面仅供 37 号账本真实管理员查看，请退出用户代看后进入。</div> : <>
      <div className="mx-3 overflow-hidden rounded-lg border border-[#E5E0D9] bg-white">
        <div className="grid grid-cols-[1.1fr_.8fr_1.1fr_1fr] gap-1 border-b border-[#E8E4DF] bg-[#F9F7F4] px-3 py-2 text-[10px] text-[#9A8777]"><span>用户</span><span>开始日期</span><span className="text-right">累计回报</span><span className="text-right">最近日回报</span></div>
        {selectedUserId && !data?.members.some(member => member.userId === selectedUserId) && renderDetails()}
        {list.isError ? <div className="px-4 py-8 text-center text-xs text-gray-500"><p>{list.error.message}</p><button onClick={() => void list.refetch()} className="mt-3 text-[#A74D40]">重新读取</button></div> : list.isPending ? <div className="py-10 text-center text-xs text-gray-400">正在读取用户回报…</div> : data?.members.length === 0 ? <div className="py-10 text-center text-xs text-gray-400">未找到匹配用户</div> : data?.members.map(member => <div key={member.userId}>
          <button data-user-id={member.userId} onClick={() => setSelectedUserId(selectedUserId === member.userId ? null : member.userId)} className={`grid w-full grid-cols-[1.1fr_.8fr_1.1fr_1fr] items-center gap-1 border-b border-[#F0EDE9] px-3 py-3 text-left ${selectedUserId === member.userId ? 'bg-[#FAF6F0]' : 'hover:bg-[#FCFAF7]'}`}>
            <div className="min-w-0"><div className="flex items-center gap-1 text-xs font-medium text-[#48413C]"><span className="truncate">{member.displayName}</span><ChevronDown size={10} className={`shrink-0 text-gray-400 ${selectedUserId === member.userId ? 'rotate-180' : ''}`} /></div><div className="mt-1 truncate text-[9px] text-gray-400">@{member.username}</div></div>
            <div className="text-[10px] text-gray-500">{shortDate(member.startDate)}</div>
            <div className="text-right"><div className="font-mono text-[11px]" style={{ color: color(memberReturn(member)) }}>{money(memberReturn(member))}</div><div className="mt-1 text-[9px] text-gray-400">{member.pendingTagNames.length ? `小计·待${member.pendingTagNames.length}项` : `${member.tagCount} 个标签`}</div></div>
            <div className="text-right"><div className="font-mono text-[11px]" style={{ color: color(memberDaily(member)) }}>{money(memberDaily(member))}</div><div className="mt-1 text-[9px] text-gray-400">{(member.dailyDate ?? member.dailyAsOf)?.slice(5) ?? '—'}{member.latestDailyPnl === null && member.dailyVerifiedSubtotal != null ? ' · 小计' : ''}</div></div>
          </button>{selectedUserId === member.userId && renderDetails()}
        </div>)}
      </div>
      <p className="px-4 pt-4 text-[10px] leading-5 text-gray-400">开始日期取实际参与标签的最早开始日，不是注册日期。累计包含暂停前及已结束的个人回报；各标签的确认日期可能不同。</p>
    </>}
  </div></div>;
}
