import { useState, useMemo } from 'react';
import { useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';

const LEDGER_ID = 59;

interface Member {
  userId: number;
  name: string;
  avatar: string | null;
  resourceWeight: number;
  capitalWeight: number;
  totalWeight: number;
}

export default function EquityWeightManage() {
  const [, setLocation] = useLocation();

  // 搜索关键字（本地过滤）
  const [keyword, setKeyword] = useState('');

  // 当前选中的成员
  const [selected, setSelected] = useState<Member | null>(null);
  const [resInput, setResInput] = useState('');
  const [capInput, setCapInput] = useState('');
  const [msg, setMsg] = useState('');

  // 拉取账本成员+权重列表
  const { data, isLoading, error, refetch } = trpc.equity.getWeightMembers.useQuery(
    { ledgerId: LEDGER_ID },
    { retry: false }
  );

  // 设置权重 mutation
  const setWeight = trpc.equity.setMemberWeight.useMutation({
    onSuccess: () => {
      refetch();
      setMsg('保存成功');
      setTimeout(() => setMsg(''), 2500);
    },
    onError: (e) => setMsg('保存失败：' + e.message),
  });

  // 本地搜索过滤
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
    setWeight.mutate({
      ledgerId: LEDGER_ID,
      userId: selected.userId,
      resourceWeight: r,
      capitalWeight: c,
    });
  };

  return (
    <div style={{ background: 'linear-gradient(160deg,#0D0D00 0%,#1A1600 40%,#0D0D00 100%)', minHeight: '100vh', color: '#fff' }}>

      {/* 顶栏 */}
      <div className="flex items-center px-4 py-3" style={{ borderBottom: '1px solid rgba(201,168,76,0.3)' }}>
        <button
          onClick={() => setLocation(`/ledger/${LEDGER_ID}/settings`)}
          className="text-sm px-3 py-1 rounded-full mr-3"
          style={{ border: '1px solid rgba(201,168,76,0.5)', color: '#D4A830', background: 'transparent' }}
        >
          返回
        </button>
        <span className="text-base font-semibold" style={{ color: '#D4A830' }}>权重管理</span>
        {data && (
          <span className="ml-2 text-xs" style={{ color: 'rgba(220,185,60,0.5)' }}>共 {data.length} 人</span>
        )}
      </div>

      {/* 说明 */}
      <div className="px-4 pt-3 pb-2">
        <div className="text-xs rounded-xl px-3 py-2" style={{ background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.2)', color: 'rgba(220,185,60,0.7)' }}>
          总权重 = 资源权重 × 资金权重，默认均为 1.0，总权重 = 1.0。点击成员可修改。
        </div>
      </div>

      {/* 搜索框 */}
      <div className="px-4 pb-3">
        <input
          type="text"
          placeholder="搜索成员姓名..."
          value={keyword}
          onChange={e => setKeyword(e.target.value)}
          className="w-full rounded-xl px-4 py-2.5 text-sm"
          style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.3)', color: '#fff', outline: 'none' }}
        />
      </div>

      {/* 状态提示 */}
      {isLoading && (
        <div className="text-center py-10 text-sm" style={{ color: 'rgba(220,185,60,0.5)' }}>加载中...</div>
      )}
      {!isLoading && error && (
        <div className="text-center py-10 text-sm" style={{ color: '#ff6b6b' }}>
          加载失败：{error.message}
        </div>
      )}

      {/* 成员列表 */}
      {!isLoading && !error && (
        <div className="px-4" style={{ paddingBottom: selected ? '0' : '40px' }}>
          {list.length === 0 && (
            <div className="text-center py-10 text-sm" style={{ color: 'rgba(220,185,60,0.45)' }}>
              {keyword ? '未找到匹配成员' : '暂无成员'}
            </div>
          )}
          {list.map((m: Member) => {
            const isSel = selected?.userId === m.userId;
            return (
              <div
                key={m.userId}
                onClick={() => handleSelect(m)}
                className="flex items-center justify-between rounded-2xl px-4 py-3 mb-2"
                style={{
                  background: isSel ? 'rgba(201,168,76,0.15)' : '#000',
                  border: isSel ? '1px solid rgba(201,168,76,0.7)' : '1px solid rgba(201,168,76,0.22)',
                  cursor: 'pointer',
                }}
              >
                <div className="flex items-center gap-3">
                  {m.avatar ? (
                    <img src={m.avatar} alt="" className="w-9 h-9 rounded-full object-cover" style={{ border: '1px solid rgba(201,168,76,0.4)' }} />
                  ) : (
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: 'rgba(201,168,76,0.2)', color: '#D4A830', border: '1px solid rgba(201,168,76,0.4)' }}>
                      {m.name.slice(0, 1)}
                    </div>
                  )}
                  <div>
                    <div className="text-sm font-medium">{m.name}</div>
                    <div className="text-[11px] mt-0.5" style={{ color: 'rgba(220,185,60,0.5)' }}>
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
      )}

      {/* 权重编辑区（选中成员后出现） */}
      {selected && (
        <div className="px-4 pb-10 mt-1">
          <div className="rounded-2xl px-4 pt-4 pb-5" style={{ background: '#0A0A00', border: '1px solid rgba(201,168,76,0.45)' }}>

            {/* 标题行 */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                {selected.avatar ? (
                  <img src={selected.avatar} alt="" className="w-7 h-7 rounded-full object-cover" style={{ border: '1px solid rgba(201,168,76,0.4)' }} />
                ) : (
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: 'rgba(201,168,76,0.2)', color: '#D4A830' }}>
                    {selected.name.slice(0, 1)}
                  </div>
                )}
                <span className="text-sm font-semibold" style={{ color: '#D4A830' }}>
                  设置 {selected.name} 的权重
                </span>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="text-xs px-2 py-1 rounded-full"
                style={{ border: '1px solid rgba(201,168,76,0.3)', color: 'rgba(220,185,60,0.5)', background: 'transparent' }}
              >
                收起
              </button>
            </div>

            {/* 三列：资源权重 × 资金权重 = 总权重预览 */}
            <div className="flex gap-2 mb-4 items-end">
              <div className="flex-1">
                <label className="text-xs block mb-1" style={{ color: 'rgba(220,185,60,0.65)' }}>资源权重</label>
                <input
                  type="number" step="0.1" min="0"
                  value={resInput}
                  onChange={e => setResInput(e.target.value)}
                  className="w-full rounded-xl px-3 py-2 text-sm text-center"
                  style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.35)', color: '#fff', outline: 'none' }}
                />
              </div>
              <div className="pb-2 text-sm" style={{ color: 'rgba(220,185,60,0.5)' }}>×</div>
              <div className="flex-1">
                <label className="text-xs block mb-1" style={{ color: 'rgba(220,185,60,0.65)' }}>资金权重</label>
                <input
                  type="number" step="0.1" min="0"
                  value={capInput}
                  onChange={e => setCapInput(e.target.value)}
                  className="w-full rounded-xl px-3 py-2 text-sm text-center"
                  style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.35)', color: '#fff', outline: 'none' }}
                />
              </div>
              <div className="pb-2 text-sm" style={{ color: 'rgba(220,185,60,0.5)' }}>=</div>
              <div className="flex-1">
                <label className="text-xs block mb-1" style={{ color: 'rgba(220,185,60,0.65)' }}>总权重</label>
                <div className="w-full rounded-xl px-3 py-2 text-sm text-center font-bold" style={{ background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.2)', color: '#FFE566' }}>
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
          </div>
        </div>
      )}
    </div>
  );
}
