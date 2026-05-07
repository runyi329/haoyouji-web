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
interface ChipItem {
  qty: string;         // 数量（ETH）
  takeProfit: string;  // 止盈价（USD），可选
  note: string;        // 备注，可选
}

const emptyChip = (): ChipItem => ({ qty: '', takeProfit: '', note: '' });

/** 从旧格式迁移到新格式 */
function migrateToItems(qty: number, notesJson: string): ChipItem[] {
  try {
    const parsed = JSON.parse(notesJson || '[]');
    // 新格式：[{qty, takeProfit, note}]
    if (Array.isArray(parsed) && parsed.length > 0 && 'qty' in parsed[0]) {
      return parsed.map((x: any) => ({
        qty: String(x.qty ?? ''),
        takeProfit: String(x.takeProfit ?? ''),
        note: x.note ?? '',
      }));
    }
    // 旧格式：[{text, time}] — 迁移
    if (qty > 0) {
      const noteText = parsed.map((n: any) => n.text).filter(Boolean).join('；');
      return [{ qty: String(qty), takeProfit: '', note: noteText }];
    }
    return [];
  } catch {
    return qty > 0 ? [{ qty: String(qty), takeProfit: '', note: '' }] : [];
  }
}

/** 序列化为 JSON 存储 */
function serializeItems(items: ChipItem[]): string {
  return JSON.stringify(items.map(x => ({
    qty: parseFloat(x.qty) || 0,
    takeProfit: parseFloat(x.takeProfit) || 0,
    note: x.note,
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
      window.location.href = `/ledger/${ledgerId}/position-calc`;
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

  // 计算预览进度条
  const bqCur = sumQty(baseItems);
  const tqCur = sumQty(tacticalItems);
  const totalCur = bqCur + tqCur;
  const planCur = parseFloat(plannedValue) || plannedQty;
  const baseWidth = planCur > 0 ? Math.min(100, (bqCur / planCur) * 100) : 0;
  const tacticalWidth = planCur > 0 ? Math.min(100 - baseWidth, (tqCur / planCur) * 100) : 0;

  // 加权平均止盈价
  const baseAvgTP = weightedAvgTakeProfit(baseItems);
  const tacticalAvgTP = weightedAvgTakeProfit(tacticalItems);

  // ---- 辅助：更新某条记录 ----
  const updateBase = (i: number, field: keyof ChipItem, val: string) => {
    setBaseItems(prev => prev.map((x, j) => j === i ? { ...x, [field]: val } : x));
  };
  const updateTactical = (i: number, field: keyof ChipItem, val: string) => {
    setTacticalItems(prev => prev.map((x, j) => j === i ? { ...x, [field]: val } : x));
  };
  const addBase = () => setBaseItems(prev => [...prev, emptyChip()]);
  const addTactical = () => setTacticalItems(prev => [...prev, emptyChip()]);
  const removeBase = (i: number) => setBaseItems(prev => prev.length > 1 ? prev.filter((_, j) => j !== i) : [emptyChip()]);
  const removeTactical = (i: number) => setTacticalItems(prev => prev.length > 1 ? prev.filter((_, j) => j !== i) : [emptyChip()]);

  // ---- 单条记录行组件 ----
  const ChipRow = ({
    item, index, color, accentRgb,
    onChange, onRemove,
  }: {
    item: ChipItem;
    index: number;
    color: string;
    accentRgb: string; // e.g. "74,168,255"
    onChange: (field: keyof ChipItem, val: string) => void;
    onRemove: () => void;
  }) => (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: `rgba(${accentRgb},0.06)`, border: `1px solid rgba(${accentRgb},0.3)` }}
    >
      {/* 第一行：序号 + 数量 + 止盈价 + 删除 */}
      <div className="flex items-center gap-2 px-3 pt-2 pb-1">
        <span className="text-xs shrink-0 w-4 text-center" style={{ color: `rgba(${accentRgb},0.5)` }}>#{index + 1}</span>

        {/* 数量 */}
        <div className="flex items-center gap-1 flex-1">
          <input
            type="number"
            value={item.qty}
            onChange={e => onChange('qty', e.target.value)}
            placeholder="0"
            className="w-20 text-center text-base font-bold outline-none bg-transparent"
            style={{ color, fontVariantNumeric: 'tabular-nums' }}
            step="1"
            min="0"
          />
          <span className="text-xs shrink-0" style={{ color: `rgba(${accentRgb},0.5)` }}>ETH</span>
        </div>

        {/* 止盈价 */}
        <div className="flex items-center gap-1 flex-1">
          <span className="text-xs shrink-0" style={{ color: `rgba(${accentRgb},0.5)` }}>止盈$</span>
          <input
            type="number"
            value={item.takeProfit}
            onChange={e => onChange('takeProfit', e.target.value)}
            placeholder="—"
            className="flex-1 text-center text-base font-bold outline-none bg-transparent min-w-0"
            style={{ color: '#f0d060', fontVariantNumeric: 'tabular-nums' }}
            step="100"
            min="0"
          />
        </div>

        {/* 删除 */}
        <button
          onClick={onRemove}
          className="shrink-0 p-1 rounded"
          style={{ color: 'rgba(255,80,80,0.5)' }}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 第二行：备注 */}
      <div className="px-3 pb-2">
        <input
          type="text"
          value={item.note}
          onChange={e => onChange('note', e.target.value)}
          placeholder="备注（可选）"
          className="w-full text-xs outline-none bg-transparent"
          style={{ color: 'rgba(255,255,255,0.5)', borderTop: `1px solid rgba(${accentRgb},0.15)`, paddingTop: '4px' }}
        />
      </div>
    </div>
  );

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
            {/* 进度条 */}
            <div className="h-3 rounded-full overflow-hidden mb-3" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <div className="h-full flex">
                <div style={{ width: `${baseWidth}%`, background: 'linear-gradient(90deg, #2a6aaa, #4aa8ff)', transition: 'width 0.3s' }} />
                <div style={{ width: `${tacticalWidth}%`, background: 'linear-gradient(90deg, #a04010, #e87020)', transition: 'width 0.3s' }} />
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
                <div className="text-base font-bold font-mono" style={{ color: '#4aa8ff' }}>{bqCur.toFixed(2)}</div>
                <div className="text-xs mt-0.5" style={{ color: 'rgba(74,168,255,0.5)' }}>
                  {baseItems.filter(x => parseFloat(x.qty) > 0).length} 条记录
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
                <div className="text-base font-bold font-mono" style={{ color: '#e87020' }}>{tqCur.toFixed(2)}</div>
                <div className="text-xs mt-0.5" style={{ color: 'rgba(232,112,32,0.5)' }}>
                  {tacticalItems.filter(x => parseFloat(x.qty) > 0).length} 条记录
                </div>
                {tacticalAvgTP > 0 && (
                  <div className="text-xs mt-0.5 font-mono" style={{ color: '#f0d060' }}>
                    均止盈 ${tacticalAvgTP.toFixed(0)}
                  </div>
                )}
              </div>
            </div>
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
          disabled={saveLevelMutation.isPending}
          className="rounded-xl text-sm font-bold py-3"
          style={{ flex: 2, background: 'linear-gradient(135deg, #888888 0%, #c0c0c0 40%, #e8e8e8 55%, #c0c0c0 70%, #888888 100%)', color: '#0a0800', fontWeight: 700 }}
        >
          {saveLevelMutation.isPending ? '保存中…' : '确认保存'}
        </button>
      </div>
    </div>
  );
}
