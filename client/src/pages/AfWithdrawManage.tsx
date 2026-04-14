import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const STATUS_LABEL: Record<string, { text: string; color: string; bg: string }> = {
  pending: { text: "待处理", color: "#d97706", bg: "#fef3c7" },
  processing: { text: "处理中", color: "#2563eb", bg: "#dbeafe" },
  completed: { text: "已完成", color: "#059669", bg: "#d1fae5" },
  rejected: { text: "已拒绝", color: "#dc2626", bg: "#fee2e2" },
  cancelled: { text: "已取消", color: "#6b7280", bg: "#f3f4f6" },
};

const SCOPE_LABEL: Record<string, string> = {
  global: "全局默认",
  user: "指定用户",
  user_and_downlines: "用户及下线",
};

export default function AfWithdrawManage() {
  const { id: ledgerIdStr } = useParams<{ id: string }>();
  const ledgerId = Number(ledgerIdStr) || 52;
  const [, setLocation] = useLocation();

  const [activeTab, setActiveTab] = useState<"orders" | "fees">("orders");
  const [statusFilter, setStatusFilter] = useState<string>("pending");

  // 审核弹窗状态
  const [approveDialog, setApproveDialog] = useState<{ id: number; sntAmount: number; bscAddress: string } | null>(null);
  const [rejectDialog, setRejectDialog] = useState<{ id: number } | null>(null);
  const [txnHash, setTxnHash] = useState("");
  const [adminNote, setAdminNote] = useState("");

  // 手续费规则弹窗
  const [feeDialog, setFeeDialog] = useState<{
    id?: number;
    scope: string;
    targetUserId: string;
    feeRate: string;
    feeFixed: string;
    minFee: string;
    maxFee: string;
    note: string;
  } | null>(null);

  const utils = trpc.useUtils();

  // 获取提现订单列表
  const { data: withdrawals = [], isLoading } = trpc.recharge.adminGetAllSntWithdrawals.useQuery({
    ledgerId,
    status: statusFilter || undefined,
    limit: 100,
  });

  // 获取手续费规则
  const { data: feeRules = [] } = trpc.recharge.adminGetFeeRules.useQuery({ ledgerId });

  // 审核通过
  const approveMutation = trpc.recharge.adminApproveSntWithdrawal.useMutation({
    onSuccess: () => {
      toast.success("已确认到账");
      setApproveDialog(null);
      setTxnHash("");
      setAdminNote("");
      utils.recharge.adminGetAllSntWithdrawals.invalidate();
    },
    onError: (e) => toast.error(e.message || "操作失败"),
  });

  // 标记处理中
  const processingMutation = trpc.recharge.adminProcessingSntWithdrawal.useMutation({
    onSuccess: () => {
      toast.success("已标记为处理中");
      utils.recharge.adminGetAllSntWithdrawals.invalidate();
    },
    onError: (e) => toast.error(e.message || "操作失败"),
  });

  // 拒绝
  const rejectMutation = trpc.recharge.adminRejectSntWithdrawal.useMutation({
    onSuccess: () => {
      toast.success("已拒绝并退款");
      setRejectDialog(null);
      setAdminNote("");
      utils.recharge.adminGetAllSntWithdrawals.invalidate();
    },
    onError: (e) => toast.error(e.message || "操作失败"),
  });

  // 创建/更新手续费规则
  const upsertFeeMutation = trpc.recharge.adminUpsertFeeRule.useMutation({
    onSuccess: () => {
      toast.success("手续费规则已保存");
      setFeeDialog(null);
      utils.recharge.adminGetFeeRules.invalidate();
    },
    onError: (e) => toast.error(e.message || "保存失败"),
  });

  // 删除手续费规则
  const deleteFeeMutation = trpc.recharge.adminDeleteFeeRule.useMutation({
    onSuccess: () => {
      toast.success("规则已删除");
      utils.recharge.adminGetFeeRules.invalidate();
    },
    onError: (e) => toast.error(e.message || "删除失败"),
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard?.writeText(text).then(() => toast.success("已复制"));
  };

  const handleFeeSubmit = () => {
    if (!feeDialog) return;
    upsertFeeMutation.mutate({
      id: feeDialog.id,
      ledgerId,
      scope: feeDialog.scope as any,
      targetUserId: feeDialog.targetUserId ? Number(feeDialog.targetUserId) : null,
      feeRate: parseFloat(feeDialog.feeRate) || 0,
      feeFixed: parseFloat(feeDialog.feeFixed) || 0,
      minFee: parseFloat(feeDialog.minFee) || 0,
      maxFee: feeDialog.maxFee ? parseFloat(feeDialog.maxFee) : null,
      note: feeDialog.note,
    });
  };

  const openNewFeeDialog = () => {
    setFeeDialog({
      scope: "global",
      targetUserId: "",
      feeRate: "0",
      feeFixed: "0",
      minFee: "0",
      maxFee: "",
      note: "",
    });
  };

  const openEditFeeDialog = (rule: any) => {
    setFeeDialog({
      id: rule.id,
      scope: rule.scope,
      targetUserId: rule.targetUserId ? String(rule.targetUserId) : "",
      feeRate: String(rule.feeRate ?? 0),
      feeFixed: String(rule.feeFixed ?? 0),
      minFee: String(rule.minFee ?? 0),
      maxFee: rule.maxFee != null ? String(rule.maxFee) : "",
      note: rule.note || "",
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-10 max-w-md mx-auto">
      {/* 顶部导航 */}
      <div
        className="sticky top-0 z-10 flex items-center px-4 py-3"
        style={{ background: "linear-gradient(135deg, #A80000 0%, #7a0000 100%)" }}
      >
        <button
          onClick={() => setLocation(`/ledger/${ledgerId}/settings`)}
          className="flex items-center text-white/90 hover:text-white text-sm font-medium mr-3"
        >
          <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          返回设置
        </button>
        <span className="text-white font-semibold text-base flex-1 text-center pr-16">提现管理</span>
      </div>

      {/* Tab 切换 */}
      <div className="flex bg-white border-b border-gray-100 sticky top-[52px] z-10">
        {[
          { key: "orders", label: "提现订单" },
          { key: "fees", label: "手续费配置" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "text-red-700 border-b-2 border-red-700"
                : "text-gray-500"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 提现订单 Tab */}
      {activeTab === "orders" && (
        <div>
          {/* 状态筛选 */}
          <div className="flex gap-2 px-4 py-3 overflow-x-auto">
            {[
              { key: "", label: "全部" },
              { key: "pending", label: "待处理" },
              { key: "processing", label: "处理中" },
              { key: "completed", label: "已完成" },
              { key: "rejected", label: "已拒绝" },
            ].map((s) => (
              <button
                key={s.key}
                onClick={() => setStatusFilter(s.key)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  statusFilter === s.key
                    ? "bg-red-700 text-white"
                    : "bg-white text-gray-600 border border-gray-200"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* 订单列表 */}
          {isLoading ? (
            <div className="py-12 text-center text-sm text-gray-400">加载中...</div>
          ) : withdrawals.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-400">暂无提现申请</div>
          ) : (
            <div className="px-4 space-y-3">
              {withdrawals.map((w: any) => {
                const status = STATUS_LABEL[w.status] || { text: w.status, color: "#6b7280", bg: "#f3f4f6" };
                return (
                  <div key={w.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                    <div className="px-4 py-3 flex items-center justify-between border-b border-gray-50">
                      <div>
                        <span className="text-sm font-semibold text-gray-800">
                          {w.userName || w.username || `用户#${w.userId}`}
                        </span>
                        <span className="text-xs text-gray-400 ml-2">#{w.id}</span>
                      </div>
                      <span
                        className="text-xs font-medium px-2 py-1 rounded-full"
                        style={{ color: status.color, backgroundColor: status.bg }}
                      >
                        {status.text}
                      </span>
                    </div>

                    <div className="px-4 py-3 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">提现金额</span>
                        <span className="font-bold text-gray-800">
                          {parseFloat(w.sntAmount).toFixed(2)} USDT
                        </span>
                      </div>
                      {w.network && (
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-400">网络</span>
                          <span className="font-semibold px-2 py-0.5 rounded text-white text-[11px]"
                            style={{ backgroundColor: w.network === 'APTOS' ? '#4f46e5' : '#0d9488' }}>
                            {w.network === 'APTOS' ? 'Aptos' : w.network === 'TRC20' ? 'Tron (TRC20)' : w.network}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-400">提现地址</span>
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-gray-600 max-w-[180px] truncate">
                            {w.bscAddress}
                          </span>
                          <button
                            onClick={() => copyToClipboard(w.bscAddress)}
                            className="text-blue-400 flex-shrink-0"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          </button>
                        </div>
                      </div>
                      {w.txnHash && (
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-400">TxHash</span>
                          <span className="font-mono text-blue-500 max-w-[180px] truncate">{w.txnHash}</span>
                        </div>
                      )}
                      {w.adminNote && (
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-400">备注</span>
                          <span className="text-gray-600">{w.adminNote}</span>
                        </div>
                      )}
                      <div className="text-xs text-gray-300">
                        {w.createdAt ? new Date(w.createdAt).toLocaleString("zh-CN") : ""}
                      </div>
                    </div>

                    {/* 操作按钮 */}
                    {(w.status === "pending" || w.status === "processing") && (
                      <div className="px-4 pb-3 flex gap-2">
                        {w.status === "pending" && (
                          <button
                            onClick={() => processingMutation.mutate({ withdrawalId: w.id })}
                            className="flex-1 py-2 rounded-xl text-xs font-medium border border-blue-200 text-blue-600 bg-blue-50"
                          >
                            标记处理中
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setApproveDialog({ id: w.id, sntAmount: w.sntAmount, bscAddress: w.bscAddress });
                            setTxnHash("");
                            setAdminNote("");
                          }}
                          className="flex-1 py-2 rounded-xl text-xs font-medium bg-green-600 text-white"
                        >
                          确认到账
                        </button>
                        <button
                          onClick={() => {
                            setRejectDialog({ id: w.id });
                            setAdminNote("");
                          }}
                          className="flex-1 py-2 rounded-xl text-xs font-medium border border-red-200 text-red-600 bg-red-50"
                        >
                          拒绝退款
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 手续费配置 Tab */}
      {activeTab === "fees" && (
        <div className="px-4 pt-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-gray-700">手续费规则</span>
            <button
              onClick={openNewFeeDialog}
              className="text-xs text-white font-medium px-3 py-1.5 rounded-lg"
              style={{ background: "#A80000" }}
            >
              + 新增规则
            </button>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-xs text-amber-700">
            <strong>规则优先级：</strong>指定用户 &gt; 用户及下线 &gt; 全局默认。同一用户匹配多条规则时，优先使用最具体的规则。
          </div>

          {feeRules.length === 0 ? (
            <div className="bg-white rounded-2xl py-10 text-center text-sm text-gray-400 shadow-sm">
              暂无手续费规则（默认0手续费）
            </div>
          ) : (
            <div className="space-y-3">
              {feeRules.map((rule: any) => (
                <div key={rule.id} className="bg-white rounded-2xl shadow-sm px-4 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className="text-xs font-medium px-2 py-0.5 rounded-full"
                      style={{ background: "#fee2e2", color: "#A80000" }}
                    >
                      {SCOPE_LABEL[rule.scope] || rule.scope}
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => openEditFeeDialog(rule)}
                        className="text-xs text-blue-500"
                      >
                        编辑
                      </button>
                      <button
                        onClick={() => {
                          if (confirm("确认删除此手续费规则？")) {
                            deleteFeeMutation.mutate({ id: rule.id });
                          }
                        }}
                        className="text-xs text-red-500"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                  {rule.targetUserId && (
                    <div className="text-xs text-gray-500 mb-1">
                      目标用户ID: <span className="font-mono">{rule.targetUserId}</span>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="text-gray-500">
                      费率: <span className="font-medium text-gray-800">{(rule.feeRate * 100).toFixed(2)}%</span>
                    </div>
                    <div className="text-gray-500">
                      固定费: <span className="font-medium text-gray-800">{rule.feeFixed} USDT</span>
                    </div>
                    <div className="text-gray-500">
                      最低: <span className="font-medium text-gray-800">{rule.minFee} USDT</span>
                    </div>
                    <div className="text-gray-500">
                      最高: <span className="font-medium text-gray-800">{rule.maxFee != null ? `${rule.maxFee} USDT` : "无上限"}</span>
                    </div>
                  </div>
                  {rule.note && (
                    <div className="mt-1.5 text-xs text-gray-400">{rule.note}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 审核通过弹窗 */}
      {approveDialog && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
          <div className="bg-white w-full rounded-t-3xl p-5 max-w-md mx-auto">
            <div className="text-base font-semibold text-gray-800 mb-4">确认转账到账</div>
            <div className="bg-gray-50 rounded-xl p-3 mb-4 text-sm">
              <div className="flex justify-between mb-1">
                <span className="text-gray-500">金额</span>
                <span className="font-bold">{parseFloat(approveDialog.sntAmount as any).toFixed(2)} USDT</span>
              </div>
              <div className="text-xs text-gray-400 font-mono break-all">{approveDialog.bscAddress}</div>
            </div>
            <div className="mb-3">
              <label className="text-xs text-gray-500 mb-1 block">交易哈希（TxHash，可选）</label>
              <input
                type="text"
                value={txnHash}
                onChange={(e) => setTxnHash(e.target.value)}
                placeholder="0x..."
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono outline-none focus:border-red-300"
              />
            </div>
            <div className="mb-4">
              <label className="text-xs text-gray-500 mb-1 block">备注（可选）</label>
              <input
                type="text"
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
                placeholder="转账备注..."
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-red-300"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setApproveDialog(null)}
                className="flex-1 py-3 rounded-2xl border border-gray-200 text-sm text-gray-600"
              >
                取消
              </button>
              <button
                onClick={() =>
                  approveMutation.mutate({
                    withdrawalId: approveDialog.id,
                    txnHash: txnHash || undefined,
                    adminNote: adminNote || undefined,
                  })
                }
                disabled={approveMutation.isPending}
                className="flex-1 py-3 rounded-2xl text-sm text-white font-semibold"
                style={{ background: "#059669" }}
              >
                {approveMutation.isPending ? "处理中..." : "确认到账"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 拒绝弹窗 */}
      {rejectDialog && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
          <div className="bg-white w-full rounded-t-3xl p-5 max-w-md mx-auto">
            <div className="text-base font-semibold text-gray-800 mb-4">拒绝提现申请</div>
            <div className="mb-4">
              <label className="text-xs text-gray-500 mb-1 block">拒绝原因（必填）</label>
              <textarea
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
                placeholder="请填写拒绝原因，将显示给用户..."
                rows={3}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-red-300 resize-none"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setRejectDialog(null)}
                className="flex-1 py-3 rounded-2xl border border-gray-200 text-sm text-gray-600"
              >
                取消
              </button>
              <button
                onClick={() =>
                  rejectMutation.mutate({
                    withdrawalId: rejectDialog.id,
                    adminNote: adminNote || "申请被拒绝",
                  })
                }
                disabled={rejectMutation.isPending || !adminNote.trim()}
                className="flex-1 py-3 rounded-2xl text-sm text-white font-semibold disabled:opacity-50"
                style={{ background: "#dc2626" }}
              >
                {rejectMutation.isPending ? "处理中..." : "确认拒绝"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 手续费规则编辑弹窗 */}
      {feeDialog && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
          <div className="bg-white w-full rounded-t-3xl p-5 max-w-md mx-auto max-h-[85vh] overflow-y-auto">
            <div className="text-base font-semibold text-gray-800 mb-4">
              {feeDialog.id ? "编辑手续费规则" : "新增手续费规则"}
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">适用范围</label>
                <select
                  value={feeDialog.scope}
                  onChange={(e) => setFeeDialog({ ...feeDialog, scope: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none"
                >
                  <option value="global">全局默认（所有用户）</option>
                  <option value="user">指定用户</option>
                  <option value="user_and_downlines">指定用户及其下线</option>
                </select>
              </div>

              {(feeDialog.scope === "user" || feeDialog.scope === "user_and_downlines") && (
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">目标用户ID</label>
                  <input
                    type="number"
                    value={feeDialog.targetUserId}
                    onChange={(e) => setFeeDialog({ ...feeDialog, targetUserId: e.target.value })}
                    placeholder="输入用户ID"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">费率（0~1，如0.01=1%）</label>
                  <input
                    type="number"
                    value={feeDialog.feeRate}
                    onChange={(e) => setFeeDialog({ ...feeDialog, feeRate: e.target.value })}
                    step="0.001"
                    min="0"
                    max="1"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">固定费（USDT）</label>
                  <input
                    type="number"
                    value={feeDialog.feeFixed}
                    onChange={(e) => setFeeDialog({ ...feeDialog, feeFixed: e.target.value })}
                    step="0.1"
                    min="0"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">最低手续费（USDT）</label>
                  <input
                    type="number"
                    value={feeDialog.minFee}
                    onChange={(e) => setFeeDialog({ ...feeDialog, minFee: e.target.value })}
                    step="0.1"
                    min="0"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">最高手续费（空=无上限）</label>
                  <input
                    type="number"
                    value={feeDialog.maxFee}
                    onChange={(e) => setFeeDialog({ ...feeDialog, maxFee: e.target.value })}
                    step="0.1"
                    min="0"
                    placeholder="无上限"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-1 block">备注说明</label>
                <input
                  type="text"
                  value={feeDialog.note}
                  onChange={(e) => setFeeDialog({ ...feeDialog, note: e.target.value })}
                  placeholder="规则说明..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setFeeDialog(null)}
                className="flex-1 py-3 rounded-2xl border border-gray-200 text-sm text-gray-600"
              >
                取消
              </button>
              <button
                onClick={handleFeeSubmit}
                disabled={upsertFeeMutation.isPending}
                className="flex-1 py-3 rounded-2xl text-sm text-white font-semibold disabled:opacity-50"
                style={{ background: "#A80000" }}
              >
                {upsertFeeMutation.isPending ? "保存中..." : "保存规则"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
