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

  const [searchKeyword, setSearchKeyword] = useState('');
  const [debouncedKeyword, setDebouncedKeyword] = useState('');

  // 主列表：账本内有股权记录的成员
  const { data: weightList, isLoading, refetch } = trpc.equity.getAllWeights.useQuery({ ledgerId });

  // 搜索全站用户（仅在搜索框有内容时使用）
  const { data: searchResults, isLoading: isSearching } = trpc.equity.searchAllUsers.useQuery(
    { keyword: debouncedKeyword },
    { enabled: debouncedKeyword.trim().length > 0 }
  );

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

  // 从搜索结果打开编辑（先查该用户当前权重）
  const openEditFromSearch = (u: { userId: number; name: string; avatar?: string }) => {
    const existing = weightList?.find((w: WeightUser) => w.userId === u.userId);
    setEditingUser({
      userId: u.userId,
      name: u.name,
      avatar: u.avatar,
      resourceWeight: existing?.resourceWeight ?? 1.0,
      capitalWeight: existing?.capitalWeight ?? 1.0,
      totalWeight: existing?.totalWeight ?? 1.0,
    });
    setEditResource((existing?.resourceWeight ?? 1.0).toFixed(2));
    setEditCapital((existing?.capitalWeight ?? 1.0).toFixed(2));
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

  // 搜索防抖
  let debounceTimer: ReturnType<typeof setTimeout>;
  const handleSearchChange = (val: string) => {
    setSearchKeyword(val);
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      setDebouncedKeyword(val);
    }, 400);
  };

  const isSearchMode = debouncedKeyword.trim().length > 0;

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
          总权重 = 资源权重 × 资金权重，默认 1.0 × 1.0 = 1.0（不加权）。累计股权 = 原始张数 × 总权重。
        </div>
      </div>

      {/* 搜索框 */}
      <div className="px-4 pb-3">
        <input
          type="text"
          placeholder="搜索成员姓名或用户名..."
          value={searchKeyword}
          onChange={e => handleSearchChange(e.target.value)}
          className="w-full rounded-xl px-4 py-2.5 text-sm"
          style={{
            background: 'rgba(201,168,76,0.08)',
            border: '1px solid rgba(201,168,76,0.35)',
            color: '#fff',
            outline: 'none',
          }}
        />
        {isSearchMode && (
          <div className="text-[11px] mt-1.5 px-1" style={{ color: 'rgba(220,185,60,0.5)' }}>
            搜索全站成员，点击编辑可为其设置权重
          </div>
        )}
      </div>

      {/* 搜索结果 */}
      {isSearchMode && (
        <div className="px-4 pb-4">
          <div className="text-xs mb-2 px-1" style={{ color: 'rgba(220,185,60,0.6)' }}>搜索结果</div>
          {isSearching && (
            <div className="text-center py-4" style={{ color: 'rgba(220,185,60,0.5)' }}>搜索中...</div>
          )}
          {!isSearching && (!searchResults || searchResults.length === 0) && (
            <div className="text-center py-4" style={{ color: 'rgba(220,185,60,0.5)' }}>未找到匹配成员</div>
          )}
          {searchResults && searchResults.map((u: { userId: number; name: string; avatar?: string }) => {
            const existing = weightList?.find((w: WeightUser) => w.userId === u.userId);
            return (
              <div
                key={u.userId}
                className="flex items-center justify-between rounded-2xl px-4 py-3 mb-2"
                style={{ background: '#000', border: '1px solid rgba(201,168,76,0.25)', boxShadow: '0 2px 8px rgba(0,0,0,0.5)' }}
              >
                <div className="flex items-center gap-3">
                  {u.avatar ? (
                    <img src={u.avatar} alt="" className="w-9 h-9 rounded-full object-cover" style={{ border: '1px solid rgba(201,168,76,0.4)' }} />
                  ) : (
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: 'rgba(201,168,76,0.15)', color: '#D4A830', border: '1px solid rgba(201,168,76,0.3)' }}>
                      {u.name.slice(0, 1)}
                    </div>
                  )}
                  <div>
                    <div className="text-sm font-medium" style={{ color: '#fff' }}>{u.name}</div>
                    {existing ? (
                      <div className="text-[11px] mt-0.5" style={{ color: 'rgba(220,185,60,0.55)' }}>
                        已设置：资源 {existing.resourceWeight.toFixed(2)} × 资金 {existing.capitalWeight.toFixed(2)}
                      </div>
                    ) : (
                      <div className="text-[11px] mt-0.5" style={{ color: 'rgba(220,185,60,0.35)' }}>未设置权重（默认 1.0）</div>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => openEditFromSearch(u)}
                  className="text-xs px-3 py-1.5 rounded-full"
                  style={{ border: '1px solid rgba(201,168,76,0.5)', color: '#D4A830', background: 'transparent' }}
                >
                  {existing ? '编辑' : '设置'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* 主成员列表（非搜索模式） */}
      {!isSearchMode && (
        <div className="px-4 pb-8">
          <div className="text-xs mb-2 px-1" style={{ color: 'rgba(220,185,60,0.6)' }}>
            已有股权记录的成员（共 {weightList?.length ?? 0} 人）
          </div>
          {isLoading && (
            <div className="text-center py-8" style={{ color: 'rgba(220,185,60,0.5)' }}>加载中...</div>
          )}
          {!isLoading && (!weightList || weightList.length === 0) && (
            <div className="text-center py-8" style={{ color: 'rgba(220,185,60,0.5)' }}>
              暂无股权成员<br />
              <span className="text-[11px] mt-1 block" style={{ color: 'rgba(220,185,60,0.4)' }}>可在上方搜索框中搜索成员并设置权重</span>
            </div>
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
                    资源 {u.resourceWeight.toFixed(2)} × 资金 {u.capitalWeight.toFixed(2)}
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
      )}

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
              总权重预览：{(parseFloat(editResource || '1') * parseFloat(editCapital || '1')).toFixed(4)}
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
