import { useState, useMemo } from 'react';
import { useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';

const LEDGER_ID = 59;

const GOLD = '#D4A830';
const GOLD_DIM = 'rgba(220,185,60,0.5)';
const GOLD_FAINT = 'rgba(201,168,76,0.15)';
const GOLD_BORDER = 'rgba(201,168,76,0.3)';
const GOLD_BORDER_SEL = 'rgba(201,168,76,0.7)';
const BG_PAGE = 'linear-gradient(160deg,#0D0D00 0%,#1A1600 40%,#0D0D00 100%)';

interface Member {
  userId: number;
  name: string;
  avatar: string | null;
  resourceWeight: number;
  capitalWeight: number;
  totalWeight: number;
  capitalAmount?: number;
  capitalRatio?: number;
  shareNo?: string | null;
  rawBonus?: number;
  autoBonus?: number;
}

interface WeightLog {
  id: number;
  oldResourceWeight: number;
  oldCapitalWeight: number;
  newResourceWeight: number;
  newCapitalWeight: number;
  remark: string;
  createdAt: Date;
  operatorName: string;
}

interface PreviewItem {
  userId: number;
  name: string;
  avatar: string | null;
  shareNo: string;
  capitalTotal: number;
  rank: number;
  tier: number | null;
  capitalWeight: number;
}

interface TierRow {
  tier: number;
  rankFrom: number;
  rankTo: number;
  weight: number;
}

function Avatar({ name, avatar, size = 36 }: { name: string; avatar: string | null; size?: number }) {
  if (avatar) {
    return (
      <img
        src={avatar}
        alt=""
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', border: `1px solid ${GOLD_BORDER}`, flexShrink: 0 }}
      />
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: GOLD_FAINT, color: GOLD, border: `1px solid ${GOLD_BORDER}`, fontSize: size * 0.38, fontWeight: 700, flexShrink: 0,
    }}>
      {name.slice(0, 1)}
    </div>
  );
}

function formatDate(d: Date | string) {
  const dt = d instanceof Date ? d : new Date(d);
  const m = dt.getMonth() + 1;
  const day = dt.getDate();
  const hh = String(dt.getHours()).padStart(2, '0');
  const mm = String(dt.getMinutes()).padStart(2, '0');
  return `${m}月${day}日 ${hh}:${mm}`;
}

function formatCapital(n: number) {
  if (n >= 10000) return (n / 10000).toFixed(1) + '万';
  return n.toLocaleString();
}

// 权重规则弹窗
function WeightRuleModal({ ledgerId, onClose }: { ledgerId: number; onClose: () => void }) {
  const [ruleTab, setRuleTab] = useState<'preview' | 'tiers'>('preview');
  const [applyMsg, setApplyMsg] = useState('');

  const { data, isLoading } = trpc.equity.previewAutoWeight.useQuery(
    { ledgerId },
    { retry: false }
  );

  const applyMutation = trpc.equity.applyAutoWeight.useMutation({
    onSuccess: (res) => {
      setApplyMsg(`已成功更新 ${res.updatedCount} 位成员的资金权重`);
      setTimeout(() => setApplyMsg(''), 4000);
    },
    onError: (e) => setApplyMsg('应用失败：' + e.message),
  });

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%', maxWidth: 520,
          background: 'linear-gradient(160deg,#0D0D00 0%,#1A1600 100%)',
          border: `1px solid ${GOLD_BORDER}`,
          borderRadius: '20px 20px 0 0',
          maxHeight: '88vh', display: 'flex', flexDirection: 'column',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* 弹窗头部 */}
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${GOLD_BORDER}`, flexShrink: 0 }}>
          <div>
            <div className="text-base font-semibold" style={{ color: GOLD }}>资金股权重规则</div>
            <div className="text-xs mt-0.5" style={{ color: GOLD_DIM }}>资金股 ≥ 10万，按股东编号早晚分66档</div>
          </div>
          <button onClick={onClose} className="text-xs px-3 py-1 rounded-full" style={{ border: `1px solid ${GOLD_BORDER}`, color: GOLD_DIM }}>关闭</button>
        </div>

        {/* 实时统计条 */}
        {data && (
          <div className="px-4 pt-3 pb-2 flex gap-3" style={{ flexShrink: 0 }}>
            <div className="flex-1 rounded-xl px-3 py-2.5 text-center" style={{ background: 'rgba(201,168,76,0.1)', border: `1px solid rgba(201,168,76,0.25)` }}>
              <div className="text-xs mb-1" style={{ color: GOLD_DIM }}>当前已排名人数</div>
              <div className="text-xl font-bold" style={{ color: GOLD }}>{data.totalRanked}</div>
              <div className="text-[10px] mt-0.5" style={{ color: 'rgba(220,185,60,0.35)' }}>/ 660 名额</div>
            </div>
            <div className="flex-1 rounded-xl px-3 py-2.5 text-center" style={{ background: 'rgba(201,168,76,0.1)', border: `1px solid rgba(201,168,76,0.25)` }}>
              <div className="text-xs mb-1" style={{ color: GOLD_DIM }}>下一位进来的权重</div>
              <div className="text-xl font-bold" style={{ color: '#FFE566' }}>{data.nextWeight.toFixed(4)}</div>
              <div className="text-[10px] mt-0.5" style={{ color: 'rgba(220,185,60,0.35)' }}>
                第 {data.totalRanked + 1} 名 / 第 {data.totalRanked < 660 ? Math.ceil((data.totalRanked + 1) / 10) : 66} 档
              </div>
            </div>
          </div>
        )}

        {/* Tab切换 */}
        <div className="flex px-4 pb-2 gap-2" style={{ flexShrink: 0 }}>
          {(['preview', 'tiers'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setRuleTab(tab)}
              className="flex-1 py-2 rounded-full text-sm font-medium"
              style={{
                background: ruleTab === tab ? 'rgba(201,168,76,0.2)' : 'transparent',
                border: `1px solid ${ruleTab === tab ? GOLD_BORDER_SEL : GOLD_BORDER}`,
                color: ruleTab === tab ? GOLD : GOLD_DIM,
              }}
            >
              {tab === 'preview' ? '成员预览' : '66档规则'}
            </button>
          ))}
        </div>

        {/* 内容区 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px' }}>
          {isLoading && (
            <div className="text-center py-10 text-sm" style={{ color: GOLD_DIM }}>计算中...</div>
          )}

          {/* 成员预览 Tab */}
          {!isLoading && data && ruleTab === 'preview' && (
            <div>
              {data.preview.length === 0 ? (
                <div className="text-center py-8 text-sm" style={{ color: 'rgba(220,185,60,0.4)' }}>
                  暂无资金股 ≥ 10万的成员
                </div>
              ) : (
                <>
                  <div className="text-xs mb-2" style={{ color: GOLD_DIM }}>
                    共 {data.preview.length} 位成员符合条件，应用后将更新其资金权重（资源权重不变）
                  </div>
                  {(data.preview as PreviewItem[]).map((item) => (
                    <div
                      key={item.userId}
                      className="flex items-center justify-between rounded-xl px-3 py-2.5 mb-2"
                      style={{ background: '#0A0A00', border: `1px solid rgba(201,168,76,0.2)` }}
                    >
                      <div className="flex items-center gap-2">
                        <Avatar name={item.name} avatar={item.avatar} size={30} />
                        <div>
                          <div className="text-sm font-medium">{item.name}</div>
                          <div className="text-[10px] mt-0.5" style={{ color: GOLD_DIM }}>
                            编号 {item.shareNo} · 资金股 {formatCapital(item.capitalTotal)}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold" style={{ color: '#FFE566' }}>
                          {item.capitalWeight.toFixed(4)}
                        </div>
                        <div className="text-[10px]" style={{ color: 'rgba(220,185,60,0.4)' }}>
                          第{item.rank}名 · 第{item.tier}档
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {/* 66档规则 Tab */}
          {!isLoading && data && ruleTab === 'tiers' && (
            <div>
              <div className="text-xs mb-2" style={{ color: GOLD_DIM }}>
                资金股 ≥ 10万 且 股东编号在前660名，按10人一档共66档，入股早晚加成等差分布 1.0 → 0.0154（加在基础值1.0上）
              </div>
              <div className="rounded-xl overflow-hidden" style={{ border: `1px solid rgba(201,168,76,0.2)` }}>
                {/* 表头 */}
                <div className="flex px-3 py-2" style={{ background: 'rgba(201,168,76,0.15)', borderBottom: `1px solid rgba(201,168,76,0.2)` }}>
                  <div className="flex-1 text-xs font-semibold text-center" style={{ color: GOLD }}>档位</div>
                  <div className="flex-1 text-xs font-semibold text-center" style={{ color: GOLD }}>排名区间</div>
                    <div className="flex-1 text-xs font-semibold text-center" style={{ color: GOLD }}>加成值</div>
                    <div className="flex-1 text-xs font-semibold text-center" style={{ color: GOLD }}>资金权重(1+加成)</div>
                </div>
                {(data.tiers as TierRow[]).map((row, idx) => (
                  <div
                    key={row.tier}
                    className="flex px-3 py-2"
                    style={{
                      background: idx % 2 === 0 ? 'rgba(201,168,76,0.04)' : '#0A0A00',
                      borderBottom: idx < data.tiers.length - 1 ? `1px solid rgba(201,168,76,0.1)` : 'none',
                    }}
                  >
                    <div className="flex-1 text-xs text-center" style={{ color: GOLD_DIM }}>第 {row.tier} 档</div>
                    <div className="flex-1 text-xs text-center" style={{ color: GOLD_DIM }}>{row.rankFrom} ~ {row.rankTo} 名</div>
                    <div className="flex-1 text-xs text-center font-bold" style={{ color: row.tier === 1 ? '#FFE566' : GOLD_DIM }}>
                      +{(row as any).bonus?.toFixed(4) ?? '—'}
                    </div>
                    <div className="flex-1 text-xs text-center font-bold" style={{ color: row.tier === 1 ? '#FFE566' : GOLD_DIM }}>
                      {row.weight.toFixed(4)}
                    </div>
                  </div>
                ))}
              </div>
              <div className="text-[11px] mt-2" style={{ color: 'rgba(220,185,60,0.35)' }}>
                第661名及以后：加成值 = 0，资金权重固定为 1.0000
              </div>
            </div>
          )}
        </div>

        {/* 底部应用按钮 */}
        <div className="px-4 pb-6 pt-3" style={{ borderTop: `1px solid ${GOLD_BORDER}`, flexShrink: 0 }}>
          {applyMsg && (
            <div className="text-xs text-center mb-2" style={{ color: applyMsg.includes('成功') ? '#4ade80' : '#ff6b6b' }}>
              {applyMsg}
            </div>
          )}
          <button
            onClick={() => applyMutation.mutate({ ledgerId })}
            disabled={applyMutation.isPending || isLoading || !data || data.preview.length === 0}
            className="w-full py-3 rounded-full text-sm font-semibold"
            style={{
              background: 'linear-gradient(135deg,#C8920A 0%,#FFE566 100%)',
              color: '#000',
              opacity: (applyMutation.isPending || isLoading || !data || data.preview.length === 0) ? 0.5 : 1,
            }}
          >
            {applyMutation.isPending ? '应用中...' : `一键应用自动权重（${data?.preview.length ?? 0} 人）`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function EquityWeightManage() {
  const [, setLocation] = useLocation();
  const [keyword, setKeyword] = useState('');
  const [selected, setSelected] = useState<Member | null>(null);
  const [resInput, setResInput] = useState('');
  const [capInput, setCapInput] = useState('');
  const [msg, setMsg] = useState('');
  const [activeTab, setActiveTab] = useState<'edit' | 'log'>('edit');
  const [showRuleModal, setShowRuleModal] = useState(false);

  // 拉取成员+权重列表
  const { data, isLoading, error, refetch } = trpc.equity.getWeightMembers.useQuery(
    { ledgerId: LEDGER_ID },
    { retry: false }
  );

  // 拉取日志（仅选中成员时）
  const { data: logs, isLoading: logsLoading, refetch: refetchLogs } = trpc.equity.getWeightLogs.useQuery(
    { ledgerId: LEDGER_ID, userId: selected?.userId ?? 0 },
    { enabled: !!selected && activeTab === 'log', retry: false }
  );

  // 设置权重
  const setWeight = trpc.equity.setMemberWeight.useMutation({
    onSuccess: () => {
      refetch();
      refetchLogs();
      setMsg('保存成功');
      setTimeout(() => setMsg(''), 2500);
    },
    onError: (e) => setMsg('保存失败：' + e.message),
  });

  const list = useMemo(() => {
    if (!data) return [];
    const kw = keyword.trim().toLowerCase();
    if (!kw) return data as Member[];
    return (data as Member[]).filter(m => m.name.toLowerCase().includes(kw));
  }, [data, keyword]);

  const handleSelect = (m: Member) => {
    setSelected(m);
    setResInput(m.resourceWeight.toFixed(2));
    setCapInput(m.capitalWeight.toFixed(2));
    setMsg('');
    setActiveTab('edit');
  };

  const previewTotal = () => {
    const r = parseFloat(resInput);
    const c = parseFloat(capInput);
    if (isNaN(r) || isNaN(c)) return '—';
    return (Math.round(r * c * 10000) / 10000).toFixed(4);
  };

  const handleSave = () => {
    if (!selected) return;
    const r = parseFloat(resInput);
    const c = parseFloat(capInput);
    if (isNaN(r) || r < 0 || isNaN(c) || c < 0) {
      setMsg('请输入有效数值（如 1.0、0.5）');
      return;
    }
    setWeight.mutate({ ledgerId: LEDGER_ID, userId: selected.userId, resourceWeight: r, capitalWeight: c });
  };

  return (
    <div style={{ background: BG_PAGE, minHeight: '100vh', color: '#fff', display: 'flex', flexDirection: 'column' }}>

      {/* 顶栏 */}
      <div className="flex items-center px-4 py-3" style={{ borderBottom: `1px solid ${GOLD_BORDER}`, flexShrink: 0 }}>
        <button
          onClick={() => setLocation(`/ledger/${LEDGER_ID}/settings`)}
          className="text-sm px-3 py-1 rounded-full mr-3"
          style={{ border: `1px solid rgba(201,168,76,0.5)`, color: GOLD, background: 'transparent' }}
        >
          返回
        </button>
        <span className="text-base font-semibold" style={{ color: GOLD }}>权重管理</span>
        {data && (
          <span className="ml-2 text-xs" style={{ color: GOLD_DIM }}>共 {data.length} 人</span>
        )}
        {/* 权重规则按钮 */}
        <button
          onClick={() => setShowRuleModal(true)}
          className="ml-auto text-sm px-3 py-1.5 rounded-full font-medium"
          style={{
            background: 'linear-gradient(135deg,rgba(200,146,10,0.25) 0%,rgba(255,229,102,0.15) 100%)',
            border: `1px solid ${GOLD_BORDER_SEL}`,
            color: GOLD,
          }}
        >
          权重规则
        </button>
      </div>

      {/* 说明条 */}
      <div className="px-4 pt-3 pb-2" style={{ flexShrink: 0 }}>
        <div className="text-xs rounded-xl px-3 py-2" style={{ background: 'rgba(201,168,76,0.08)', border: `1px solid rgba(201,168,76,0.18)`, color: GOLD_DIM }}>
          总权重 = 资源权重 × 资金权重，默认均为 1.0。点击成员可修改权重或查看变更日志。
        </div>
      </div>

      {/* 搜索框 */}
      <div className="px-4 pb-2" style={{ flexShrink: 0 }}>
        <input
          type="text"
          placeholder="搜索成员姓名..."
          value={keyword}
          onChange={e => setKeyword(e.target.value)}
          className="w-full rounded-xl px-4 py-2.5 text-sm"
          style={{ background: 'rgba(201,168,76,0.08)', border: `1px solid ${GOLD_BORDER}`, color: '#fff', outline: 'none' }}
        />
      </div>

      {/* 主体区域：上下布局 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* 成员列表区（固定高度，可滚动） */}
        <div style={{ flex: selected ? '0 0 auto' : '1 1 auto', maxHeight: selected ? '38vh' : '100%', overflowY: 'auto', padding: '0 16px 8px' }}>
          {isLoading && (
            <div className="text-center py-8 text-sm" style={{ color: GOLD_DIM }}>加载中...</div>
          )}
          {!isLoading && error && (
            <div className="text-center py-8 text-sm" style={{ color: '#ff6b6b' }}>加载失败：{error.message}</div>
          )}
          {!isLoading && !error && list.length === 0 && (
            <div className="text-center py-8 text-sm" style={{ color: 'rgba(220,185,60,0.4)' }}>
              {keyword ? '未找到匹配成员' : '暂无成员'}
            </div>
          )}
          {!isLoading && !error && list.map((m: Member) => {
            const isSel = selected?.userId === m.userId;
            return (
              <div
                key={m.userId}
                onClick={() => handleSelect(m)}
                className="flex items-center justify-between rounded-2xl px-3 py-2.5 mb-2"
                style={{
                  background: isSel ? 'rgba(201,168,76,0.18)' : '#000',
                  border: `1px solid ${isSel ? GOLD_BORDER_SEL : 'rgba(201,168,76,0.2)'}`,
                  cursor: 'pointer',
                }}
              >
                <div className="flex items-center gap-2.5">
                  <Avatar name={m.name} avatar={m.avatar} size={34} />
                  <div>
                    <div className="text-sm font-medium">{m.name}</div>
                    <div className="text-[10px] mt-0.5" style={{ color: GOLD_DIM }}>
                      资源 {m.resourceWeight.toFixed(2)} × 资金 {m.capitalWeight.toFixed(2)}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold" style={{ background: 'linear-gradient(180deg,#FFE566 0%,#C8920A 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                    {m.totalWeight.toFixed(2)}
                  </div>
                  <div className="text-[10px]" style={{ color: 'rgba(220,185,60,0.4)' }}>总权重</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* 详情区（选中成员后展开） */}
        {selected && (
          <div style={{ flex: '1 1 auto', overflowY: 'auto', padding: '0 16px 24px', borderTop: `1px solid ${GOLD_BORDER}` }}>

            {/* 成员标题行 + Tab切换 */}
            <div className="flex items-center justify-between pt-3 pb-2">
              <div className="flex items-center gap-2">
                <Avatar name={selected.name} avatar={selected.avatar} size={28} />
                <span className="text-sm font-semibold" style={{ color: GOLD }}>{selected.name}</span>
              </div>
              <div className="flex items-center gap-1">
                {(['edit', 'log'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className="text-xs px-3 py-1 rounded-full"
                    style={{
                      background: activeTab === tab ? 'rgba(201,168,76,0.25)' : 'transparent',
                      border: `1px solid ${activeTab === tab ? GOLD_BORDER_SEL : GOLD_BORDER}`,
                      color: activeTab === tab ? GOLD : GOLD_DIM,
                    }}
                  >
                    {tab === 'edit' ? '编辑权重' : '变更日志'}
                  </button>
                ))}
                <button
                  onClick={() => setSelected(null)}
                  className="text-xs px-2 py-1 rounded-full ml-1"
                  style={{ border: `1px solid ${GOLD_BORDER}`, color: GOLD_DIM, background: 'transparent' }}
                >
                  收起
                </button>
              </div>
            </div>

            {/* 编辑权重 Tab */}
            {activeTab === 'edit' && (
              <div className="rounded-2xl px-4 pt-4 pb-5" style={{ background: '#0A0A00', border: `1px solid rgba(201,168,76,0.4)` }}>
                <div className="flex gap-2 mb-4 items-end">
                  <div className="flex-1">
                    <label className="text-xs block mb-1" style={{ color: GOLD_DIM }}>资源权重</label>
                    <input
                      type="number" step="0.1" min="0"
                      value={resInput}
                      onChange={e => setResInput(e.target.value)}
                      className="w-full rounded-xl px-3 py-2 text-sm text-center"
                      style={{ background: 'rgba(201,168,76,0.08)', border: `1px solid rgba(201,168,76,0.35)`, color: '#fff', outline: 'none' }}
                    />
                  </div>
                  <div className="pb-2 text-sm" style={{ color: GOLD_DIM }}>×</div>
                  <div className="flex-1">
                    <label className="text-xs block mb-1" style={{ color: GOLD_DIM }}>资金权重</label>
                    <input
                      type="number" step="0.1" min="0"
                      value={capInput}
                      onChange={e => setCapInput(e.target.value)}
                      className="w-full rounded-xl px-3 py-2 text-sm text-center"
                      style={{ background: 'rgba(201,168,76,0.08)', border: `1px solid rgba(201,168,76,0.35)`, color: '#fff', outline: 'none' }}
                    />
                  </div>
                  <div className="pb-2 text-sm" style={{ color: GOLD_DIM }}>=</div>
                  <div className="flex-1">
                    <label className="text-xs block mb-1" style={{ color: GOLD_DIM }}>总权重</label>
                    <div className="w-full rounded-xl px-3 py-2 text-sm text-center font-bold" style={{ background: 'rgba(201,168,76,0.06)', border: `1px solid rgba(201,168,76,0.2)`, color: '#FFE566' }}>
                      {previewTotal()}
                    </div>
                  </div>
                </div>
                {msg && (
                  <div className="text-xs text-center mb-3" style={{ color: msg.includes('成功') ? '#4ade80' : '#ff6b6b' }}>
                    {msg}
                  </div>
                )}
                <button
                  onClick={handleSave}
                  disabled={setWeight.isPending}
                  className="w-full py-2.5 rounded-full text-sm font-semibold"
                  style={{ background: 'linear-gradient(135deg,#C8920A 0%,#FFE566 100%)', color: '#000' }}
                >
                  {setWeight.isPending ? '保存中...' : '确认保存'}
                </button>

                {/* 权重计算明细 */}
                <div className="mt-4 rounded-xl px-3 py-3" style={{ background: 'rgba(0,0,0,0.4)', border: `1px solid rgba(201,168,76,0.2)` }}>
                  <div className="text-xs font-semibold mb-3" style={{ color: GOLD_DIM }}>权重计算明细</div>

                  {/* 资金权重拆解 */}
                  <div className="mb-3">
                    <div className="text-[11px] font-medium mb-2" style={{ color: 'rgba(220,185,60,0.6)' }}>资金权重 = 基础值 + 入股早晚加成 × 资金达标系数</div>

                    {/* 资金股本金行 */}
                    <div className="mb-1.5 px-2 py-1.5 rounded-lg" style={{ background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.15)' }}>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px]" style={{ color: 'rgba(220,185,60,0.5)' }}>资金股本金（仅资金股类型）</span>
                        <span className="text-xs font-medium" style={{ color: GOLD_DIM }}>
                          {selected.capitalAmount !== undefined ? `¥${selected.capitalAmount.toLocaleString()}` : '—'}
                        </span>
                      </div>
                    </div>

                    {/* 达标系数行 - 展示完整公式 */}
                    <div className="mb-1.5 px-2 py-1.5 rounded-lg" style={{ background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.15)' }}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px]" style={{ color: 'rgba(220,185,60,0.5)' }}>资金达标系数</span>
                        <span className="text-xs font-medium" style={{ color: GOLD_DIM }}>
                          {selected.capitalRatio !== undefined ? (selected.capitalRatio * 100).toFixed(2) + '%' : '—'}
                        </span>
                      </div>
                      <div className="text-[10px]" style={{ color: 'rgba(220,185,60,0.35)' }}>
                        {selected.capitalAmount !== undefined
                          ? `¥${selected.capitalAmount.toLocaleString()} ÷ ¥100,000 = ${selected.capitalRatio !== undefined ? (selected.capitalRatio * 100).toFixed(2) : '—'}%（上限 100%）`
                          : '—'}
                      </div>
                    </div>

                    {/* 入股早晚加成行 */}
                    <div className="mb-1.5 px-2 py-1.5 rounded-lg" style={{ background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.15)' }}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px]" style={{ color: 'rgba(220,185,60,0.5)' }}>入股早晚加成</span>
                        <span className="text-xs font-medium" style={{ color: GOLD_DIM }}>
                          {selected.rawBonus !== undefined ? '+' + selected.rawBonus.toFixed(4) : '—'}
                        </span>
                      </div>
                      <div className="text-[10px]" style={{ color: 'rgba(220,185,60,0.35)' }}>
                        {selected.shareNo
                          ? `股东编号 #${selected.shareNo}，第 ${Math.ceil(parseInt(selected.shareNo) / 10)} 档（前660名有效）`
                          : '未分配股东编号，无入股早晚加成'}
                      </div>
                    </div>

                    {/* 实际加成行 */}
                    <div className="flex items-center justify-between mb-2 px-2 py-1.5 rounded-lg" style={{ background: 'rgba(201,168,76,0.1)', border: `1px solid rgba(201,168,76,0.25)` }}>
                      <span className="text-[11px] font-medium" style={{ color: GOLD_DIM }}>实际加成 = 早晚加成 × 达标系数</span>
                      <span className="text-xs font-bold" style={{ color: '#FFE566' }}>
                        +{selected.autoBonus !== undefined ? selected.autoBonus.toFixed(4) : (parseFloat(capInput) - 1.0).toFixed(4)}
                      </span>
                    </div>

                    {/* 资金权重结果 */}
                    <div className="flex items-center justify-between px-2 py-1.5 rounded-lg" style={{ background: 'rgba(255,229,102,0.08)', border: `1px solid rgba(255,229,102,0.25)` }}>
                      <span className="text-[11px] font-semibold" style={{ color: GOLD }}>
                        资金权重 = 1.0 + {selected.autoBonus !== undefined ? selected.autoBonus.toFixed(4) : (parseFloat(capInput) - 1.0).toFixed(4)} = {parseFloat(capInput).toFixed(4)}
                      </span>
                    </div>
                  </div>

                  {/* 资源权重 */}
                  <div className="mb-3" style={{ borderTop: `1px solid rgba(201,168,76,0.12)`, paddingTop: 10 }}>
                    <div className="text-[11px] font-medium mb-2" style={{ color: 'rgba(220,185,60,0.6)' }}>资源权重（手动设置）</div>
                    <div className="flex items-center justify-between px-2 py-1.5 rounded-lg" style={{ background: 'rgba(255,229,102,0.08)', border: `1px solid rgba(255,229,102,0.25)` }}>
                      <span className="text-[11px] font-semibold" style={{ color: GOLD }}>资源权重</span>
                      <span className="text-sm font-bold" style={{ color: '#FFE566' }}>{parseFloat(resInput).toFixed(4)}</span>
                    </div>
                  </div>

                  {/* 最终乘积 */}
                  <div className="pt-2" style={{ borderTop: `1px solid rgba(201,168,76,0.2)` }}>
                    <div className="flex items-center justify-between px-2 py-2 rounded-lg" style={{ background: 'linear-gradient(135deg,rgba(200,146,10,0.15) 0%,rgba(255,229,102,0.1) 100%)', border: `1px solid rgba(201,168,76,0.4)` }}>
                      <span className="text-xs font-semibold" style={{ color: GOLD }}>总权重 = 资金权重 × 资源权重</span>
                      <span className="text-base font-bold" style={{ color: '#FFE566' }}>{previewTotal()}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 变更日志 Tab */}
            {activeTab === 'log' && (
              <div>
                {logsLoading && (
                  <div className="text-center py-6 text-sm" style={{ color: GOLD_DIM }}>加载日志中...</div>
                )}
                {!logsLoading && (!logs || logs.length === 0) && (
                  <div className="text-center py-6 text-sm" style={{ color: 'rgba(220,185,60,0.35)' }}>暂无变更记录</div>
                )}
                {!logsLoading && logs && logs.length > 0 && (
                  <div className="space-y-2 pt-1">
                    {(logs as WeightLog[]).map((log, idx) => {
                      const oldTotal = (Math.round(log.oldResourceWeight * log.oldCapitalWeight * 10000) / 10000).toFixed(2);
                      const newTotal = (Math.round(log.newResourceWeight * log.newCapitalWeight * 10000) / 10000).toFixed(2);
                      const isFirst = idx === 0;
                      return (
                        <div
                          key={log.id}
                          className="rounded-xl px-3 py-3"
                          style={{
                            background: isFirst ? 'rgba(201,168,76,0.1)' : '#0A0A00',
                            border: `1px solid ${isFirst ? 'rgba(201,168,76,0.4)' : 'rgba(201,168,76,0.18)'}`,
                          }}
                        >
                          {/* 时间行 */}
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[11px]" style={{ color: GOLD_DIM }}>{formatDate(log.createdAt)}</span>
                            <span className="text-[10px]" style={{ color: 'rgba(220,185,60,0.35)' }}>by {log.operatorName}</span>
                          </div>
                          {/* 变更内容 */}
                          <div className="flex items-center gap-2">
                            {/* 旧值 */}
                            <div className="flex-1 text-center rounded-lg py-1.5" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(201,168,76,0.15)' }}>
                              <div className="text-[10px] mb-0.5" style={{ color: 'rgba(220,185,60,0.4)' }}>变更前</div>
                              <div className="text-xs font-medium" style={{ color: 'rgba(220,185,60,0.7)' }}>
                                {log.oldResourceWeight.toFixed(2)} × {log.oldCapitalWeight.toFixed(2)}
                              </div>
                              <div className="text-sm font-bold mt-0.5" style={{ color: 'rgba(220,185,60,0.6)' }}>{oldTotal}</div>
                            </div>
                            {/* 箭头 */}
                            <div style={{ color: GOLD, fontSize: 14, flexShrink: 0 }}>→</div>
                            {/* 新值 */}
                            <div className="flex-1 text-center rounded-lg py-1.5" style={{ background: 'rgba(201,168,76,0.08)', border: `1px solid rgba(201,168,76,0.3)` }}>
                              <div className="text-[10px] mb-0.5" style={{ color: GOLD_DIM }}>变更后</div>
                              <div className="text-xs font-medium" style={{ color: GOLD }}>
                                {log.newResourceWeight.toFixed(2)} × {log.newCapitalWeight.toFixed(2)}
                              </div>
                              <div className="text-sm font-bold mt-0.5" style={{ color: '#FFE566' }}>{newTotal}</div>
                            </div>
                          </div>
                          {log.remark && (
                            <div className="mt-1.5 text-[11px]" style={{ color: 'rgba(220,185,60,0.5)' }}>备注：{log.remark}</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 权重规则弹窗 */}
      {showRuleModal && (
        <WeightRuleModal ledgerId={LEDGER_ID} onClose={() => setShowRuleModal(false)} />
      )}
    </div>
  );
}
