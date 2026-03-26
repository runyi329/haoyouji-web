import { useState } from 'react';
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

  const { data: weightList, isLoading, refetch } = trpc.equity.getAllWeights.useQuery({ ledgerId });

  const setWeightMutation = trpc.equity.setUserWeight.useMutation({
    onSuccess: () => {
      refetch();
      setEditingUser(null);
    },
  });

  const [editingUser, setEditingUser] = useState<WeightUser | null>(null);
  const [editResource, setEditResource] = useState('');
  const [editCapital, setEditCapital] = useState('');
  const [saveMsg, setSaveMsg] = useState('');

  const openEdit = (u: WeightUser) => {
    setEditingUser(u);
    setEditResource(u.resourceWeight.toFixed(2));
    setEditCapital(u.capitalWeight.toFixed(2));
    setSaveMsg('');
  };

  const handleSave = () => {
    if (!editingUser) return;
    const r = parseFloat(editResource);
    const c = parseFloat(editCapital);
    if (isNaN(r) || isNaN(c) || r < 0 || c < 0) {
      setSaveMsg('请输入有效的权重数值（如 1.0、0.2）');
      return;
    }
    setWeightMutation.mutate({
      userId: editingUser.userId,
      resourceWeight: r,
      capitalWeight: c,
    });
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
      </div>

      {/* 说明 */}
      <div className="px-4 pt-3 pb-2">
        <div className="text-xs rounded-xl px-3 py-2" style={{ background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.2)', color: 'rgba(220,185,60,0.7)' }}>
          权重 = 资源权重 + 资金权重，默认各为 1.0，总权重 = 2.0。累计股权 = 原始张数 × 总权重。
        </div>
      </div>

      {/* 成员列表 */}
      <div className="px-4 pb-8">
        {isLoading && (
          <div className="text-center py-8" style={{ color: 'rgba(220,185,60,0.5)' }}>加载中...</div>
        )}
        {!isLoading && (!weightList || weightList.length === 0) && (
          <div className="text-center py-8" style={{ color: 'rgba(220,185,60,0.5)' }}>暂无股权成员</div>
        )}
        {weightList && weightList.map((u: WeightUser) => (
          <div
            key={u.userId}
            className="flex items-center justify-between rounded-2xl px-4 py-3 mb-3"
            style={{ background: '#000', border: '1px solid rgba(201,168,76,0.35)', boxShadow: '0 2px 12px rgba(0,0,0,0.6)' }}
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
                <div className="text-[11px] mt-0.5" style={{ color: 'rgba(220,185,60,0.6)' }}>
                  资源 {u.resourceWeight.toFixed(2)} + 资金 {u.capitalWeight.toFixed(2)}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-base font-bold" style={{ background: 'linear-gradient(180deg, #FFE566 0%, #C8920A 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                  {u.totalWeight.toFixed(2)}
                </div>
                <div className="text-[10px]" style={{ color: 'rgba(220,185,60,0.5)' }}>总权重</div>
              </div>
              <button
                onClick={() => openEdit(u)}
                className="text-xs px-3 py-1.5 rounded-full"
                style={{ border: '1px solid rgba(201,168,76,0.5)', color: '#D4A830', background: 'transparent' }}
              >
                编辑
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* 编辑弹窗 */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full rounded-t-3xl px-5 pt-5 pb-8" style={{ background: '#111100', border: '1px solid rgba(201,168,76,0.4)', maxWidth: 480 }}>
            <div className="text-base font-semibold mb-1" style={{ color: '#D4A830' }}>设置权重</div>
            <div className="text-xs mb-4" style={{ color: 'rgba(220,185,60,0.55)' }}>{editingUser.name}</div>

            <div className="mb-3">
              <label className="text-xs block mb-1" style={{ color: 'rgba(220,185,60,0.7)' }}>资源权重（默认 1.0）</label>
              <input
                type="number"
                step="0.1"
                min="0"
                value={editResource}
                onChange={e => setEditResource(e.target.value)}
                className="w-full rounded-xl px-3 py-2 text-sm"
                style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.35)', color: '#fff', outline: 'none' }}
              />
            </div>
            <div className="mb-3">
              <label className="text-xs block mb-1" style={{ color: 'rgba(220,185,60,0.7)' }}>资金权重（默认 1.0）</label>
              <input
                type="number"
                step="0.1"
                min="0"
                value={editCapital}
                onChange={e => setEditCapital(e.target.value)}
                className="w-full rounded-xl px-3 py-2 text-sm"
                style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.35)', color: '#fff', outline: 'none' }}
              />
            </div>

            {/* 预览 */}
            <div className="rounded-xl px-3 py-2 mb-4 text-xs" style={{ background: 'rgba(201,168,76,0.1)', color: 'rgba(220,185,60,0.8)' }}>
              总权重预览：{(parseFloat(editResource || '0') + parseFloat(editCapital || '0')).toFixed(2)}
            </div>

            {saveMsg && <div className="text-xs mb-3" style={{ color: '#ff6b6b' }}>{saveMsg}</div>}

            <div className="flex gap-3">
              <button
                onClick={() => setEditingUser(null)}
                className="flex-1 py-2.5 rounded-full text-sm"
                style={{ border: '1px solid rgba(201,168,76,0.4)', color: 'rgba(220,185,60,0.7)', background: 'transparent' }}
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={setWeightMutation.isPending}
                className="flex-1 py-2.5 rounded-full text-sm font-semibold"
                style={{ background: 'linear-gradient(135deg, #C8920A 0%, #FFE566 100%)', color: '#000' }}
              >
                {setWeightMutation.isPending ? '保存中...' : '确认保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
