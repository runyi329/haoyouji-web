/**
 * PositionLevelEdit.tsx
 * 档位编辑子页面 — 从 PositionCalc 点击进度条跳转进入
 * 路由: /ledger/:id/position-calc/:price
 * 保存/取消均返回上一页
 */
import React, { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { ChevronLeft, Check, X, Pencil } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

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
  const [baseValue, setBaseValue] = useState('');
  const [tacticalValue, setTacticalValue] = useState('');

  // 备注展开状态
  const [baseExpanded, setBaseExpanded] = useState(false);
  const [tacticalExpanded, setTacticalExpanded] = useState(false);
  const [editingNoteKey, setEditingNoteKey] = useState<string | null>(null);

  // 日志编辑状态
  const [editingLogId, setEditingLogId] = useState<number | null>(null);
  const [editingLogNote, setEditingLogNote] = useState('');

  // 当前档位的实际/计划数量（从数据库读取）
  const [actualQty, setActualQty] = useState(0);
  const [plannedQty, setPlannedQty] = useState(0);
  const [baseNotes, setBaseNotes] = useState<Array<{text: string; time: string}>>([]);
  const [tacticalNotes, setTacticalNotes] = useState<Array<{text: string; time: string}>>([]);

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
      const aq = (level.actualQty ?? 0);
      setActualQty(aq);
      setPlannedQty(pq);
      setBaseValue(bq > 0 ? String(bq) : '');
      setTacticalValue(tq > 0 ? String(tq) : '');
      setPlannedValue(pq > 0 ? String(pq) : '');
      try { setBaseNotes(JSON.parse(level.baseNotes || '[]')); } catch { setBaseNotes([]); }
      try { setTacticalNotes(JSON.parse(level.tacticalNotes || '[]')); } catch { setTacticalNotes([]); }
    }
  }, [positionData, price]);

  // mutations
  const saveLevelMutation = trpc.ethPositionSaveLevel.useMutation({
    onSuccess: () => {
      utils.ethPositionGetLevels.invalidate({ ledgerId });
      utils.ethPositionGetLogs.invalidate({ ledgerId });
      setLocation(`/ledger/${ledgerId}/position-calc`);
    },
    onError: (err) => {
      alert(`保存失败：${err.message}`);
    }
  });
  const updateNotesMutation = trpc.ethPositionUpdateNotes.useMutation();
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
    const bqNum = parseFloat(baseValue);
    const tqNum = parseFloat(tacticalValue);
    const pqNum = parseFloat(plannedValue);
    const bqVal = isNaN(bqNum) || bqNum < 0 ? 0 : bqNum;
    const tqVal = isNaN(tqNum) || tqNum < 0 ? 0 : tqNum;
    const totalVal = bqVal + tqVal;
    const newPlannedVal = !isNaN(pqNum) && pqNum >= 0 ? pqNum : plannedQty;
    const oldActual = actualQty;
    const oldPlanned = plannedQty;

    // 记录修改日志
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
      baseNotes: JSON.stringify(baseNotes),
      tacticalNotes: JSON.stringify(tacticalNotes),
    });
  };

  // 计算预览进度条
  const bqCur = parseFloat(baseValue) || 0;
  const tqCur = parseFloat(tacticalValue) || 0;
  const totalCur = bqCur + tqCur;
  const planCur = parseFloat(plannedValue) || plannedQty;
  const baseWidth = planCur > 0 ? Math.min(100, (bqCur / planCur) * 100) : 0;
  const tacticalWidth = planCur > 0 ? Math.min(100 - baseWidth, (tqCur / planCur) * 100) : 0;

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
          <div className="mb-4">
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

          {/* 底仓 */}
          <div className="mb-2">
            <div className="text-xs font-medium mb-1.5 tracking-wider" style={{ color: 'rgba(74,168,255,0.8)' }}>底仓 (ETH)</div>
            <div className="rounded-xl px-4 py-2" style={{ background: 'rgba(74,168,255,0.06)', border: '1px solid rgba(74,168,255,0.4)' }}>
              <input
                type="number"
                value={baseValue}
                onChange={e => setBaseValue(e.target.value)}
                placeholder="0"
                className="w-full text-center text-2xl font-bold outline-none bg-transparent"
                style={{ color: '#4aa8ff', fontVariantNumeric: 'tabular-nums' }}
                step="1"
                min="0"
              />
            </div>
          </div>

          {/* 底仓备注 */}
          <div className="mb-4">
            <div
              className="flex items-center gap-1.5 cursor-pointer select-none py-1"
              style={{ color: '#4aa8ff', opacity: 0.7 }}
              onClick={() => setBaseExpanded(v => !v)}
            >
              <span className="text-xs">{baseExpanded ? '▼' : '▶'}</span>
              <span className="text-xs">底仓备注</span>
              {baseNotes.length > 0 && <span className="text-xs rounded-full px-1.5" style={{ background: 'rgba(74,168,255,0.2)', color: '#4aa8ff' }}>{baseNotes.length}</span>}
            </div>
            {baseExpanded && (
              <div className="mt-1.5 space-y-1.5">
                {baseNotes.map((n, i) => {
                  const editKey = `base-${price}-${i}`;
                  const isEditing = editingNoteKey === editKey;
                  return (
                    <div key={i} className="flex items-start gap-1.5 px-2 py-1.5 rounded-lg" style={{ background: 'rgba(74,168,255,0.06)', border: `1px solid ${isEditing ? 'rgba(74,168,255,0.5)' : 'rgba(74,168,255,0.15)'}` }}>
                      {isEditing ? (
                        <input
                          autoFocus
                          type="text"
                          defaultValue={n.text}
                          className="flex-1 text-xs outline-none bg-transparent"
                          style={{ color: 'rgba(255,255,255,0.9)' }}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              const newText = (e.target as HTMLInputElement).value.trim();
                              if (newText) {
                                const newNotes = baseNotes.map((x, j) => j === i ? { ...x, text: newText } : x);
                                setBaseNotes(newNotes);
                                updateNotesMutation.mutate({ ledgerId, price, baseNotes: JSON.stringify(newNotes), tacticalNotes: JSON.stringify(tacticalNotes) });
                              }
                              setEditingNoteKey(null);
                            }
                            if (e.key === 'Escape') setEditingNoteKey(null);
                          }}
                          onBlur={e => {
                            const newText = e.target.value.trim();
                            if (newText && newText !== n.text) {
                              const newNotes = baseNotes.map((x, j) => j === i ? { ...x, text: newText } : x);
                              setBaseNotes(newNotes);
                              updateNotesMutation.mutate({ ledgerId, price, baseNotes: JSON.stringify(newNotes), tacticalNotes: JSON.stringify(tacticalNotes) });
                            }
                            setEditingNoteKey(null);
                          }}
                        />
                      ) : (
                        <span
                          className="flex-1 text-xs cursor-pointer"
                          style={{ color: 'rgba(255,255,255,0.75)' }}
                          onClick={() => setEditingNoteKey(editKey)}
                        >{n.text}</span>
                      )}
                      <span className="text-xs shrink-0" style={{ color: 'rgba(255,255,255,0.25)', fontSize: '10px' }}>{n.time}</span>
                      <button
                        onClick={() => {
                          const newNotes = baseNotes.filter((_, j) => j !== i);
                          setBaseNotes(newNotes);
                          updateNotesMutation.mutate({ ledgerId, price, baseNotes: JSON.stringify(newNotes), tacticalNotes: JSON.stringify(tacticalNotes) });
                        }}
                        style={{ color: 'rgba(255,80,80,0.5)' }}
                      ><X className="w-3 h-3" /></button>
                    </div>
                  );
                })}
                {/* 添加备注输入 */}
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    placeholder="添加底仓备注…"
                    className="flex-1 text-xs px-2 py-1.5 rounded-lg outline-none"
                    style={{ background: 'rgba(74,168,255,0.06)', border: '1px solid rgba(74,168,255,0.2)', color: 'rgba(255,255,255,0.7)' }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        const val = (e.target as HTMLInputElement).value.trim();
                        if (val) {
                          const newNotes = [...baseNotes, { text: val, time: new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) }];
                          setBaseNotes(newNotes);
                          updateNotesMutation.mutate({ ledgerId, price, baseNotes: JSON.stringify(newNotes), tacticalNotes: JSON.stringify(tacticalNotes) });
                          (e.target as HTMLInputElement).value = '';
                        }
                      }
                    }}
                  />
                  <button
                    className="px-2 rounded-lg text-xs"
                    style={{ background: 'rgba(74,168,255,0.15)', color: '#4aa8ff' }}
                    onClick={(e) => {
                      const input = (e.currentTarget.previousSibling as HTMLInputElement);
                      const val = input.value.trim();
                      if (val) {
                        const newNotes = [...baseNotes, { text: val, time: new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) }];
                        setBaseNotes(newNotes);
                        updateNotesMutation.mutate({ ledgerId, price, baseNotes: JSON.stringify(newNotes), tacticalNotes: JSON.stringify(tacticalNotes) });
                        input.value = '';
                      }
                    }}
                  >+</button>
                </div>
              </div>
            )}
          </div>

          {/* 机动仓 */}
          <div className="mb-2">
            <div className="text-xs font-medium mb-1.5 tracking-wider" style={{ color: 'rgba(232,112,32,0.8)' }}>机动仓 (ETH)</div>
            <div className="rounded-xl px-4 py-2" style={{ background: 'rgba(232,112,32,0.06)', border: '1px solid rgba(232,112,32,0.4)' }}>
              <input
                type="number"
                value={tacticalValue}
                onChange={e => setTacticalValue(e.target.value)}
                placeholder="0"
                className="w-full text-center text-2xl font-bold outline-none bg-transparent"
                style={{ color: '#e87020', fontVariantNumeric: 'tabular-nums' }}
                step="1"
                min="0"
              />
            </div>
          </div>

          {/* 机动仓备注 */}
          <div className="mb-4">
            <div
              className="flex items-center gap-1.5 cursor-pointer select-none py-1"
              style={{ color: '#e87020', opacity: 0.7 }}
              onClick={() => setTacticalExpanded(v => !v)}
            >
              <span className="text-xs">{tacticalExpanded ? '▼' : '▶'}</span>
              <span className="text-xs">机动仓备注</span>
              {tacticalNotes.length > 0 && <span className="text-xs rounded-full px-1.5" style={{ background: 'rgba(232,112,32,0.2)', color: '#e87020' }}>{tacticalNotes.length}</span>}
            </div>
            {tacticalExpanded && (
              <div className="mt-1.5 space-y-1.5">
                {tacticalNotes.map((n, i) => {
                  const editKey = `tactical-${price}-${i}`;
                  const isEditing = editingNoteKey === editKey;
                  return (
                    <div key={i} className="flex items-start gap-1.5 px-2 py-1.5 rounded-lg" style={{ background: 'rgba(232,112,32,0.06)', border: `1px solid ${isEditing ? 'rgba(232,112,32,0.5)' : 'rgba(232,112,32,0.15)'}` }}>
                      {isEditing ? (
                        <input
                          autoFocus
                          type="text"
                          defaultValue={n.text}
                          className="flex-1 text-xs outline-none bg-transparent"
                          style={{ color: 'rgba(255,255,255,0.9)' }}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              const newText = (e.target as HTMLInputElement).value.trim();
                              if (newText) {
                                const newNotes = tacticalNotes.map((x, j) => j === i ? { ...x, text: newText } : x);
                                setTacticalNotes(newNotes);
                                updateNotesMutation.mutate({ ledgerId, price, baseNotes: JSON.stringify(baseNotes), tacticalNotes: JSON.stringify(newNotes) });
                              }
                              setEditingNoteKey(null);
                            }
                            if (e.key === 'Escape') setEditingNoteKey(null);
                          }}
                          onBlur={e => {
                            const newText = e.target.value.trim();
                            if (newText && newText !== n.text) {
                              const newNotes = tacticalNotes.map((x, j) => j === i ? { ...x, text: newText } : x);
                              setTacticalNotes(newNotes);
                              updateNotesMutation.mutate({ ledgerId, price, baseNotes: JSON.stringify(baseNotes), tacticalNotes: JSON.stringify(newNotes) });
                            }
                            setEditingNoteKey(null);
                          }}
                        />
                      ) : (
                        <span
                          className="flex-1 text-xs cursor-pointer"
                          style={{ color: 'rgba(255,255,255,0.75)' }}
                          onClick={() => setEditingNoteKey(editKey)}
                        >{n.text}</span>
                      )}
                      <span className="text-xs shrink-0" style={{ color: 'rgba(255,255,255,0.25)', fontSize: '10px' }}>{n.time}</span>
                      <button
                        onClick={() => {
                          const newNotes = tacticalNotes.filter((_, j) => j !== i);
                          setTacticalNotes(newNotes);
                          updateNotesMutation.mutate({ ledgerId, price, baseNotes: JSON.stringify(baseNotes), tacticalNotes: JSON.stringify(newNotes) });
                        }}
                        style={{ color: 'rgba(255,80,80,0.5)' }}
                      ><X className="w-3 h-3" /></button>
                    </div>
                  );
                })}
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    placeholder="添加机动仓备注…"
                    className="flex-1 text-xs px-2 py-1.5 rounded-lg outline-none"
                    style={{ background: 'rgba(232,112,32,0.06)', border: '1px solid rgba(232,112,32,0.2)', color: 'rgba(255,255,255,0.7)' }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        const val = (e.target as HTMLInputElement).value.trim();
                        if (val) {
                          const newNotes = [...tacticalNotes, { text: val, time: new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) }];
                          setTacticalNotes(newNotes);
                          updateNotesMutation.mutate({ ledgerId, price, baseNotes: JSON.stringify(baseNotes), tacticalNotes: JSON.stringify(newNotes) });
                          (e.target as HTMLInputElement).value = '';
                        }
                      }
                    }}
                  />
                  <button
                    className="px-2 rounded-lg text-xs"
                    style={{ background: 'rgba(232,112,32,0.15)', color: '#e87020' }}
                    onClick={(e) => {
                      const input = (e.currentTarget.previousSibling as HTMLInputElement);
                      const val = input.value.trim();
                      if (val) {
                        const newNotes = [...tacticalNotes, { text: val, time: new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) }];
                        setTacticalNotes(newNotes);
                        updateNotesMutation.mutate({ ledgerId, price, baseNotes: JSON.stringify(baseNotes), tacticalNotes: JSON.stringify(newNotes) });
                        input.value = '';
                      }
                    }}
                  >+</button>
                </div>
              </div>
            )}
          </div>

          {/* 进度条预览 */}
          <div className="mb-5 rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(192,192,192,0.1)' }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs" style={{ color: 'rgba(192,192,192,0.5)' }}>进度预览</span>
              <span className="text-xs font-mono" style={{ color: 'rgba(192,192,192,0.7)' }}>{totalCur.toFixed(0)} / {planCur.toFixed(0)} ETH</span>
            </div>
            <div className="h-3 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <div className="h-full flex">
                <div style={{ width: `${baseWidth}%`, background: 'linear-gradient(90deg, #2a6aaa, #4aa8ff)', transition: 'width 0.3s' }} />
                <div style={{ width: `${tacticalWidth}%`, background: 'linear-gradient(90deg, #a04010, #e87020)', transition: 'width 0.3s' }} />
              </div>
            </div>
            <div className="flex items-center gap-3 mt-2">
              <div className="flex items-center gap-1">
                <div className="w-2.5 h-2.5 rounded-sm" style={{ background: '#4aa8ff' }} />
                <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>底仓 {bqCur > 0 ? bqCur.toFixed(0) : '0'}</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2.5 h-2.5 rounded-sm" style={{ background: '#e87020' }} />
                <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>机动仓 {tqCur > 0 ? tqCur.toFixed(0) : '0'}</span>
              </div>
            </div>
          </div>

          {/* 修改日志 */}
          <div className="mb-5" style={{ borderTop: '1px solid rgba(192,192,192,0.15)', paddingTop: '12px' }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium tracking-widest" style={{ color: 'rgba(192,192,192,0.6)' }}>修改日志</span>
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
