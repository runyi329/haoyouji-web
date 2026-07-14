/**
 * PositionLevelEdit.tsx
 * 档位编辑子页面 — 从 PositionCalc 点击进度条跳转进入
 * 路由: /ledger/:id/position-calc/:price
 * 保存/取消均返回上一页
 *
 * 战略筹码 / 战术筹码均支持多条记录，每条含「数量 + 止盈价 + 备注」
 * 底部显示战略总和与战术总和
 */
import React, { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { ChevronLeft, Check, X, Pencil, Plus, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

/** 单条筹码记录 */
/** 单条分戡记录 */
interface CostShareItem {
  name: string;                    // 分摊人姓名
  qty: string;                     // 分摊数量（ETH）
  dateFrom: string;                // 起始日期
  dateTo: string;                  // 结束日期
  interest: string;                // 利息金额
  interestCurrency?: 'CNY' | 'USDT'; // 利息币种，默认 USDT
}

/** 单条备注（带时间） */
interface NoteEntry {
  text: string;
  time: string; // ISO 字符串
}

interface ChipItem {
  qty: string;              // 数量（ETH）
  takeProfit: string;       // 止盈价（USD），可选
  notes: NoteEntry[];       // 多条备注列表（带时间）
  pending?: boolean;        // 挂单状态：true=挂单中，false/undefined=已成交
  totalCost?: string;       // 总成本（USDT）
  costShares?: CostShareItem[]; // 分摊明细
  expiryDate?: string;                // 行权日（YYYY-MM-DD）
  buyDate?: string;                    // 买入日（YYYY-MM-DD）
  strikePrice?: string;               // 行权价
  strikePriceCurrency?: 'ETH' | 'USDT'; // 行权价币种
  premium?: string;                   // 权利金
  totalCostCurrency?: 'ETH' | 'USDT'; // 总成本币种
  annualRate?: string;                 // 年化利率（%）
}

const emptyChip = (): ChipItem => ({ qty: '', takeProfit: '', notes: [], pending: false, totalCost: '', costShares: [] });

/** 从旧格式迁移到新格式 */
function migrateToItems(qty: number, notesJson: string): ChipItem[] {
  try {
    const parsed = JSON.parse(notesJson || '[]');
    // 新格式：[{qty, takeProfit, notes, pending?}]
    if (Array.isArray(parsed) && parsed.length > 0 && 'qty' in parsed[0]) {
      return parsed.map((x: any) => ({
        qty: String(x.qty ?? ''),
        takeProfit: String(x.takeProfit ?? ''),
        notes: Array.isArray(x.notes)
          ? x.notes.map((n: any) =>
              typeof n === 'string'
                ? { text: n, time: new Date().toISOString() }  // 旧格式 string 升级
                : { text: String(n.text ?? ''), time: String(n.time ?? new Date().toISOString()) }
            )
          : (x.note ? [{ text: x.note, time: new Date().toISOString() }] : []),
        pending: x.pending ?? false,
        totalCost: String(x.totalCost ?? ''),
        totalCostCurrency: (x.totalCostCurrency ?? 'USDT') as 'ETH' | 'USDT',
        costShares: Array.isArray(x.costShares)
          ? x.costShares.map((c: any) => ({
              name: String(c.name ?? ''),
              qty: String(c.qty ?? ''),
              dateFrom: String(c.dateFrom ?? ''),
              dateTo: String(c.dateTo ?? ''),
              interest: String(c.interest ?? c.amount ?? ''),
              interestCurrency: String(c.interestCurrency ?? 'U'),
            }))
          : [],
        expiryDate: String(x.expiryDate ?? ''),
        buyDate: String(x.buyDate ?? ''),
        strikePrice: String(x.strikePrice ?? ''),
        strikePriceCurrency: (x.strikePriceCurrency ?? 'USDT') as 'ETH' | 'USDT',
        premium: String(x.premium ?? ''),
        annualRate: String(x.annualRate ?? ''),
      }));
    }
    // 旧格式：[{text, time}] — 迁移
    if (qty > 0) {
      const noteText = parsed.map((n: any) => n.text).filter(Boolean).join('；');
      return [{ qty: String(qty), takeProfit: '', notes: noteText ? [{ text: noteText, time: new Date().toISOString() }] : [] }];
    }
    return [];
  } catch {
    return qty > 0 ? [{ qty: String(qty), takeProfit: '', notes: [] }] : [];
  }
}

/** 序列化为 JSON 存储 */
function serializeItems(items: ChipItem[]): string {
  return JSON.stringify(items.map(x => ({
    qty: parseFloat(x.qty) || 0,
    takeProfit: parseFloat(x.takeProfit) || 0,
    notes: (x.notes ?? []).map(n => ({ text: n.text, time: n.time })),
    pending: x.pending ?? false,
    totalCost: x.totalCost ?? '',
    totalCostCurrency: x.totalCostCurrency ?? 'USDT',
    costShares: x.costShares ?? [],
    expiryDate: x.expiryDate ?? '',
    buyDate: x.buyDate ?? '',
    strikePrice: x.strikePrice ?? '',
    strikePriceCurrency: x.strikePriceCurrency ?? 'USDT',
    premium: x.premium ?? '',
    annualRate: x.annualRate ?? '',
  })));
}

/** 求数量总和 */
function sumQty(items: ChipItem[]): number {
  return items.reduce((s, x) => s + (parseFloat(x.qty) || 0), 0);
}

/** 加权平均止盈价（只计算有止盈价的条目） */
function weightedAvgTakeProfit(items: ChipItem[]): number {
  let totalQty = 0, totalWeighted = 0;
  for (const x of items) {
    const q = parseFloat(x.qty) || 0;
    const tp = parseFloat(x.takeProfit) || 0;
    if (q > 0 && tp > 0) {
      totalQty += q;
      totalWeighted += q * tp;
    }
  }
  return totalQty > 0 ? totalWeighted / totalQty : 0;
}

// ---- 单条记录行组件（必须定义在组件外部，避免每次渲染重建导致输入框失焦）----
interface ChipRowProps {
  item: ChipItem;
  index: number;
  color: string;
  accentRgb: string;
  onChange: (field: keyof ChipItem, val: string | boolean | string[] | NoteEntry[] | CostShareItem[]) => void;
  onRemove: () => void;
  onSave?: () => void;
  saving?: boolean;
  justSaved?: boolean;
}

/** 单条备注行（需要 useRef，必须是独立组件） */
const NoteItem: React.FC<{
  note: NoteEntry;
  accentRgb: string;
  pending: boolean;
  isLast: boolean;
  onEdit: (val: string) => void;
  onRemove: () => void;
}> = ({ note, accentRgb, pending, isLast, onEdit, onRemove }) => {
  const inputRef = React.useRef<HTMLInputElement>(null);
  // 格式化时间：M/D HH:mm
  const timeLabel = React.useMemo(() => {
    try {
      const d = new Date(note.time);
      const mo = d.getMonth() + 1;
      const da = d.getDate();
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return `${mo}/${da} ${hh}:${mm}`;
    } catch { return ''; }
  }, [note.time]);
  return (
    <div>
      <div className="flex items-center gap-1.5 py-1">
        <span className="text-xs shrink-0" style={{ color: pending ? 'rgba(176,106,255,0.5)' : `rgba(${accentRgb},0.4)` }}>·</span>
        <input
          ref={inputRef}
          type="text"
          value={note.text}
          onChange={e => onEdit(e.target.value)}
          className="flex-1 text-xs outline-none bg-transparent"
          style={{ color: pending ? 'rgba(176,106,255,0.8)' : 'rgba(255,255,255,0.7)', borderBottom: '1px solid transparent' }}
          onFocus={e => (e.target.style.borderBottomColor = pending ? 'rgba(176,106,255,0.4)' : `rgba(${accentRgb},0.3)`)}
          onBlur={e => (e.target.style.borderBottomColor = 'transparent')}
        />
        <span className="shrink-0 text-xs" style={{ color: pending ? 'rgba(176,106,255,0.35)' : `rgba(${accentRgb},0.3)`, fontVariantNumeric: 'tabular-nums' }}>{timeLabel}</span>
        <button
          onClick={() => inputRef.current?.focus()}
          className="shrink-0 p-0.5 rounded"
          style={{ color: pending ? 'rgba(176,106,255,0.4)' : `rgba(${accentRgb},0.4)` }}
          title="编辑备注"
        >
          <Pencil className="w-3 h-3" />
        </button>
        <button
          onClick={onRemove}
          className="shrink-0 p-0.5 rounded"
          style={{ color: 'rgba(255,80,80,0.4)' }}
        >
          <X className="w-3 h-3" />
        </button>
      </div>
      {!isLast && (
        <div style={{ borderTop: `1px dashed ${pending ? 'rgba(176,106,255,0.15)' : `rgba(${accentRgb},0.12)`}` }} />
      )}
    </div>
  );
};

/** 单行分摊输入行（表格式，独立 state 避免失焦） */
const CostShareRow: React.FC<{
  share: CostShareItem;
  rowIndex: number;
  accentRgb: string;
  pending: boolean;
  isLast: boolean;
  annualRate?: number | null;
  readOnly?: boolean;
  onChange: (field: keyof CostShareItem, v: string) => void;
  onRemove: () => void;
}> = ({ share, rowIndex, accentRgb, pending, isLast, annualRate, readOnly, onChange, onRemove }) => {
  const [name, setName] = React.useState(share.name);
  const [qty, setQty] = React.useState(share.qty);
  const [dateFrom, setDateFrom] = React.useState(share.dateFrom);
  const [dateTo, setDateTo] = React.useState(share.dateTo);
  const [interest, setInterest] = React.useState(share.interest);

  const fmtDate = (v: string) => {
    if (!v) return '';
    const m = v.match(/^\d{4}-(\d{1,2})-(\d{1,2})$/);
    if (m) return `${parseInt(m[1])}/${parseInt(m[2])}`;
    return v;
  };

  // 计算天数
  const days = React.useMemo(() => {
    if (!dateFrom || !dateTo) return null;
    const d1 = new Date(dateFrom).getTime();
    const d2 = new Date(dateTo).getTime();
    if (isNaN(d1) || isNaN(d2) || d2 < d1) return null;
    return Math.round((d2 - d1) / 86400000);
  }, [dateFrom, dateTo]);

  const toggleCurrency = () => {
    const next: 'CNY' | 'USDT' = currency === 'USDT' ? 'CNY' : 'USDT';
    setCurrency(next);
    onChange('interestCurrency', next);
  };

  const cellColor = pending ? 'rgba(176,106,255,0.85)' : 'rgba(255,255,255,0.8)';
  const dimColor = pending ? 'rgba(176,106,255,0.5)' : 'rgba(255,255,255,0.4)';
  const colBorder = pending ? '1px solid rgba(176,106,255,0.2)' : `1px solid rgba(${accentRgb},0.15)`;
  const rowBorder = pending ? '1px solid rgba(176,106,255,0.12)' : `1px solid rgba(${accentRgb},0.1)`;
  const rowBg = rowIndex % 2 === 0
    ? (pending ? 'rgba(176,106,255,0.05)' : `rgba(${accentRgb},0.04)`)
    : 'transparent';

  const cell = (content: React.ReactNode, isLastCol = false) => (
    <div style={{
      borderRight: isLastCol ? 'none' : colBorder,
      padding: '4px 5px',
      display: 'flex',
      alignItems: 'center',
      minWidth: 0,
      overflow: 'hidden',
    }}>
      {content}
    </div>
  );

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '48px 36px 40px 40px 38px 56px 38px 24px',
        background: rowBg,
        borderBottom: isLast ? 'none' : rowBorder,
      }}
    >
      {cell(
        <input type="text" value={name}
          onChange={e => !readOnly && setName(e.target.value)}
          onBlur={() => !readOnly && onChange('name', name)}
          readOnly={readOnly}
          placeholder="姓名" className="text-xs outline-none bg-transparent w-full"
          style={{ color: cellColor, cursor: readOnly ? 'default' : 'text' }} />
      )}
      {cell(
        <input type="number" value={qty}
          onChange={e => !readOnly && setQty(e.target.value)}
          onBlur={() => !readOnly && onChange('qty', qty)}
          readOnly={readOnly}
          placeholder="0" className="text-xs outline-none bg-transparent text-right w-full"
          style={{ color: pending ? '#b06aff' : '#7dd3fc', minWidth: 0, cursor: readOnly ? 'default' : 'text' }} min="0" step="0.1" />
      )}
      {cell(
        <label className="relative w-full" style={{ cursor: readOnly ? 'default' : 'pointer' }}>
          <span className="text-xs block text-center" style={{ color: dateFrom ? dimColor : 'rgba(255,255,255,0.2)' }}>
            {dateFrom ? fmtDate(dateFrom) : '起'}
          </span>
          <input type="date" value={dateFrom}
            onChange={e => { if (!readOnly) { setDateFrom(e.target.value); onChange('dateFrom', e.target.value); } }}
            className="absolute inset-0 opacity-0 w-full" style={{ fontSize: '16px', pointerEvents: readOnly ? 'none' : 'auto' }} />
        </label>
      )}
      {cell(
        <label className="relative w-full" style={{ cursor: readOnly ? 'default' : 'pointer' }}>
          <span className="text-xs block text-center" style={{ color: dateTo ? dimColor : 'rgba(255,255,255,0.2)' }}>
            {dateTo ? fmtDate(dateTo) : '止'}
          </span>
          <input type="date" value={dateTo}
            onChange={e => { if (!readOnly) { setDateTo(e.target.value); onChange('dateTo', e.target.value); } }}
            className="absolute inset-0 opacity-0 w-full" style={{ fontSize: '16px', pointerEvents: readOnly ? 'none' : 'auto' }} />
        </label>
      )}
      {cell(
        <span className="text-xs w-full text-center" style={{ color: days !== null ? (pending ? '#b06aff' : `rgba(${accentRgb},0.8)`) : 'rgba(255,255,255,0.2)' }}>
          {days !== null ? `${days}d` : '—'}
        </span>
      )}
      {/* 利息：纯数字输入 */}
      {cell(
        <input type="number" value={interest}
          onChange={e => !readOnly && setInterest(e.target.value)}
          onBlur={() => !readOnly && onChange('interest', interest)}
          readOnly={readOnly}
          placeholder="0" className="text-xs outline-none bg-transparent text-right w-full"
          style={{ color: '#f0d060', minWidth: 0, cursor: readOnly ? 'default' : 'text' }} min="0" step="10" />
      )}
      {/* 年化：自动计算显示 */}
      {cell(
        <span className="text-xs w-full text-center" style={{
          color: annualRate != null ? (annualRate > 20 ? '#f87171' : annualRate > 10 ? '#fbbf24' : '#86efac') : 'rgba(255,255,255,0.2)',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {annualRate != null ? `${annualRate.toFixed(1)}%` : '—'}
        </span>
      )}
      {cell(
        <button onClick={onRemove} disabled={readOnly} className="flex items-center justify-center w-full" style={{ color: readOnly ? 'rgba(255,80,80,0.15)' : 'rgba(255,80,80,0.4)', cursor: readOnly ? 'not-allowed' : 'pointer' }}>
          <X className="w-3 h-3" />
        </button>,
        true
      )}
    </div>
  );
};

/** 成本分摊模块 */
const CostShareBlock: React.FC<{
  totalCost: string;
  totalCostCurrency: 'ETH' | 'USDT';
  costShares: CostShareItem[];
  accentRgb: string;
  pending: boolean;
  expiryDate: string;
  buyDate: string;
  strikePrice: string;
  strikePriceCurrency: 'ETH' | 'USDT';
  premium: string;
  qty: string;
  onChangeTotalCost: (v: string) => void;
  onChangeTotalCostCurrency: (v: 'ETH' | 'USDT') => void;
  onChangeShares: (shares: CostShareItem[]) => void;
  onChangeExpiryDate: (v: string) => void;
  onChangeBuyDate: (v: string) => void;
  onChangeStrikePrice: (v: string) => void;
  onChangeStrikePriceCurrency: (v: 'ETH' | 'USDT') => void;
  onChangePremium: (v: string) => void;
  annualRate: string;
  onChangeAnnualRate: (v: string) => void;
  onSave?: () => void;
  saving?: boolean;
  justSaved?: boolean;
}> = ({ totalCost, totalCostCurrency, costShares, accentRgb, pending, expiryDate, buyDate, strikePrice, strikePriceCurrency, premium, qty, annualRate,
  onChangeTotalCost, onChangeTotalCostCurrency, onChangeShares, onChangeExpiryDate, onChangeBuyDate, onChangeStrikePrice, onChangeStrikePriceCurrency, onChangePremium, onChangeAnnualRate,
  onSave, saving, justSaved }) => {
  const shares = costShares ?? [];
  const totalCostNum = parseFloat(totalCost) || 0;
  const totalInterest = shares.reduce((s, r) => s + (parseFloat(r.interest) || 0), 0);
  const totalQty = shares.reduce((s, r) => s + (parseFloat(r.qty) || 0), 0);

  // 计算每行年化利率：利息 / (总成本 × 数量占比) / 天数 × 365 × 100
  const calcAnnual = (r: CostShareItem): number | null => {
    const interest = parseFloat(r.interest);
    const qty = parseFloat(r.qty);
    const cost = totalCostNum;
    if (!interest || !qty || !cost || !totalQty) return null;
    const d1 = r.dateFrom ? new Date(r.dateFrom).getTime() : NaN;
    const d2 = r.dateTo ? new Date(r.dateTo).getTime() : NaN;
    if (isNaN(d1) || isNaN(d2) || d2 <= d1) return null;
    const days = (d2 - d1) / 86400000;
    const principal = cost * (qty / totalQty);
    return (interest / principal) * (365 / days) * 100;
  };

  // 加权平均年化
  const annualRates = shares.map(calcAnnual);
  const validRates = annualRates.filter((r): r is number => r !== null);
  const avgAnnual = validRates.length > 0
    ? validRates.reduce((a, b) => a + b, 0) / validRates.length
    : null;

  // 编辑/只读模式
  const [isEditing, setIsEditing] = React.useState(false);

  // 全局利息币种（统一切换）
  const [interestCurrency, setInterestCurrency] = React.useState<'CNY' | 'USDT'>(
    shares.find(s => s.interestCurrency)?.interestCurrency ?? 'USDT'
  );
  const toggleCurrency = () => {
    const next: 'CNY' | 'USDT' = interestCurrency === 'USDT' ? 'CNY' : 'USDT';
    setInterestCurrency(next);
    // 同步更新所有行
    onChangeShares(shares.map(s => ({ ...s, interestCurrency: next })));
  };

  const addShare = () => onChangeShares([...shares, { name: '', qty: '', dateFrom: '', dateTo: '', interest: '', interestCurrency }]);
  const removeShare = (i: number) => onChangeShares(shares.filter((_, idx) => idx !== i));
  const updateShare = (i: number, field: keyof CostShareItem, val: string) => {
    const updated = [...shares];
    updated[i] = { ...updated[i], [field]: val };
    onChangeShares(updated);
  };

  const accentColor = pending ? '#b06aff' : `rgba(${accentRgb},1)`;
  const borderColor = pending ? 'rgba(176,106,255,0.2)' : `rgba(${accentRgb},0.15)`;
  const headerBg = pending ? 'rgba(176,106,255,0.12)' : `rgba(${accentRgb},0.1)`;
  const headerColor = pending ? 'rgba(176,106,255,0.7)' : `rgba(${accentRgb},0.65)`;

  // 行权日剩余天数
  const daysToExpiry = React.useMemo(() => {
    if (!expiryDate) return null;
    const d = new Date(expiryDate).getTime() - Date.now();
    if (isNaN(d)) return null;
    return Math.ceil(d / 86400000);
  }, [expiryDate]);

  const fmtExpiry = (v: string) => {
    if (!v) return '';
    const m = v.match(/^\d{4}-(\d{1,2})-(\d{1,2})$/);
    if (m) return `${parseInt(m[1])}/${parseInt(m[2])}`;
    return v;
  };

  // 自动计算总成本：qty × premium（可手动覆盖）
  const autoCost = React.useMemo(() => {
    const q = parseFloat(qty);
    const p = parseFloat(premium);
    if (!q || !p) return '';
    return (q * p).toFixed(2);
  }, [qty, premium]);

  // 若总成本为空则显示自动计算值
  const displayCost = totalCost || autoCost;

  // 买入日到行权日的天数和年化
  const holdDays = React.useMemo(() => {
    if (!buyDate || !expiryDate) return null;
    const d1 = new Date(buyDate).getTime();
    const d2 = new Date(expiryDate).getTime();
    if (isNaN(d1) || isNaN(d2) || d2 <= d1) return null;
    return Math.ceil((d2 - d1) / 86400000);
  }, [buyDate, expiryDate]);

  const premiumAnnual = React.useMemo(() => {
    const cost = parseFloat(displayCost);
    const q = parseFloat(qty);
    const p = parseFloat(premium);
    if (!cost || !q || !p || !holdDays) return null;
    return (p * q) / cost / holdDays * 365 * 100;
  }, [displayCost, premium, qty, holdDays]);

  return (
    <div>
      {/* 信息汇总表格：买入日 / 行权日 / 行权价 / 权利金 / 总成本 / 年化 */}
      <div style={{ border: `1px solid ${borderColor}`, borderRadius: '6px', overflow: 'hidden', marginBottom: '8px' }}>
        {/* 表头 */}
        <div style={{ display: 'grid', gridTemplateColumns: '52px 64px 50px 42px 1fr 38px', background: headerBg, borderBottom: `1px solid ${borderColor}` }}>
          {/* 买入日 */}
          <div style={{ borderRight: `1px solid ${borderColor}`, padding: '3px 5px', textAlign: 'center', whiteSpace: 'nowrap' }}>
            <span className="text-xs" style={{ color: headerColor }}>买入日</span>
          </div>
          {/* 行权日 */}
          <div style={{ borderRight: `1px solid ${borderColor}`, padding: '3px 5px', textAlign: 'center', whiteSpace: 'nowrap' }}>
            <span className="text-xs" style={{ color: headerColor }}>行权日</span>
          </div>
          {/* 行权价（可切换币种） */}
          <div style={{ borderRight: `1px solid ${borderColor}`, padding: '3px 5px', textAlign: 'center', whiteSpace: 'nowrap' }}>
            <button
              onClick={() => onChangeStrikePriceCurrency(strikePriceCurrency === 'USDT' ? 'ETH' : 'USDT')}
              className="text-xs w-full text-center"
              style={{ color: strikePriceCurrency === 'ETH' ? '#7dd3fc' : '#f0d060', fontWeight: 500 }}
            >
              行权价{strikePriceCurrency === 'ETH' ? 'E' : 'U'}
            </button>
          </div>
          {/* 权利金 */}
          <div style={{ borderRight: `1px solid ${borderColor}`, padding: '3px 5px', textAlign: 'center', whiteSpace: 'nowrap' }}>
            <span className="text-xs" style={{ color: headerColor }}>权利金</span>
          </div>
          {/* 总成本（可切换币种） */}
          <div style={{ borderRight: `1px solid ${borderColor}`, padding: '3px 5px', textAlign: 'center', whiteSpace: 'nowrap' }}>
            <button
              onClick={() => onChangeTotalCostCurrency(totalCostCurrency === 'USDT' ? 'ETH' : 'USDT')}
              className="text-xs w-full text-center"
              style={{ color: totalCostCurrency === 'ETH' ? '#7dd3fc' : '#f0d060', fontWeight: 500 }}
            >
              总成本{totalCostCurrency === 'ETH' ? 'E' : 'U'}
            </button>
          </div>
          {/* 年化标题 */}
          <div style={{ padding: '3px 5px', textAlign: 'center', whiteSpace: 'nowrap' }}>
            <span className="text-xs" style={{ color: headerColor }}>年化</span>
          </div>
        </div>
        {/* 数据行 */}
        <div style={{ display: 'grid', gridTemplateColumns: '52px 64px 50px 42px 1fr 38px' }}>
          {/* 买入日 */}
          <div style={{ borderRight: `1px solid ${borderColor}`, padding: '4px 5px', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
            <span className="text-xs text-center" style={{ color: 'rgba(255,255,255,0.75)', pointerEvents: 'none', zIndex: 1 }}>
              {buyDate ? fmtExpiry(buyDate) : ''}
            </span>
            <input type="date" value={buyDate} onChange={e => onChangeBuyDate(e.target.value)}
              disabled={!isEditing}
              style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: isEditing ? 'pointer' : 'default', fontSize: '16px', zIndex: 2 }} />
          </div>
          {/* 行权日 */}
          <div style={{ borderRight: `1px solid ${borderColor}`, padding: '4px 5px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2px', position: 'relative', overflow: 'hidden' }}>
            <span className="text-xs text-center" style={{ color: 'rgba(255,255,255,0.75)', pointerEvents: 'none', zIndex: 1 }}>
              {expiryDate ? fmtExpiry(expiryDate) : ''}
            </span>
            {daysToExpiry !== null && (
              <span style={{ color: daysToExpiry <= 7 ? '#f87171' : daysToExpiry <= 30 ? '#fbbf24' : '#86efac', fontSize: '10px', pointerEvents: 'none', zIndex: 1 }}>
                {daysToExpiry > 0 ? `${daysToExpiry}d` : '到期'}
              </span>
            )}
            <input type="date" value={expiryDate} onChange={e => onChangeExpiryDate(e.target.value)}
              disabled={!isEditing}
              style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: isEditing ? 'pointer' : 'default', fontSize: '16px', zIndex: 2 }} />
          </div>
          {/* 行权价 — 数字输入框 */}
          <div style={{ borderRight: `1px solid ${borderColor}`, padding: '4px 5px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <input
              type="number"
              value={strikePrice}
              onChange={e => onChangeStrikePrice(e.target.value)}
              readOnly={!isEditing}
              placeholder=""
              className="text-xs outline-none bg-transparent text-center w-full"
              style={{
                color: strikePriceCurrency === 'ETH' ? '#7dd3fc' : '#f0d060',
                cursor: isEditing ? 'text' : 'default',
              }}
              min="0"
              step="100"
            />
          </div>
          {/* 权利金 */}
          <div style={{ borderRight: `1px solid ${borderColor}`, padding: '4px 5px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <input type="number" value={premium} onChange={e => onChangePremium(e.target.value)}
              placeholder="0" readOnly={!isEditing} className="text-xs outline-none bg-transparent text-center w-full"
              style={{ color: '#86efac', cursor: isEditing ? 'text' : 'default' }} min="0" step="10" />
          </div>
          {/* 总成本（自动计算，可手动覆盖） */}
          <div style={{ borderRight: `1px solid ${borderColor}`, padding: '4px 5px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <input type="number" value={totalCost}
              onChange={e => onChangeTotalCost(e.target.value)}
              placeholder={autoCost || '0'}
              readOnly={!isEditing}
              className="text-xs outline-none bg-transparent text-center w-full"
              style={{ color: totalCostCurrency === 'ETH' ? '#7dd3fc' : '#f0d060', cursor: isEditing ? 'text' : 'default' }} min="0" step="100" />
          </div>
          {/* 年化（手动输入） */}
          <div style={{ padding: '4px 3px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1px' }}>
            <input
              type="number"
              value={annualRate}
              onChange={e => onChangeAnnualRate(e.target.value)}
              readOnly={!isEditing}
              placeholder=""
              className="text-xs outline-none bg-transparent text-center"
              style={{ color: '#86efac', cursor: isEditing ? 'text' : 'default', width: '28px' }}
              min="0"
              step="0.1"
            />
            <span className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>%</span>
          </div>
        </div>
      </div>

      {/* 分摊表格 */}
      <div style={{ border: `1px solid ${borderColor}`, borderRadius: '6px', overflow: 'hidden' }}>
        {/* 表头 */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '48px 36px 40px 40px 38px 56px 38px 24px',
            background: headerBg,
            borderBottom: `1px solid ${borderColor}`,
          }}
        >
          {(['姓名', '数量', '起始', '结束', '周期', null, '年化', ''] as (string | null)[]).map((h, i) => (
            <div key={i} style={{
              borderRight: i < 7 ? `1px solid ${borderColor}` : 'none',
              padding: '4px 5px',
              textAlign: i === 0 ? 'left' : 'center',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
            }}>
              {i === 5 ? (
                <button
                  onClick={toggleCurrency}
                  className="text-xs w-full text-center"
                  style={{
                    color: interestCurrency === 'CNY' ? '#f87171' : '#86efac',
                    fontWeight: 500,
                  }}
                >
                  利息{interestCurrency === 'CNY' ? '元' : 'U'}
                </button>
              ) : (
                <span className="text-xs" style={{ color: headerColor }}>{h}</span>
              )}
            </div>
          ))}
        </div>
        {/* 数据行 */}
        <div>
          {shares.length === 0 && (
            <div className="text-xs py-2 text-center" style={{ color: 'rgba(255,255,255,0.2)' }}>点击下方添加</div>
          )}
          {shares.map((s, i) => (
            <CostShareRow
              key={i}
              share={s}
              rowIndex={i}
              accentRgb={accentRgb}
              pending={pending}
              isLast={i === shares.length - 1}
              annualRate={annualRates[i]}
              readOnly={!isEditing}
              onChange={(field, v) => updateShare(i, field, v)}
              onRemove={() => removeShare(i)}
            />
          ))}
        </div>
      </div>

      {/* 汇总行：已分配 / 剩余币 / 已收成本 / 剩余成本 */}
      {shares.length > 0 && (() => {
        const allocatedQty = totalQty;
        const chipQty = parseFloat(qty) || 0;
        const remainQty = chipQty - allocatedQty;
        const collectedCost = totalInterest;
        const costNum = parseFloat(totalCost) || parseFloat(autoCost) || 0;
        const remainCost = costNum - collectedCost;
        return (
          <div style={{ border: `1px solid ${borderColor}`, borderRadius: '6px', overflow: 'hidden', marginTop: '6px' }}>
            {/* 表头 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', background: headerBg, borderBottom: `1px solid ${borderColor}` }}>
              {['已分配E', '剩余E', '已收成本', '剩余成本'].map((h, i) => (
                <div key={i} style={{ borderRight: i < 3 ? `1px solid ${borderColor}` : 'none', padding: '3px 5px', textAlign: 'center' }}>
                  <span className="text-xs" style={{ color: headerColor }}>{h}</span>
                </div>
              ))}
            </div>
            {/* 数据行 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
              <div style={{ borderRight: `1px solid ${borderColor}`, padding: '4px 5px', textAlign: 'center' }}>
                <span className="text-xs" style={{ color: allocatedQty > 0 ? '#86efac' : 'rgba(255,255,255,0.25)' }}>
                  {allocatedQty > 0 ? allocatedQty.toFixed(2).replace(/\.?0+$/, '') : '—'}
                </span>
              </div>
              <div style={{ borderRight: `1px solid ${borderColor}`, padding: '4px 5px', textAlign: 'center' }}>
                <span className="text-xs" style={{ color: remainQty > 0 ? 'rgba(255,255,255,0.7)' : remainQty < 0 ? '#f87171' : 'rgba(255,255,255,0.25)' }}>
                  {chipQty > 0 ? remainQty.toFixed(2).replace(/\.?0+$/, '') : '—'}
                </span>
              </div>
              <div style={{ borderRight: `1px solid ${borderColor}`, padding: '4px 5px', textAlign: 'center' }}>
                <span className="text-xs" style={{ color: collectedCost > 0 ? '#86efac' : 'rgba(255,255,255,0.25)' }}>
                  {collectedCost > 0 ? collectedCost.toLocaleString() : '—'}
                </span>
              </div>
              <div style={{ padding: '4px 5px', textAlign: 'center' }}>
                <span className="text-xs" style={{ color: costNum > 0 ? (remainCost > 0 ? '#fbbf24' : '#f87171') : 'rgba(255,255,255,0.25)' }}>
                  {costNum > 0 ? remainCost.toLocaleString() : '—'}
                </span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 添加行 + 平均年化 + 保存按鈕 */}
      <div className="flex items-center justify-between mt-1.5">
        <div className="flex items-center gap-2">
          <button
            onClick={addShare}
            disabled={!isEditing}
            className="flex items-center gap-1 text-xs px-2 py-0.5 rounded"
            style={{
              background: pending ? 'rgba(176,106,255,0.1)' : `rgba(${accentRgb},0.08)`,
              color: isEditing ? accentColor : 'rgba(255,255,255,0.2)',
              border: `1px solid ${isEditing ? borderColor : 'rgba(255,255,255,0.08)'}`,
              cursor: isEditing ? 'pointer' : 'not-allowed',
            }}
          >
            <Plus className="w-3 h-3" /> 添加人
          </button>
          {avgAnnual !== null && (
            <span className="text-xs font-medium" style={{ color: pending ? '#b06aff' : '#fbbf24' }}>
              年化 {avgAnnual.toFixed(1)}%
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {isEditing ? (
            <button
              onClick={() => {
                if (onSave) onSave();
                if (!saving) setIsEditing(false);
              }}
              disabled={saving}
              className="flex items-center gap-1 text-xs px-2 py-0.5 rounded"
              style={{
                background: justSaved ? 'rgba(34,197,94,0.15)' : pending ? 'rgba(176,106,255,0.1)' : `rgba(${accentRgb},0.08)`,
                color: justSaved ? '#22c55e' : accentColor,
                border: `1px solid ${justSaved ? 'rgba(34,197,94,0.4)' : borderColor}`,
              }}
            >
              {saving ? '保存中…' : justSaved ? '✓ 已保存' : '保存'}
            </button>
          ) : (
            <button
              onClick={() => setIsEditing(true)}
              className="flex items-center gap-1 text-xs px-2 py-0.5 rounded"
              style={{
                background: pending ? 'rgba(176,106,255,0.1)' : `rgba(${accentRgb},0.08)`,
                color: accentColor,
                border: `1px solid ${borderColor}`,
              }}
            >
              编辑
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const ChipRow: React.FC<ChipRowProps> = ({ item, index, color, accentRgb, onChange, onRemove, onSave, saving, justSaved }) => {
  const [newNote, setNewNote] = React.useState('');
  const [showCost, setShowCost] = React.useState(false);
  const notes = item.notes ?? [];

  const addNote = () => {
    const trimmed = newNote.trim();
    if (!trimmed) return;
    const entry: NoteEntry = { text: trimmed, time: new Date().toISOString() };
    onChange('notes', [...notes, entry] as any);
    setNewNote('');
  };

  const removeNote = (i: number) => {
    onChange('notes', notes.filter((_, idx) => idx !== i) as any);
  };

  const editNote = (i: number, val: string) => {
    const updated = notes.map((n, idx) => idx === i ? { ...n, text: val } : n);
    onChange('notes', updated as any);
  };

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: item.pending ? 'rgba(176,106,255,0.08)' : `rgba(${accentRgb},0.06)`,
        border: `1px solid ${item.pending ? 'rgba(176,106,255,0.5)' : `rgba(${accentRgb},0.3)`}`,
      }}
    >
      {/* 第一行：序号 + 数量 + 止盈价 + 删除 */}
      <div className="flex items-center gap-2 px-3 pt-2 pb-1">
        <span className="text-xs shrink-0 w-4 text-center" style={{ color: item.pending ? 'rgba(176,106,255,0.6)' : `rgba(${accentRgb},0.5)` }}>#{index + 1}</span>

        {/* 数量 */}
        <div className="flex items-center gap-1 flex-1">
          <input
            type="number"
            value={item.qty}
            onChange={e => onChange('qty', e.target.value)}
            placeholder="0"
            className="w-20 text-center text-base font-bold outline-none bg-transparent"
            style={{ color: item.pending ? '#b06aff' : color, fontVariantNumeric: 'tabular-nums' }}
            step="1"
            min="0"
          />
          <span className="text-xs shrink-0" style={{ color: item.pending ? 'rgba(176,106,255,0.6)' : `rgba(${accentRgb},0.5)` }}>ETH</span>
        </div>

        {/* 止盈价 */}
        <div className="flex items-center gap-1 flex-1">
          <span className="text-xs shrink-0" style={{ color: item.pending ? 'rgba(176,106,255,0.6)' : `rgba(${accentRgb},0.5)` }}>止盈$</span>
          <input
            type="number"
            value={item.takeProfit}
            onChange={e => onChange('takeProfit', e.target.value)}
            placeholder="—"
            className="flex-1 text-center text-base font-bold outline-none bg-transparent min-w-0"
            style={{ color: item.pending ? '#b06aff' : '#f0d060', fontVariantNumeric: 'tabular-nums' }}
            step="100"
            min="0"
          />
        </div>

        {/* 成本分摊开关 */}
        <button
          onClick={() => setShowCost(v => !v)}
          className="shrink-0 px-1.5 py-0.5 rounded text-xs"
          style={{
            background: showCost
              ? (item.pending ? 'rgba(176,106,255,0.25)' : `rgba(${accentRgb},0.2)`)
              : 'transparent',
            color: showCost
              ? (item.pending ? '#b06aff' : color)
              : (item.pending ? 'rgba(176,106,255,0.4)' : `rgba(${accentRgb},0.4)`),
            border: `1px solid ${showCost
              ? (item.pending ? 'rgba(176,106,255,0.5)' : `rgba(${accentRgb},0.4)`)
              : (item.pending ? 'rgba(176,106,255,0.2)' : `rgba(${accentRgb},0.2)`)}`,
          }}
          title="成本分摊"
        >¥</button>

        {/* 删除 */}
        <button
          onClick={onRemove}
          className="shrink-0 p-1 rounded"
          style={{ color: 'rgba(255,80,80,0.5)' }}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 成本分摊模块（全宽容器，带顶部分隔线） */}
      {showCost && <div className="px-3 pb-1" style={{ borderTop: `1px solid ${item.pending ? 'rgba(176,106,255,0.2)' : `rgba(${accentRgb},0.15)`}`, paddingTop: '6px' }}>
        <CostShareBlock
          totalCost={item.totalCost ?? ''}
          totalCostCurrency={(item.totalCostCurrency as 'ETH' | 'USDT') ?? 'USDT'}
          costShares={item.costShares ?? []}
          accentRgb={accentRgb}
          pending={!!item.pending}
          expiryDate={item.expiryDate ?? ''}
          buyDate={item.buyDate ?? ''}
          strikePrice={item.strikePrice ?? ''}
          strikePriceCurrency={(item.strikePriceCurrency as 'ETH' | 'USDT') ?? 'USDT'}
          premium={item.premium ?? ''}
          qty={item.qty ?? ''}
          onChangeTotalCost={v => onChange('totalCost', v)}
          onChangeTotalCostCurrency={v => onChange('totalCostCurrency', v)}
          onChangeShares={shares => onChange('costShares', shares as any)}
          onChangeExpiryDate={v => onChange('expiryDate', v)}
          onChangeBuyDate={v => onChange('buyDate', v)}
          onChangeStrikePrice={v => onChange('strikePrice', v)}
          onChangeStrikePriceCurrency={v => onChange('strikePriceCurrency', v)}
          onChangePremium={v => onChange('premium', v)}
          annualRate={item.annualRate ?? ''}
          onChangeAnnualRate={v => onChange('annualRate', v)}
          onSave={onSave}
          saving={saving}
          justSaved={justSaved}
        />
      </div>}

      {/* 备注区：多条列表 + 挂单勾选（全宽容器，带顶部分隔线） */}
      <div className="px-3 pb-2" style={{ borderTop: `1px solid ${item.pending ? 'rgba(176,106,255,0.2)' : `rgba(${accentRgb},0.15)`}`, paddingTop: '6px' }}>
        {/* 已有备注列表（可内联编辑） */}
        {notes.length > 0 && (
          <div className="mb-1.5">
            {notes.map((n, i) => (
              <NoteItem
                key={i}
                note={n}
                accentRgb={accentRgb}
                pending={!!item.pending}
                isLast={i === notes.length - 1}
                onEdit={val => editNote(i, val)}
                onRemove={() => removeNote(i)}
              />
            ))}
          </div>
        )}
        {/* 添加备注输入行 */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newNote}
            onChange={e => setNewNote(e.target.value)}
            placeholder="添加备注…"
            className="flex-1 text-xs outline-none bg-transparent"
            style={{ color: item.pending ? 'rgba(176,106,255,0.8)' : 'rgba(255,255,255,0.5)' }}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addNote(); } }}
          />
          <button
            onClick={addNote}
            className="shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs"
            style={{
              background: item.pending ? 'rgba(176,106,255,0.15)' : `rgba(${accentRgb},0.12)`,
              color: item.pending ? '#b06aff' : color,
              border: `1px solid ${item.pending ? 'rgba(176,106,255,0.3)' : `rgba(${accentRgb},0.25)`}`,
            }}
          >
            <Plus className="w-3 h-3" />
          </button>
          {/* 挂单勾选按钮 */}
          <button
            title={item.pending ? '挂单中 — 点击标记已成交' : '已成交 — 点击标记为挂单'}
            className="shrink-0 flex items-center justify-center rounded transition-all"
            style={{
              width: '20px', height: '20px', fontSize: '11px',
              background: item.pending ? 'rgba(176,106,255,0.2)' : 'rgba(255,255,255,0.05)',
              border: item.pending ? '1px solid rgba(176,106,255,0.6)' : '1px solid rgba(255,255,255,0.15)',
              color: item.pending ? '#b06aff' : 'rgba(255,255,255,0.25)',
            }}
            onClick={() => onChange('pending', !item.pending)}
          >{item.pending ? '⏳' : '✓'}</button>
        </div>
      </div>
    </div>
  );
};

export default function PositionLevelEdit() {
  const [, params] = useRoute("/ledger/:id/position-calc/:price");
  const [, setLocation] = useLocation();
  const ledgerId = params ? parseInt(params.id) : 0;
  const price = params ? parseInt(params.price) : 0;
  const { user } = useAuth();

  // 视角查看
  const urlSearchParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const viewAsUserId = urlSearchParams.get('viewAs') ? Number(urlSearchParams.get('viewAs')) : undefined;
  const isViewAs = !!viewAsUserId;

  // 表单状态
  const [plannedValue, setPlannedValue] = useState('');

  // 多条筹码记录
  const [baseItems, setBaseItems] = useState<ChipItem[]>([emptyChip()]);
  const [tacticalItems, setTacticalItems] = useState<ChipItem[]>([emptyChip()]);

  // 日志编辑状态
  const [editingLogId, setEditingLogId] = useState<number | null>(null);
  const [editingLogNote, setEditingLogNote] = useState('');

  // 保存反馈状态
  const [justSaved, setJustSaved] = useState(false);

  // 当前档位的实际/计划数量（从数据库读取）
  const [actualQty, setActualQty] = useState(0);
  const [plannedQty, setPlannedQty] = useState(0);

  const utils = trpc.useUtils();

  // 读取持仓数据
  const { data: positionData, isLoading } = trpc.ethPositionGetLevels.useQuery(
    { ledgerId, ...(viewAsUserId ? { viewAsUserId } : {}) },
    { enabled: ledgerId > 0 && price > 0 }
  );

  // 修改日志
  const getLogsQuery = trpc.ethPositionGetLogs.useQuery(
    { ledgerId, price },
    { enabled: ledgerId > 0 && price > 0 }
  );

  // 初始化表单数据
  useEffect(() => {
    if (!positionData) return;
    const levels = Array.isArray(positionData) ? positionData : (positionData as any).levels;
    if (!levels) return;
    const level = levels.find((l: any) => l.price === price);
    if (level) {
      const bq = level.baseQty ?? 0;
      const tq = level.tacticalQty ?? 0;
      const pq = level.plannedQty ?? 0;
      const aq = level.actualQty ?? 0;
      setActualQty(aq);
      setPlannedQty(pq);
      setPlannedValue(pq > 0 ? String(pq) : '');

      const bItems = migrateToItems(bq, level.baseNotes || '[]');
      const tItems = migrateToItems(tq, level.tacticalNotes || '[]');
      setBaseItems(bItems.length > 0 ? bItems : [emptyChip()]);
      setTacticalItems(tItems.length > 0 ? tItems : [emptyChip()]);
    }
  }, [positionData, price]);

  // mutations
  const saveLevelMutation = trpc.ethPositionSaveLevel.useMutation({
    onSuccess: () => {
      setJustSaved(true);
      setTimeout(() => {
        setJustSaved(false);
        goBack();
      }, 1000);
    },
    onError: (err) => {
      alert(`保存失败：${err.message}`);
    }
  });
  const addChangeLogMutation = trpc.ethPositionAddLog.useMutation({
    onSuccess: () => utils.ethPositionGetLogs.invalidate({ ledgerId }),
  });
  const updateLogNoteMutation = trpc.ethPositionUpdateLogNote.useMutation({
    onSuccess: () => utils.ethPositionGetLogs.invalidate({ ledgerId }),
  });
  const deleteLogMutation = trpc.ethPositionDeleteLog.useMutation({
    onSuccess: () => utils.ethPositionGetLogs.invalidate({ ledgerId }),
  });

  const goBack = () => setLocation(`/ledger/${ledgerId}/position-calc`);

  const handleSave = () => {
    if (isViewAs) { goBack(); return; }
    const bqVal = sumQty(baseItems);
    const tqVal = sumQty(tacticalItems);
    const totalVal = bqVal + tqVal;
    const pqNum = parseFloat(plannedValue);
    const newPlannedVal = !isNaN(pqNum) && pqNum >= 0 ? pqNum : plannedQty;
    const oldActual = actualQty;
    const oldPlanned = plannedQty;

    if (totalVal !== oldActual) {
      addChangeLogMutation.mutate({ ledgerId, price, changeType: 'actual', oldValue: oldActual, newValue: totalVal });
    }
    if (newPlannedVal !== oldPlanned) {
      addChangeLogMutation.mutate({ ledgerId, price, changeType: 'planned', oldValue: oldPlanned, newValue: newPlannedVal });
    }

    saveLevelMutation.mutate({
      ledgerId,
      price,
      plannedQty: newPlannedVal,
      actualQty: totalVal,
      baseQty: bqVal,
      tacticalQty: tqVal,
      baseNotes: serializeItems(baseItems),
      tacticalNotes: serializeItems(tacticalItems),
    });
  };

  // 计算预览进度条（挂单筹码单独为紫色段）
  const bqCur = sumQty(baseItems);
  const tqCur = sumQty(tacticalItems);
  const totalCur = bqCur + tqCur;
  const planCur = parseFloat(plannedValue) || plannedQty;
  // 挂单数量（底仓+战术中所有pending=true的记录）
  const pendingQty = [...baseItems, ...tacticalItems]
    .filter(x => x.pending && parseFloat(x.qty) > 0)
    .reduce((s, x) => s + (parseFloat(x.qty) || 0), 0);
  // 已成交的底仓/战术（排除挂单部分）
  const bqConfirmed = baseItems.filter(x => !x.pending).reduce((s, x) => s + (parseFloat(x.qty) || 0), 0);
  const tqConfirmed = tacticalItems.filter(x => !x.pending).reduce((s, x) => s + (parseFloat(x.qty) || 0), 0);
  const baseWidth = planCur > 0 ? Math.min(100, (bqConfirmed / planCur) * 100) : 0;
  const tacticalWidth = planCur > 0 ? Math.min(100 - baseWidth, (tqConfirmed / planCur) * 100) : 0;
  const pendingWidth = planCur > 0 ? Math.min(100 - baseWidth - tacticalWidth, (pendingQty / planCur) * 100) : 0;

  // 加权平均止盈价
  const baseAvgTP = weightedAvgTakeProfit(baseItems);
  const tacticalAvgTP = weightedAvgTakeProfit(tacticalItems);

  // ---- 辅助：更新某条记录 ----
  const updateBase = (i: number, field: keyof ChipItem, val: string | boolean | string[] | NoteEntry[] | CostShareItem[]) => {
    setBaseItems(prev => prev.map((x, j) => j === i ? { ...x, [field]: val } : x));
  };
  const updateTactical = (i: number, field: keyof ChipItem, val: string | boolean | string[] | NoteEntry[] | CostShareItem[]) => {
    setTacticalItems(prev => prev.map((x, j) => j === i ? { ...x, [field]: val } : x));
  };
  const addBase = () => setBaseItems(prev => [...prev, emptyChip()]);
  const addTactical = () => setTacticalItems(prev => [...prev, emptyChip()]);
  const removeBase = (i: number) => setBaseItems(prev => prev.length > 1 ? prev.filter((_, j) => j !== i) : [emptyChip()]);
  const removeTactical = (i: number) => setTacticalItems(prev => prev.length > 1 ? prev.filter((_, j) => j !== i) : [emptyChip()]);

  return (
    <div className="min-h-screen max-w-md mx-auto relative" style={{ background: '#000000' }}>
      {/* 顶部导航 */}
      <div className="sticky top-0 z-10 flex items-center px-4 py-3" style={{ background: 'rgba(0,0,0,0.95)', borderBottom: '1px solid rgba(192,192,192,0.1)' }}>
        <button onClick={goBack} className="flex items-center gap-1 mr-3" style={{ color: 'rgba(192,192,192,0.7)' }}>
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div>
          <div className="text-base font-semibold" style={{ background: 'linear-gradient(90deg, #e8e8e8, #c0c0c0)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
            ${price} 档位
          </div>
          <div className="text-xs mt-0.5" style={{ color: 'rgba(192,192,192,0.5)' }}>
            已买 {actualQty.toFixed(2)} ETH &nbsp;·&nbsp; 计划 {plannedQty.toFixed(2)} ETH
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20" style={{ color: 'rgba(192,192,192,0.4)' }}>
          <div className="text-sm">加载中…</div>
        </div>
      ) : (
        <div className="px-4 pt-4 pb-24">
          {/* 计划仓位 */}
          <div className="mb-5">
            <div className="text-xs font-medium mb-1.5 tracking-wider" style={{ color: 'rgba(100,200,100,0.8)' }}>计划仓位 (ETH)</div>
            <div className="rounded-xl px-4 py-2" style={{ background: 'rgba(100,200,100,0.06)', border: '1px solid rgba(100,200,100,0.25)' }}>
              <input
                type="number"
                value={plannedValue}
                onChange={e => setPlannedValue(e.target.value)}
                placeholder="0"
                className="w-full text-center text-2xl font-bold outline-none bg-transparent"
                style={{ color: '#64c864', fontVariantNumeric: 'tabular-nums' }}
                step="1"
                min="0"
              />
            </div>
          </div>

          {/* ===== 战略筹码（底仓）===== */}
          <div className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-medium tracking-wider" style={{ color: 'rgba(74,168,255,0.9)' }}>
                战略筹码（底仓）
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono" style={{ color: '#4aa8ff' }}>
                  {bqCur > 0 ? bqCur.toFixed(2) : '0'} ETH
                </span>
                <button
                  onClick={addBase}
                  className="flex items-center gap-0.5 px-2 py-0.5 rounded-lg text-xs"
                  style={{ background: 'rgba(74,168,255,0.15)', color: '#4aa8ff', border: '1px solid rgba(74,168,255,0.3)' }}
                >
                  <Plus className="w-3 h-3" /> 添加
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {baseItems.map((item, i) => (
                <ChipRow
                  key={i}
                  item={item}
                  index={i}
                  color="#4aa8ff"
                  accentRgb="74,168,255"
                  onChange={(field, val) => updateBase(i, field, val)}
                  onRemove={() => removeBase(i)}
                  onSave={handleSave}
                  saving={saveLevelMutation.isPending}
                  justSaved={justSaved}
                />
              ))}
            </div>

            {baseItems.length > 1 && (
              <div className="mt-2 flex items-center justify-end gap-3 px-2">
                <span className="text-xs font-mono" style={{ color: '#4aa8ff' }}>合计 {bqCur.toFixed(2)} ETH</span>
                {baseAvgTP > 0 && (
                  <span className="text-xs font-mono" style={{ color: '#f0d060' }}>均止盈 ${baseAvgTP.toFixed(0)}</span>
                )}
              </div>
            )}
          </div>

          {/* ===== 战术筹码（滚动仓）===== */}
          <div className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-medium tracking-wider" style={{ color: 'rgba(232,112,32,0.9)' }}>
                战术筹码（滚动仓）
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono" style={{ color: '#e87020' }}>
                  {tqCur > 0 ? tqCur.toFixed(2) : '0'} ETH
                </span>
                <button
                  onClick={addTactical}
                  className="flex items-center gap-0.5 px-2 py-0.5 rounded-lg text-xs"
                  style={{ background: 'rgba(232,112,32,0.15)', color: '#e87020', border: '1px solid rgba(232,112,32,0.3)' }}
                >
                  <Plus className="w-3 h-3" /> 添加
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {tacticalItems.map((item, i) => (
                <ChipRow
                  key={i}
                  item={item}
                  index={i}
                  color="#e87020"
                  accentRgb="232,112,32"
                  onChange={(field, val) => updateTactical(i, field, val)}
                  onRemove={() => removeTactical(i)}
                  onSave={handleSave}
                  saving={saveLevelMutation.isPending}
                  justSaved={justSaved}
                />
              ))}
            </div>

            {tacticalItems.length > 1 && (
              <div className="mt-2 flex items-center justify-end gap-3 px-2">
                <span className="text-xs font-mono" style={{ color: '#e87020' }}>合计 {tqCur.toFixed(2)} ETH</span>
                {tacticalAvgTP > 0 && (
                  <span className="text-xs font-mono" style={{ color: '#f0d060' }}>均止盈 ${tacticalAvgTP.toFixed(0)}</span>
                )}
              </div>
            )}
          </div>

          {/* ===== 持仓汇总卡片 ===== */}
          <div className="mb-5 rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(192,192,192,0.12)' }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs" style={{ color: 'rgba(192,192,192,0.5)' }}>持仓汇总</span>
              <span className="text-xs font-mono" style={{ color: 'rgba(192,192,192,0.7)' }}>{totalCur.toFixed(2)} / {planCur.toFixed(0)} ETH</span>
            </div>
            {/* 进度条：蓝色(已成交底仓) + 橙色(已成交战术) + 紫色(挂单) */}
            <div className="h-3 rounded-full overflow-hidden mb-3" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <div className="h-full flex">
                <div style={{ width: `${baseWidth}%`, background: 'linear-gradient(90deg, #2a6aaa, #4aa8ff)', transition: 'width 0.3s' }} />
                <div style={{ width: `${tacticalWidth}%`, background: 'linear-gradient(90deg, #a04010, #e87020)', transition: 'width 0.3s' }} />
                {pendingWidth > 0 && (
                  <div style={{ width: `${pendingWidth}%`, background: 'linear-gradient(90deg, #7030cc, #b06aff)', transition: 'width 0.3s' }} />
                )}
              </div>
            </div>
            {/* 两列卡片 */}
            <div className="grid grid-cols-2 gap-2">
              {/* 战略 */}
              <div className="rounded-lg px-3 py-2" style={{ background: 'rgba(74,168,255,0.08)', border: '1px solid rgba(74,168,255,0.2)' }}>
                <div className="flex items-center gap-1 mb-1">
                  <div className="w-2 h-2 rounded-sm" style={{ background: '#4aa8ff' }} />
                  <span className="text-xs" style={{ color: 'rgba(74,168,255,0.7)' }}>战略筹码</span>
                </div>
                <div className="text-base font-bold font-mono" style={{ color: '#4aa8ff' }}>{bqConfirmed.toFixed(2)}</div>
                <div className="text-xs mt-0.5" style={{ color: 'rgba(74,168,255,0.5)' }}>
                  {baseItems.filter(x => !x.pending && parseFloat(x.qty) > 0).length} 条已成交
                </div>
                {baseAvgTP > 0 && (
                  <div className="text-xs mt-0.5 font-mono" style={{ color: '#f0d060' }}>
                    均止盈 ${baseAvgTP.toFixed(0)}
                  </div>
                )}
              </div>
              {/* 战术 */}
              <div className="rounded-lg px-3 py-2" style={{ background: 'rgba(232,112,32,0.08)', border: '1px solid rgba(232,112,32,0.2)' }}>
                <div className="flex items-center gap-1 mb-1">
                  <div className="w-2 h-2 rounded-sm" style={{ background: '#e87020' }} />
                  <span className="text-xs" style={{ color: 'rgba(232,112,32,0.7)' }}>战术筹码</span>
                </div>
                <div className="text-base font-bold font-mono" style={{ color: '#e87020' }}>{tqConfirmed.toFixed(2)}</div>
                <div className="text-xs mt-0.5" style={{ color: 'rgba(232,112,32,0.5)' }}>
                  {tacticalItems.filter(x => !x.pending && parseFloat(x.qty) > 0).length} 条已成交
                </div>
                {tacticalAvgTP > 0 && (
                  <div className="text-xs mt-0.5 font-mono" style={{ color: '#f0d060' }}>
                    均止盈 ${tacticalAvgTP.toFixed(0)}
                  </div>
                )}
              </div>
            </div>
            {/* 挂单筹码汇总卡片（有挂单时才显示） */}
            {pendingQty > 0 && (
              <div className="mt-2 rounded-lg px-3 py-2" style={{ background: 'rgba(176,106,255,0.08)', border: '1px solid rgba(176,106,255,0.3)' }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-sm" style={{ background: '#b06aff' }} />
                    <span className="text-xs" style={{ color: 'rgba(176,106,255,0.8)' }}>挂单中（待成交）</span>
                  </div>
                  <div className="text-sm font-bold font-mono" style={{ color: '#b06aff' }}>{pendingQty.toFixed(2)} ETH</div>
                </div>
                <div className="text-xs mt-0.5" style={{ color: 'rgba(176,106,255,0.5)' }}>
                  {[...baseItems, ...tacticalItems].filter(x => x.pending && parseFloat(x.qty) > 0).length} 条挂单记录 · 成交后自动计入持仓
                </div>
              </div>
            )}
          </div>

          {/* 修改日志 */}
          <div className="mb-5" style={{ borderTop: '1px solid rgba(192,192,192,0.15)', paddingTop: '12px' }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium tracking-wider" style={{ color: 'rgba(192,192,192,0.5)' }}>修改日志</span>
              <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>自动记录 · 可编辑/删除</span>
            </div>
            <div className="space-y-1.5">
              {getLogsQuery.isLoading && (
                <div className="text-center py-3 text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>加载中…</div>
              )}
              {!getLogsQuery.isLoading && (!getLogsQuery.data || getLogsQuery.data.length === 0) && (
                <div className="text-center py-3 text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>暂无修改记录</div>
              )}
              {getLogsQuery.data?.map(log => (
                <div key={log.id} className="rounded-lg px-3 py-2" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(192,192,192,0.1)' }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: log.changeType === 'actual' ? 'rgba(192,192,192,0.2)' : 'rgba(192,192,192,0.1)', color: log.changeType === 'actual' ? '#f0d060' : 'rgba(192,192,192,0.7)', fontSize: '10px' }}>
                          {log.changeType === 'actual' ? '已买' : '计划'}
                        </span>
                        <span className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                          {Number(log.oldValue).toFixed(2)} → <span style={{ color: '#f0d060', fontWeight: 600 }}>{Number(log.newValue).toFixed(2)}</span> ETH
                        </span>
                      </div>
                      {editingLogId === log.id ? (
                        <div className="flex items-center gap-1 mt-1.5">
                          <input
                            value={editingLogNote}
                            onChange={e => setEditingLogNote(e.target.value)}
                            placeholder="添加备注…"
                            className="flex-1 text-xs px-2 py-1 rounded"
                            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(192,192,192,0.3)', color: 'rgba(255,255,255,0.85)', outline: 'none' }}
                            autoFocus
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                updateLogNoteMutation.mutate({ id: log.id, ledgerId, note: editingLogNote });
                                setEditingLogId(null);
                              }
                              if (e.key === 'Escape') setEditingLogId(null);
                            }}
                          />
                          <button onClick={() => { updateLogNoteMutation.mutate({ id: log.id, ledgerId, note: editingLogNote }); setEditingLogId(null); }} style={{ color: '#f0d060' }}>
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setEditingLogId(null)} style={{ color: 'rgba(255,255,255,0.3)' }}>
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        log.note ? (
                          <div className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.45)' }}>{log.note}</div>
                        ) : null
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-xs" style={{ color: 'rgba(255,255,255,0.25)', fontSize: '10px' }}>
                        {new Date(log.createdAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => { setEditingLogId(log.id); setEditingLogNote(log.note || ''); }}
                          className="p-0.5 rounded"
                          style={{ color: 'rgba(192,192,192,0.5)' }}
                          title="编辑备注"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => deleteLogMutation.mutate({ id: log.id, ledgerId })}
                          className="p-0.5 rounded"
                          style={{ color: 'rgba(255,80,80,0.5)' }}
                          title="删除"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 底部固定操作栏 */}
      <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto px-4 py-3 flex gap-2" style={{ background: 'rgba(0,0,0,0.95)', borderTop: '1px solid rgba(192,192,192,0.1)' }}>
        <button
          onClick={goBack}
          className="flex-1 py-3 rounded-xl text-sm font-medium"
          style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.1)' }}
        >
          取消
        </button>
        <button
          onClick={handleSave}
          disabled={saveLevelMutation.isPending || justSaved}
          className="rounded-xl text-sm font-bold py-3 flex items-center justify-center gap-1.5"
          style={{
            flex: 2,
            background: justSaved
              ? 'linear-gradient(135deg, #166534 0%, #22c55e 50%, #166534 100%)'
              : 'linear-gradient(135deg, #888888 0%, #c0c0c0 40%, #e8e8e8 55%, #c0c0c0 70%, #888888 100%)',
            color: justSaved ? '#fff' : '#0a0800',
            fontWeight: 700,
            transition: 'background 0.3s',
          }}
        >
          {saveLevelMutation.isPending ? '保存中…' : justSaved ? '✓ 已保存' : '确认保存'}
        </button>
      </div>
    </div>
  );
}
