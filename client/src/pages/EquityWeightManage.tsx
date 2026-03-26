import { useState, useMemo } from 'react';
import { useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';

interface WeightUser {
  userId: number;
  name: string;
  avatar?: string;
  resourceWeight: number;
  capitalWeight: number;
  totalWeight: number;
}

export default function EquityWeightManage() {
  const [, setLocation] = useLocation();
  const ledgerId = 59;

  const [searchKeyword, setSearchKeyword] = useState('');
  const [selectedUser, setSelectedUser] = useState<WeightUser | null>(null);
  const [editResource, setEditResource] = useState('');
  const [editCapital, setEditCapital] = useState('');
  const [saveMsg, setSaveMsg] = useState('');

  const { data: weightList, isLoading, refetch } = trpc.equity.getAllWeights.useQuery({ ledgerId });

  const setWeightMutation = trpc.equity.setUserWeight.useMutation({
    onSuccess: () => {
      refetch();
      setSaveMsg('保存成功');
      setTimeout(() => setSaveMsg(''), 2000);
    },
    onError: (e) => {
      setSaveMsg('保存失败：' + e.message);
    },
  });

  // 本地搜索过滤
  const filteredList = useMemo(() => {
    if (!weightList) return [];
    const kw = searchKeyword.trim().toLowerCase();
    if (!kw) return weightList as WeightUser[];
    return (weightList as WeightUser[]).filter(u =>
      u.name.toLowerCase().includes(kw)
    );
  }, [weightList, searchKeyword]);

  const selectUser = (u: WeightUser) => {
    setSelectedUser(u);
    setEditResource(u.resourceWeight.toFixed(2));
    setEditCapital(u.capitalWeight.toFixed(2));
    setSaveMsg('');
  };

  const handleSave = () => {
    if (!selectedUser) return;
    const r = parseFloat(editResource);
    const c = parseFloat(editCapital);
    if (isNaN(r) || isNaN(c) || r < 0 || c < 0) {
      setSaveMsg('请输入有效的权重数值（如 1.0、0.5）');
      return;
    }
    setWeightMutation.mutate({
      userId: selectedUser.userId,
      resourceWeight: r,
      capitalWeight: c,
    });
  };

  const previewTotal = () => {
    const r = parseFloat(editResource || '1');
    const c = parseFloat(editCapital || '1');
    if (isNaN(r) || isNaN(c)) return '—';
    return (r * c).toFixed(4);
  };

  return (
    <div style={{ background: 'linear-gradient(160deg, #0D0D00 0%, #1A1600 40%, #0D0D00 100%)', minHeight: '100vh', color: '#fff' }}>
      {/* 顶部导航 */}
      <div className="flex items-center px-4 py-3" style={{ borderBottom: '1px solid rgba(201,168,76,0.3)' }}>
        <button
          onClick={() => setLocation(`/ledger/${ledgerId}/settings`)}
          className="text-sm px-3 py-1 rounded-full mr-3"
          style={{ border: '1px solid rgba(201,168,76,0.5)', color: '#D4A830', background: 'transparent' }}
        >
          返回
        </button>
        <span className="text-base font-semibold" style={{ color: '#D4A830' }}>权重管理</span>
        {weightList && (
          <span className="ml-2 text-xs" style={{ color: 'rgba(220,185,60,0.5)' }}>共 {weightList.length} 人</span>
        )}
      </div>

      {/* 说明 */}
      <div className="px-4 pt-3 pb-2">
        <div className="text-xs rounded-xl px-3 py-2" style={{ background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.2)', color: 'rgba(220,185,60,0.7)' }}>
          总权重 = 资源权重 × 资金权重，默认 1.0 × 1.0 = 1.0（不加权）。点击成员可修改其权重。
        </div>
      </div>

      {/* 搜索框 */}
      <div className="px-4 pb-3">
        <input
          type="text"
          placeholder="搜索成员姓名..."
          value={searchKeyword}
          onChange={e => setSearchKeyword(e.target.value)}
          className="w-full rounded-xl px-4 py-2.5 text-sm"
          style={{
            background: 'rgba(201,168,76,0.08)',
            border: '1px solid rgba(201,168,76,0.3)',
            color: '#fff',
            outline: 'none',
          }}
        />
      </div>

      {/* 成员列表 */}
      <div className="px-4" style={{ paddingBottom: selectedUser ? '0' : '32px' }}>
        {isLoading && (
          <div className="text-center py-10" style={{ color: 'rgba(220,185,60,0.5)' }}>加载中...</div>
        )}
        {!isLoading && filteredList.length === 0 && (
          <div className="text-center py-10" style={{ color: 'rgba(220,185,60,0.5)' }}>
            {searchKeyword ? '未找到匹配成员' : '暂无成员'}
          </div>
        )}
        {filteredList.map((u: WeightUser) => {
          const isSelected = selectedUser?.userId === u.userId;
          return (
            <div
              key={u.userId}
              onClick={() => selectUser(u)}
              className="flex items-center justify-between rounded-2xl px-4 py-3 mb-2"
              style={{
                background: isSelected ? 'rgba(201,168,76,0.15)' : '#000',
                border: isSelected
                  ? '1px solid rgba(201,168,76,0.7)'
                  : '1px solid rgba(201,168,76,0.25)',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              <div className="flex items-center gap-3">
                {u.avatar ? (
                  <img src={u.avatar} alt="" className="w-9 h-9 rounded-full object-cover" style={{ border: '1px solid rgba(201,168,76,0.4)' }} />
                ) : (
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: 'rgba(201,168,76,0.2)', color: '#D4A830', border: '1px solid rgba(201,168,76,0.4)' }}>
                    {u.name.slice(0, 1)}
                  </div>
                )}
                <div>
                  <div className="text-sm font-medium" style={{ color: '#fff' }}>{u.name}</div>
                  <div className="text-[11px] mt-0.5" style={{ color: 'rgba(220,185,60,0.55)' }}>
                    资源 {u.resourceWeight.toFixed(2)} × 资金 {u.capitalWeight.toFixed(2)}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold" style={{ background: 'linear-gradient(180deg, #FFE566 0%, #C8920A 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                  {u.totalWeight.toFixed(2)}
                </div>
                <div className="text-[10px]" style={{ color: 'rgba(220,185,60,0.45)' }}>总权重</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 权重编辑区（选中成员后展示在底部） */}
      {selectedUser && (
        <div className="px-4 pb-8 mt-2">
          <div
            className="rounded-2xl px-4 pt-4 pb-5"
            style={{ background: '#0A0A00', border: '1px solid rgba(201,168,76,0.45)' }}
          >
            {/* 标题行 */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                {selectedUser.avatar ? (
                  <img src={selectedUser.avatar} alt="" className="w-7 h-7 rounded-full object-cover" style={{ border: '1px solid rgba(201,168,76,0.4)' }} />
                ) : (
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: 'rgba(201,168,76,0.2)', color: '#D4A830' }}>
                    {selectedUser.name.slice(0, 1)}
                  </div>
                )}
                <span className="text-sm font-semibold" style={{ color: '#D4A830' }}>{selectedUser.name}</span>
              </div>
              <button
                onClick={() => setSelectedUser(null)}
                className="text-xs px-2 py-1 rounded-full"
                style={{ border: '1px solid rgba(201,168,76,0.3)', color: 'rgba(220,185,60,0.5)', background: 'transparent' }}
              >
                收起
              </button>
            </div>

            {/* 两列输入 */}
            <div className="flex gap-3 mb-3">
              <div className="flex-1">
                <label className="text-xs block mb-1" style={{ color: 'rgba(220,185,60,0.65)' }}>资源权重</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={editResource}
                  onChange={e => setEditResource(e.target.value)}
                  className="w-full rounded-xl px-3 py-2 text-sm text-center"
                  style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.35)', color: '#fff', outline: 'none' }}
                />
              </div>
              <div className="flex items-end pb-2 text-sm" style={{ color: 'rgba(220,185,60,0.5)' }}>×</div>
              <div className="flex-1">
                <label className="text-xs block mb-1" style={{ color: 'rgba(220,185,60,0.65)' }}>资金权重</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={editCapital}
                  onChange={e => setEditCapital(e.target.value)}
                  className="w-full rounded-xl px-3 py-2 text-sm text-center"
                  style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.35)', color: '#fff', outline: 'none' }}
                />
              </div>
              <div className="flex items-end pb-2 text-sm" style={{ color: 'rgba(220,185,60,0.5)' }}>=</div>
              <div className="flex-1">
                <label className="text-xs block mb-1" style={{ color: 'rgba(220,185,60,0.65)' }}>总权重预览</label>
                <div className="w-full rounded-xl px-3 py-2 text-sm text-center font-bold" style={{ background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.2)', color: '#FFE566' }}>
                  {previewTotal()}
                </div>
              </div>
            </div>

            {saveMsg && (
              <div className="text-xs mb-2 text-center" style={{ color: saveMsg.includes('成功') ? '#4ade80' : '#ff6b6b' }}>
                {saveMsg}
              </div>
            )}

            <button
              onClick={handleSave}
              disabled={setWeightMutation.isPending}
              className="w-full py-2.5 rounded-full text-sm font-semibold"
              style={{ background: 'linear-gradient(135deg, #C8920A 0%, #FFE566 100%)', color: '#000' }}
            >
              {setWeightMutation.isPending ? '保存中...' : '确认保存'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
