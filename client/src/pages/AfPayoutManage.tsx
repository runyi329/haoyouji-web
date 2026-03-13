import { useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';
import { ChevronLeft, Plus, Trash2, Edit2, Check, X, AlertCircle, Users, Calculator } from 'lucide-react';

// 权益系数表：第0档×0.75，第1档÷2，第2档÷3...
const EQUITY_COEFFS = [0.75, 0.5, 0.3333, 0.25, 0.2, 0.1667, 0.1429, 0.125, 0.1111, 0.1];
const EQUITY_LABELS = ['第0档(基准)', '第1档(跌10%)', '第2档(跌20%)', '第3档(跌30%)', '第4档(跌40%)', '第5档(跌50%)', '第6档(跌60%)', '第7档(跌70%)', '第8档(跌80%)', '第9档(跌90%)'];

// 计算某档位下某拨比的赠予金额
function calcGift(invest: number, tier: number, ratio: number): number {
  const coeff = tier === 0 ? 0.75 : 1 / (tier + 1);
  return invest * 10 * coeff * 0.3 * (ratio / 100);
}

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
  // 计算示例的投入金额
  const [exampleInvest, setExampleInvest] = useState('1000');
  // 展开的档位（默认展开第0档）
  const [expandedTier, setExpandedTier] = useState<number | null>(0);

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

  const selectedMember = members.find(m => m.userId === selectedSourceUserId);

  // 获取当前下单人的上级链（含本人）
  const selectedMemberAncestorChain: number[] = (selectedMember as any)?.ancestorChain || [];
  
  // 可选受益人：只能从下单人的上级链中选择（含本人），且排除已配置的
  const availableBeneficiaries = members.filter(
    m => !configuredBeneficiaryIds.has(m.userId) && 
    (selectedMemberAncestorChain.length === 0 || selectedMemberAncestorChain.includes(m.userId))
  );

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

  const investAmount = parseFloat(exampleInvest) || 1000;

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
              <p>赠予金额 = 实际投入 × 10 × 权益系数 × 0.3 × 拨比%</p>
              <p className="text-xs text-blue-600">权益系数：第0档×0.75，第1档÷2，第2档÷3，以此类推</p>
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
                      <div className="font-medium truncate flex items-center gap-1.5">
                        {m.name || m.username}
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-normal ${
                          (m as any).generation === 1 ? 'bg-yellow-100 text-yellow-700' :
                          (m as any).generation === 2 ? 'bg-blue-100 text-blue-700' :
                          (m as any).generation === 3 ? 'bg-green-100 text-green-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          第{(m as any).generation || '?'}代
                        </span>
                      </div>
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
                        第{(m as any).generation || '?'}代 | {m.name || m.username} (@{m.username}){m.userId === selectedSourceUserId ? ' ★本人' : ''}
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

            {/* 详细计算明细（各档位） */}
            {ratios.length > 0 && (
              <div className="mx-4 mb-4 space-y-2">
                {/* 投入金额输入 */}
                <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <Calculator className="w-4 h-4 text-amber-600 flex-shrink-0" />
                  <span className="text-xs text-amber-700 font-medium">模拟投入金额：</span>
                  <input
                    type="number"
                    value={exampleInvest}
                    onChange={e => setExampleInvest(e.target.value)}
                    min="1"
                    step="100"
                    className="flex-1 border border-amber-300 rounded px-2 py-1 text-sm text-center bg-white focus:outline-none focus:ring-1 focus:ring-amber-400"
                  />
                  <span className="text-xs text-amber-700">USDT</span>
                </div>

                {/* 各档位计算明细 */}
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="bg-gray-100 px-3 py-2 text-xs font-medium text-gray-600 flex justify-between">
                    <span>档位（价格跌幅）</span>
                    <span>各受益人获赠金额</span>
                  </div>
                  {EQUITY_COEFFS.map((coeff, tier) => {
                    const isExpanded = expandedTier === tier;
                    const totalGiftThisTier = investAmount * 10 * coeff * 0.3;
                    return (
                      <div key={tier} className="border-t border-gray-100">
                        {/* 档位标题行（可点击展开） */}
                        <button
                          className={`w-full flex items-center justify-between px-3 py-2 text-xs transition-colors ${isExpanded ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                          onClick={() => setExpandedTier(isExpanded ? null : tier)}
                        >
                          <div className="flex items-center gap-2">
                            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${tier === 0 ? 'bg-green-500' : tier <= 3 ? 'bg-blue-500' : tier <= 6 ? 'bg-orange-500' : 'bg-red-500'}`}>
                              {tier}
                            </span>
                            <span className="text-gray-700 font-medium">{EQUITY_LABELS[tier]}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-gray-500">基数 {totalGiftThisTier.toFixed(2)}</span>
                            <span className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`}>▾</span>
                          </div>
                        </button>

                        {/* 展开后的详细计算 */}
                        {isExpanded && (
                          <div className="bg-blue-50 px-3 pb-2 space-y-1">
                            {/* 公式说明 */}
                            <div className="text-xs text-blue-600 py-1 border-b border-blue-100">
                              {investAmount} × 10 × {tier === 0 ? '0.75' : `1÷${tier + 1}≈${coeff.toFixed(4)}`} × 0.3 = <strong>{totalGiftThisTier.toFixed(4)} USDT</strong>
                            </div>
                            {/* 每个受益人 */}
                            {ratios.map(r => {
                              const giftAmt = calcGift(investAmount, tier, r.ratio);
                              return (
                                <div key={r.id} className="flex items-center justify-between text-xs py-0.5">
                                  <div className="flex items-center gap-1.5">
                                    <div className="w-5 h-5 rounded-full bg-gradient-to-br from-green-400 to-teal-500 flex items-center justify-center text-white text-xs font-bold">
                                      {(r.name || r.username || '?')[0].toUpperCase()}
                                    </div>
                                    <span className="text-gray-700">{r.name || r.username}</span>
                                    <span className="text-gray-400">×{r.ratio}%</span>
                                  </div>
                                  <span className="font-bold text-green-700">+{giftAmt.toFixed(2)} USDT</span>
                                </div>
                              );
                            })}
                            {/* 合计 */}
                            <div className="flex justify-between text-xs pt-1 border-t border-blue-100 font-medium">
                              <span className="text-blue-700">合计赠出</span>
                              <span className="text-blue-700">{(totalGiftThisTier * totalRatio / 100).toFixed(2)} USDT</span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
