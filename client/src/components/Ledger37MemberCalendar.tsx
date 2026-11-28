import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ledger37DataDailyRows, type Ledger37DataMember } from '@shared/ledger37-data-management';
import { ledger37CalendarMonth, ledger37MemberReturnCurve } from '@shared/ledger37-data-calendar';
import { ledger37MoneyText as amountText, ledger37MoneyColor as amountColor, ledger37CompactMoneyText as compact, ledger37CompactMoneyColor as compactColor } from '@/lib/ledger37-money-display';

const todayKey = () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);

export default function Ledger37MemberCalendar({ member }: { member: Ledger37DataMember }) {
  const dailyRows = useMemo(() => ledger37DataDailyRows(member.tags), [member.tags]);
  const dailyByDate = useMemo(() => new Map(dailyRows.map(row => [row.date, row])), [dailyRows]);
  const [month, setMonth] = useState(() => member.dailyAsOf?.slice(0, 7) || dailyRows[0]?.date.slice(0, 7) || todayKey().slice(0, 7));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [curveScope, setCurveScope] = useState<'month' | 'all'>('all');
  const calendar = useMemo(() => ledger37CalendarMonth(month), [month]);
  const curve = useMemo(() => ledger37MemberReturnCurve(member.tags), [member.tags]);
  const curveData = useMemo(() => curve.filter(point => curveScope === 'all' || point.date.startsWith(month)).map(point => ({
    ...point, completeReturn: point.totalPnl, partialReturn: point.totalPnl === null ? point.verifiedSubtotal : null,
  })), [curve, curveScope, month]);
  const hasCurve = curveData.some(point => point.totalPnl !== null || point.verifiedSubtotal !== null);
  const hasPartialCurve = curveData.some(point => point.totalPnl === null && point.verifiedSubtotal !== null);
  const selected = selectedDate ? dailyByDate.get(selectedDate) : undefined;
  const changeMonth = (value: string) => {
    if (/^(?:19\d{2}|20\d{2}|21\d{2}|2200)-(?:0[1-9]|1[0-2])$/.test(value)) { setMonth(value); setSelectedDate(null); }
  };
  const shiftMonth = (delta: number) => {
    const [year, value] = month.split('-').map(Number);
    changeMonth(new Date(Date.UTC(year, value - 1 + delta, 1)).toISOString().slice(0, 7));
  };
  return <div className="px-3 pb-3" data-testid="member-calendar">
    <div className="flex items-center justify-between py-3">
      <button aria-label="日历上个月" disabled={month === '1900-01'} onClick={() => shiftMonth(-1)} className="p-1.5 text-[#947866] disabled:opacity-30"><ChevronLeft size={16} /></button>
      <input aria-label="日历月份" type="month" min="1900-01" max="2200-12" value={month} onChange={event => changeMonth(event.target.value)} className="rounded-md border border-[#E5E1DD] bg-white px-2 py-1 text-xs text-[#625449]" />
      <button aria-label="日历下个月" disabled={month === '2200-12'} onClick={() => shiftMonth(1)} className="p-1.5 text-[#947866] disabled:opacity-30"><ChevronRight size={16} /></button>
    </div>
    <div className="rounded-lg border border-[#E8E2DA] bg-white p-2">
      <div className="mb-1 grid grid-cols-7 text-center text-[10px] text-[#A09488]">{['一', '二', '三', '四', '五', '六', '日'].map(day => <div key={day} className="py-1">{day}</div>)}</div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: calendar.leadingEmpty }, (_, index) => <div key={`blank-${index}`} />)}
        {calendar.days.map(day => {
          const row = dailyByDate.get(day.date);
          const amount = row ? row.amount ?? row.verifiedSubtotal : null;
          const partial = !!row && row.amount === null && row.verifiedSubtotal !== null;
          const future = day.date > todayKey();
          const active = selectedDate === day.date;
          return <button key={day.date} data-calendar-date={day.date} disabled={future || !row} onClick={() => setSelectedDate(active ? null : day.date)} aria-label={`${day.date} 收益${amountText(amount)}元${partial ? '，已确认小计' : ''}`} className={`flex min-h-[60px] min-w-0 flex-col items-center justify-center rounded-md border px-0.5 py-1 ${active ? 'border-[#BC7964] bg-[#F8EEE5]' : 'border-transparent hover:bg-[#FAF7F2]'} disabled:cursor-default disabled:hover:bg-transparent`}>
            <span className={`text-[11px] ${future ? 'text-gray-300' : day.date === todayKey() ? 'font-semibold text-[#A74D40]' : 'text-[#6C625A]'}`}>{day.day}</span>
            <span className="mt-1 w-full truncate text-center font-mono text-[9px]" style={{ color: compactColor(amount) }}>{amount === null ? '—' : compact(amount)}</span>
            <span className="h-3 text-[8px] text-[#AA9683]">{partial ? '小计' : ''}</span>
          </button>;
        })}
      </div>
      <div className="mt-1 border-t border-[#F0EDE8] pt-2 text-[9px] leading-4 text-[#A29487]">每天显示该用户当天的收益；点击日期查看明细。标记“小计”的日期未包含缺失标签。</div>
    </div>
    <div className="mt-3 rounded-lg border border-[#E8E2DA] bg-white px-2 pt-3 pb-2" data-testid="member-return-curve">
      <div className="flex items-center justify-between px-1"><div><h3 className="text-xs font-semibold text-[#655348]">收益曲线</h3><div className="mt-0.5 text-[9px] text-[#A79B90]">累计收益 · 元</div></div><div className="flex rounded-md bg-[#F5F1EB] p-0.5 text-[10px]">{([['month', '本月'], ['all', '全部']] as const).map(([scope, label]) => <button key={scope} onClick={() => setCurveScope(scope)} className={`rounded px-2 py-1 ${curveScope === scope ? 'bg-white text-[#A74D40] shadow-sm' : 'text-[#A29487]'}`}>{label}</button>)}</div></div>
      {hasCurve ? <div className="mt-2 h-[185px] min-w-0" role="img" aria-label={`${member.displayName}的累计收益曲线${hasPartialCurve ? '，虚线为已确认小计' : ''}`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={curveData} margin={{ top: 8, right: 9, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="#EEE9E3" strokeDasharray="3 3" />
            <XAxis dataKey="date" tickFormatter={value => String(value).slice(5).replace('-', '/')} tick={{ fontSize: 9, fill: '#AA9C8D' }} axisLine={false} tickLine={false} minTickGap={25} />
            <YAxis tickFormatter={value => compact(Number(value)).replace(/^\+/, '')} tick={{ fontSize: 9, fill: '#AA9C8D' }} axisLine={false} tickLine={false} width={48} />
            <ReferenceLine y={0} stroke="#DCD4CB" />
            {selectedDate && <ReferenceLine x={selectedDate} stroke="#B99A86" strokeDasharray="3 3" />}
            <Tooltip content={({ active, payload }) => {
              const point = payload?.[0]?.payload;
              return active && point ? <div className="max-w-[220px] rounded-md border border-[#E6DDD4] bg-white p-2 text-[10px] shadow-sm"><div className="text-[#887462]">{point.date}</div><div className="mt-1 font-mono" style={{ color: amountColor(point.totalPnl ?? point.verifiedSubtotal) }}>{amountText(point.totalPnl ?? point.verifiedSubtotal)} 元</div><div className="mt-1 text-[9px] text-gray-400">{point.totalPnl === null ? `已确认小计，${point.pendingTagNames.length} 个标签未计入` : '已确认累计收益'}</div></div> : null;
            }} />
            <Line name="累计收益" type="linear" dataKey="completeReturn" stroke="#B65A49" strokeWidth={1.8} dot={curveData.length === 1 ? { r: 2 } : false} activeDot={{ r: 3 }} connectNulls={false} isAnimationActive={false} />
            <Line name="已确认小计" type="linear" dataKey="partialReturn" stroke="#AB8E75" strokeWidth={1.6} strokeDasharray="4 3" dot={curveData.length === 1 ? { r: 2 } : false} activeDot={{ r: 3 }} connectNulls={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div> : <div className="py-10 text-center text-[11px] text-gray-400">该区间暂无已确认收益曲线</div>}
      <p className="px-1 pt-1 text-[9px] leading-4 text-[#A79B90]">各标签采用截至该日最近已确认的累计收益，包含暂停前回报；{hasPartialCurve ? '虚线仅为已确认小计，缺失数据不补 0。' : '缺失数据不补 0。'}</p>
    </div>
    {selectedDate && <div className="mt-3 rounded-lg border border-[#E8E2DA] bg-white p-3" data-testid="calendar-day-detail">
      <div className="flex items-center justify-between text-xs"><span className="text-[#7E6D5E]">{selectedDate}</span><span className="font-mono font-semibold" style={{ color: amountColor(selected ? selected.amount ?? selected.verifiedSubtotal : null) }}>{amountText(selected ? selected.amount ?? selected.verifiedSubtotal : null)} 元</span></div>
      {selected?.pending ? <p className="mt-1 text-[10px] leading-4 text-[#A58C76]">已确认小计；{selected.pending} 个标签该日未计入。</p> : null}
      {selected && <details className="mt-2 border-t border-[#F0EDE8] pt-2"><summary className="cursor-pointer text-[11px] text-[#95816E]">标签明细（{selected.parts.length}）</summary><div className="mt-2 space-y-1.5">{selected.parts.map(part => <div key={part.categoryId} className="flex justify-between gap-2 text-[10px]"><span className="min-w-0 truncate text-gray-500">{part.name}</span><span className="shrink-0 font-mono" style={{ color: amountColor(part.point?.dailyPnl ?? null) }}>{amountText(part.point?.dailyPnl ?? null)}</span></div>)}</div></details>}
    </div>}
  </div>;
}
