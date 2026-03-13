import { useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';
import { ChevronLeft, Plus, Trash2, Edit2, Check, X, AlertCircle, Users } from 'lucide-react';

export default function AfPayoutManage() {
  const { id: ledgerId } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const lid = parseInt(ledgerId || '0');

  // 选中的下单人
  const [selectedSourceUserId, setSelectedSourceUserId] = useState<number | null>(null);
  // 添加/编辑状态
  const [showAddForm, setShowAddForm] = useState(false);
  const [addBeneficiaryId, setAddBeneficiaryId] = useState<number | null>(null);
  const [addRatio, setAddRatio] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editRatio, setEditRatio] = useState('');
  const [searchKeyword, setSearchKeyword] = useState('');

  // 获取所有成员
  const { data: members = [], isLoading: membersLoading } = trpc.ledger.afGetMembersForPayout.useQuery(
    { ledgerId: lid },
    { enabled: lid > 0 }
  );

  // 获取选中下单人的拨比配置
  const { data: ratios = [], refetch: refetchRatios } = trpc.ledger.afGetPayoutRatios.useQuery(
    { ledgerId: lid, sourceUserId: selectedSourceUserId! },
    { enabled: !!selectedSourceUserId }
  );

  const setRatioMutation = trpc.ledger.afSetPayoutRatio.useMutation({
    onSuccess: () => { refetchRatios(); setShowAddForm(false); setAddBeneficiaryId(null); setAddRatio(''); setEditingId(null); setEditRatio(''); },
  });

  const deleteRatioMutation = trpc.ledger.afDeletePayoutRatio.useMutation({
    onSuccess: () => refetchRatios(),
  });

  // 过滤成员（搜索）
  const filteredMembers = members.filter(m =>
    !searchKeyword || m.username?.includes(searchKeyword) || m.name?.includes(searchKeyword)
  );

  // 计算当前拨比总和
  const totalRatio = ratios.reduce((sum, r) => sum + r.ratio, 0);
  const remaining = 100 - totalRatio;

  // 已配置受益人的userId集合
  const configuredBeneficiaryIds = new Set(ratios.map(r => r.beneficiaryUserId));

  // 可选受益人（排除已配置的和下单人自己）
  const availableBeneficiaries = members.filter(
    m => m.userId !== selectedSourceUserId && !configuredBeneficiaryIds.has(m.userId)
  );

  const selectedMember = members.find(m => m.userId === selectedSourceUserId);

  const handleSaveAdd = () => {
    if (!addBeneficiaryId || !addRatio || !selectedSourceUserId) return;
    const ratio = parseFloat(addRatio);
    if (isNaN(ratio) || ratio <= 0 || ratio > 100) { alert('请输入有效的拨比（0-100）'); return; }
    setRatioMutation.mutate({ ledgerId: lid, sourceUserId: selectedSourceUserId, beneficiaryUserId: addBeneficiaryId, ratio });
  };

  const handleSaveEdit = (id: number) => {
    if (!editRatio || !selectedSourceUserId) return;
    const ratio = parseFloat(editRatio);
    if (isNaN(ratio) || ratio <= 0 || ratio > 100) { alert('请输入有效的拨比（0-100）'); return; }
    const r = ratios.find(x => x.id === id);
    if (!r) return;
    setRatioMutation.mutate({ ledgerId: lid, sourceUserId: selectedSourceUserId, beneficiaryUserId: r.beneficiaryUserId, ratio });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <div className="bg-white border-b px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => setLocation(`/ledger/${ledgerId}/settings`)} className="p-1">
          <ChevronLeft className="w-5 h-5 text-gray-600" />
        </button>
        <h1 className="text-base font-semibold text-gray-800">拨比管理</h1>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4">
        {/* 说明卡片 */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex gap-2">
            <AlertCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-700 space-y-1">
              <p className="font-medium">拨比规则说明</p>
              <p>赠予金额 = 实际投入 × 10 × 0.3 × 拨比%</p>
              <p>每位下单人的所有上级拨比之和应等于 <strong>100%</strong></p>
              <p>只有配置了拨比的下单人，其订单成交后才会自动生成赠予订单</p>
            </div>
          </div>
        </div>

        {/* 第一步：选择下单人 */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50 flex items-center gap-2">
            <Users className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">第一步：选择下单人</span>
          </div>
          <div className="p-3">
            <input
              type="text"
              placeholder="搜索用户名或姓名..."
              value={searchKeyword}
              onChange={e => setSearchKeyword(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
            {membersLoading ? (
              <div className="text-center py-4 text-gray-400 text-sm">加载中...</div>
            ) : (
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {filteredMembers.map(m => (
                  <button
                    key={m.userId}
                    onClick={() => { setSelectedSourceUserId(m.userId); setShowAddForm(false); setEditingId(null); }}
                    className={`w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center gap-3 transition-colors ${
                      selectedSourceUserId === m.userId
                        ? 'bg-blue-50 border border-blue-300 text-blue-700'
                        : 'hover:bg-gray-50 border border-transparent'
                    }`}
                  >
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                      {(m.name || m.username || '?')[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{m.name || m.username}</div>
                      <div className="text-xs text-gray-400">@{m.username}</div>
                    </div>
                    {selectedSourceUserId === m.userId && (
                      <Check className="w-4 h-4 text-blue-500 flex-shrink-0" />
                    )}
                  </button>
                ))}
                {filteredMembers.length === 0 && (
                  <div className="text-center py-4 text-gray-400 text-sm">暂无成员</div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 第二步：配置拨比 */}
        {selectedSourceUserId && (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
              <div>
                <span className="text-sm font-medium text-gray-700">
                  {selectedMember?.name || selectedMember?.username} 的拨比配置
                </span>
                <div className={`text-xs mt-0.5 ${Math.abs(totalRatio - 100) < 0.1 ? 'text-green-600' : totalRatio > 100 ? 'text-red-500' : 'text-orange-500'}`}>
                  已分配：{totalRatio.toFixed(2)}% / 100%
                  {Math.abs(totalRatio - 100) < 0.1 && ' ✓'}
                  {totalRatio > 100 && ' ⚠ 超出100%'}
                  {totalRatio < 100 && totalRatio > 0 && ` (剩余 ${remaining.toFixed(2)}%)`}
                </div>
              </div>
              {availableBeneficiaries.length > 0 && (
                <button
                  onClick={() => setShowAddForm(true)}
                  className="flex items-center gap-1 text-xs bg-blue-500 text-white px-3 py-1.5 rounded-lg hover:bg-blue-600 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  添加受益人
                </button>
              )}
            </div>

            {/* 进度条 */}
            <div className="px-4 pt-3">
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${totalRatio > 100 ? 'bg-red-400' : Math.abs(totalRatio - 100) < 0.1 ? 'bg-green-400' : 'bg-blue-400'}`}
                  style={{ width: `${Math.min(totalRatio, 100)}%` }}
                />
              </div>
            </div>

            {/* 添加表单 */}
            {showAddForm && (
              <div className="mx-4 mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="text-xs font-medium text-blue-700 mb-2">添加受益人</div>
                <div className="space-y-2">
                  <select
                    value={addBeneficiaryId || ''}
                    onChange={e => setAddBeneficiaryId(parseInt(e.target.value))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
                  >
                    <option value="">选择受益人...</option>
                    {availableBeneficiaries.map(m => (
                      <option key={m.userId} value={m.userId}>
                        {m.name || m.username} (@{m.username})
                      </option>
                    ))}
                  </select>
                  <div className="flex gap-2 items-center">
                    <input
                      type="number"
                      placeholder={`拨比% (剩余${remaining.toFixed(1)}%)`}
                      value={addRatio}
                      onChange={e => setAddRatio(e.target.value)}
                      min="0.01"
                      max="100"
                      step="0.01"
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                    />
                    <button
                      onClick={handleSaveAdd}
                      disabled={setRatioMutation.isPending}
                      className="bg-blue-500 text-white px-3 py-2 rounded-lg text-sm hover:bg-blue-600 disabled:opacity-50 flex items-center gap-1"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => { setShowAddForm(false); setAddBeneficiaryId(null); setAddRatio(''); }}
                      className="bg-gray-200 text-gray-600 px-3 py-2 rounded-lg text-sm hover:bg-gray-300 flex items-center gap-1"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 拨比列表 */}
            <div className="p-4 space-y-2">
              {ratios.length === 0 && !showAddForm && (
                <div className="text-center py-6 text-gray-400 text-sm">
                  <div className="text-2xl mb-2">📊</div>
                  <div>暂无拨比配置</div>
                  <div className="text-xs mt-1">点击"添加受益人"开始配置</div>
                </div>
              )}
              {ratios.map(r => (
                <div key={r.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-400 to-teal-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {(r.name || r.username || '?')[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-800 truncate">{r.name || r.username}</div>
                    <div className="text-xs text-gray-400">@{r.username}</div>
                  </div>
                  {editingId === r.id ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        value={editRatio}
                        onChange={e => setEditRatio(e.target.value)}
                        min="0.01"
                        max="100"
                        step="0.01"
                        className="w-20 border border-blue-300 rounded px-2 py-1 text-sm text-center focus:outline-none"
                        autoFocus
                      />
                      <span className="text-xs text-gray-500">%</span>
                      <button onClick={() => handleSaveEdit(r.id)} className="text-green-500 hover:text-green-600 p-1">
                        <Check className="w-4 h-4" />
                      </button>
                      <button onClick={() => setEditingId(null)} className="text-gray-400 hover:text-gray-500 p-1">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className={`text-base font-bold ${r.ratio >= 50 ? 'text-green-600' : 'text-blue-600'}`}>
                        {r.ratio.toFixed(2)}%
                      </span>
                      <button
                        onClick={() => { setEditingId(r.id); setEditRatio(String(r.ratio)); }}
                        className="text-gray-400 hover:text-blue-500 p-1 transition-colors"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => { if (confirm(`确认删除 ${r.name || r.username} 的拨比配置？`)) deleteRatioMutation.mutate({ ledgerId: lid, id: r.id }); }}
                        className="text-gray-400 hover:text-red-500 p-1 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* 底部计算示例 */}
            {ratios.length > 0 && (
              <div className="mx-4 mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="text-xs font-medium text-amber-700 mb-1.5">计算示例（投入 1000 USDT）</div>
                <div className="text-xs text-amber-600 space-y-0.5">
                  <div>基数 = 1000 × 10 × 0.3 = <strong>3000 USDT</strong></div>
                  {ratios.map(r => (
                    <div key={r.id}>
                      {r.name || r.username}：3000 × {r.ratio}% = <strong>{(3000 * r.ratio / 100).toFixed(2)} USDT</strong>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
