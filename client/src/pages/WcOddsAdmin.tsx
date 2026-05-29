/**
 * 世界杯赔率追踪 - 管理员页面
 * 功能：查看抓取状态、手动触发抓取、横向时间轴表格展示赔率变化、订单管理
 */
import { useState, useRef, useCallback } from "react";
import { ArrowLeft, RefreshCw, Play, Info, PlusCircle, Search, X, ChevronDown } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { toast } from "sonner";

// 颜色常量
const BG = "#0D1B2A";
const BG2 = "#112236";
const BG3 = "#162C42";
const GOLD = "#FFD700";
const TEXT = "#E8EDF2";
const TEXT2 = "#8FA3B8";
const BORDER = "rgba(255,255,255,0.08)";
const COLOR_DOWN = "#FF4D4F";
const COLOR_UP = "#52C41A";
const COLOR_SAME = "#8FA3B8";

function formatTime(ts: string | null) {
  if (!ts) return "-";
  const d = new Date(ts);
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${mo}/${day} ${h}:${mi}`;
}

function formatAmount(v: string | null) {
  if (!v) return "-";
  const n = parseFloat(v);
  return isNaN(n) ? v : n.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ===================== 新建订单 Dialog =====================
function CreateOrderDialog({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [selectedTeam, setSelectedTeam] = useState<{ name: string; code: string | null } | null>(null);
  const [teamSearch, setTeamSearch] = useState("");
  const [showTeamDropdown, setShowTeamDropdown] = useState(false);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<"CNY" | "USDT">("USDT");
  const [note, setNote] = useState("");
  const [userKeyword, setUserKeyword] = useState("");
  const [selectedUser, setSelectedUser] = useState<{ id: number; name: string | null; username: string | null; phone: string | null } | null>(null);
  const [showUserDropdown, setShowUserDropdown] = useState(false);

  const { data: teamList } = trpc.wcOdds.getTeamList.useQuery(undefined, { enabled: open });

  const { data: latestOdds } = trpc.wcOdds.getLatestOddsForTeam.useQuery(
    { teamName: selectedTeam?.name ?? "" },
    { enabled: !!selectedTeam }
  );

  const { data: userResults } = trpc.wcOdds.searchUsers.useQuery(
    { keyword: userKeyword },
    { enabled: userKeyword.length >= 1 }
  );

  // 选中用户后自动拉取其钱包余额
  const { data: walletData, isLoading: walletLoading } = trpc.wcOdds.getUserWallet.useQuery(
    { userId: selectedUser?.id ?? 0 },
    { enabled: !!selectedUser }
  );

  const createOrder = trpc.wcOdds.createOrder.useMutation({
    onSuccess: () => {
      toast.success("✅ 订单创建成功，已从钱包扣款！");
      onSuccess();
      handleClose();
    },
    onError: (err) => {
      toast.error(`❌ 创建失败：${err.message}`);
    },
  });

  function handleClose() {
    setSelectedTeam(null);
    setTeamSearch("");
    setShowTeamDropdown(false);
    setAmount("");
    setCurrency("USDT");
    setNote("");
    setUserKeyword("");
    setSelectedUser(null);
    setShowUserDropdown(false);
    onClose();
  }

  const odds = latestOdds?.pinnacleOdds ? parseFloat(latestOdds.pinnacleOdds) : null;
  const amtNum = parseFloat(amount);
  const potentialReturn = odds && !isNaN(amtNum) && amtNum > 0 ? (odds * amtNum).toFixed(2) : null;

  const filteredTeams = (teamList ?? []).filter(t =>
    !teamSearch || t.teamName.includes(teamSearch)
  );

  // 当前货币可用余额
  const availableBalance = walletData
    ? (currency === "USDT" ? walletData.usdt : walletData.cny)
    : null;
  const isBalanceInsufficient = availableBalance !== null && !isNaN(amtNum) && amtNum > 0 && amtNum > availableBalance;

  function handleSubmit() {
    if (!selectedUser) return toast.error("请先选择下单人");
    if (!selectedTeam) return toast.error("请选择球队");
    if (!latestOdds?.snapshotId || !latestOdds?.pinnacleOdds) return toast.error("该球队暂无赔率数据");
    if (!amount || isNaN(amtNum) || amtNum <= 0) return toast.error("请输入有效金额");
    if (isBalanceInsufficient) return toast.error(`${currency} 余额不足`);

    createOrder.mutate({
      userId: selectedUser.id,
      teamName: selectedTeam.name,
      teamCode: selectedTeam.code ?? undefined,
      snapshotId: latestOdds.snapshotId,
      pinnacleOdds: latestOdds.pinnacleOdds,
      amount,
      currency,
      note: note || undefined,
    });
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div
        className="w-full max-w-md rounded-t-2xl pb-8"
        style={{ backgroundColor: BG2, border: `1px solid ${BORDER}`, maxHeight: "90vh", overflowY: "auto" }}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${BORDER}` }}>
          <span className="font-bold text-base" style={{ color: TEXT }}>新建订单</span>
          <button onClick={handleClose} className="w-7 h-7 flex items-center justify-center rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.08)" }}>
            <X className="w-4 h-4 text-white" />
          </button>
        </div>

        <div className="px-5 pt-4 space-y-4">
          {/* 第一步：搜索下单人 */}
          <div>
            <label className="text-xs mb-1.5 block" style={{ color: TEXT2 }}>下单人 <span style={{ color: "#ff4d4f" }}>*</span></label>
            {selectedUser ? (
              <div>
                <div
                  className="flex items-center justify-between px-3 py-2.5 rounded-lg"
                  style={{ backgroundColor: BG3, border: `1px solid ${BORDER}` }}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                      style={{ backgroundColor: "rgba(255,215,0,0.15)", color: GOLD }}>
                      {(selectedUser.name || selectedUser.username || "?").charAt(0)}
                    </div>
                    <div>
                      <span className="text-sm font-medium" style={{ color: TEXT }}>
                        {selectedUser.name || selectedUser.username || `用户#${selectedUser.id}`}
                      </span>
                      {selectedUser.phone && (
                        <span className="text-xs ml-2" style={{ color: TEXT2 }}>{selectedUser.phone}</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => { setSelectedUser(null); setUserKeyword(""); setAmount(""); }}
                    className="text-xs px-2 py-0.5 rounded"
                    style={{ backgroundColor: "rgba(255,255,255,0.08)", color: TEXT2 }}
                  >
                    更换
                  </button>
                </div>
                {/* 钱包余额展示 */}
                {walletLoading ? (
                  <div className="mt-2 text-xs" style={{ color: TEXT2 }}>加载钱包余额...</div>
                ) : walletData ? (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-xs" style={{ color: TEXT2 }}>钱包余额:</span>
                    <span
                      className="text-xs px-2 py-0.5 rounded cursor-pointer"
                      style={{
                        backgroundColor: currency === "USDT" ? "rgba(255,215,0,0.15)" : "rgba(255,255,255,0.06)",
                        color: currency === "USDT" ? GOLD : TEXT2,
                        border: currency === "USDT" ? `1px solid rgba(255,215,0,0.4)` : `1px solid ${BORDER}`,
                        fontWeight: currency === "USDT" ? 600 : 400,
                      }}
                      onClick={() => { setCurrency("USDT"); setAmount(""); }}
                    >
                      USDT {walletData.usdt.toFixed(2)}
                    </span>
                    <span
                      className="text-xs px-2 py-0.5 rounded cursor-pointer"
                      style={{
                        backgroundColor: currency === "CNY" ? "rgba(255,77,79,0.15)" : "rgba(255,255,255,0.06)",
                        color: currency === "CNY" ? "#ff4d4f" : TEXT2,
                        border: currency === "CNY" ? `1px solid rgba(255,77,79,0.4)` : `1px solid ${BORDER}`,
                        fontWeight: currency === "CNY" ? 600 : 400,
                      }}
                      onClick={() => { setCurrency("CNY"); setAmount(""); }}
                    >
                      CNY {walletData.cny.toFixed(2)}
                    </span>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="relative">
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg" style={{ backgroundColor: BG3, border: `1px solid ${BORDER}` }}>
                  <Search className="w-4 h-4 flex-shrink-0" style={{ color: TEXT2 }} />
                  <input
                    className="flex-1 bg-transparent text-sm outline-none"
                    style={{ color: TEXT }}
                    placeholder="输入姓名/用户名/手机号搜索..."
                    value={userKeyword}
                    onChange={e => { setUserKeyword(e.target.value); setShowUserDropdown(true); }}
                    onFocus={() => setShowUserDropdown(true)}
                  />
                </div>
                {showUserDropdown && userKeyword.length >= 1 && (
                  <div
                    className="absolute left-0 right-0 top-full mt-1 rounded-lg z-10 overflow-hidden"
                    style={{ backgroundColor: BG3, border: `1px solid ${BORDER}`, maxHeight: 200, overflowY: "auto" }}
                  >
                    {(userResults ?? []).length === 0 ? (
                      <div className="px-3 py-3 text-center text-sm" style={{ color: TEXT2 }}>未找到用户</div>
                    ) : (
                      (userResults ?? []).map(u => (
                        <div
                          key={u.id}
                          className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-white/5"
                          onClick={() => {
                            setSelectedUser({ id: u.id, name: u.name, username: u.username, phone: u.phone });
                            setShowUserDropdown(false);
                            setUserKeyword("");
                          }}
                        >
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                            style={{ backgroundColor: "rgba(255,215,0,0.15)", color: GOLD }}>
                            {(u.name || u.username || "?").charAt(0)}
                          </div>
                          <div>
                            <div className="text-sm" style={{ color: TEXT }}>
                              {u.name || u.username || `用户#${u.id}`}
                            </div>
                            {u.phone && <div className="text-xs" style={{ color: TEXT2 }}>{u.phone}</div>}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 第二步：选择球队 */}
          <div>
            <label className="text-xs mb-1.5 block" style={{ color: TEXT2 }}>选择球队</label>
            <div className="relative">
              <div
                className="flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer"
                style={{ backgroundColor: BG3, border: `1px solid ${BORDER}` }}
                onClick={() => setShowTeamDropdown(!showTeamDropdown)}
              >
                {selectedTeam ? (
                  <>
                    <span className="text-sm font-medium" style={{ color: TEXT }}>{selectedTeam.name}</span>
                    {selectedTeam.code && (
                      <span className="text-xs" style={{ color: TEXT2 }}>({selectedTeam.code})</span>
                    )}
                  </>
                ) : (
                  <span className="text-sm" style={{ color: TEXT2 }}>点击选择球队...</span>
                )}
                <ChevronDown className="w-4 h-4 ml-auto" style={{ color: TEXT2 }} />
              </div>
              {showTeamDropdown && (
                <div
                  className="absolute left-0 right-0 top-full mt-1 rounded-lg z-10 overflow-hidden"
                  style={{ backgroundColor: BG3, border: `1px solid ${BORDER}`, maxHeight: 220, overflowY: "auto" }}
                >
                  <div className="px-3 py-2" style={{ borderBottom: `1px solid ${BORDER}` }}>
                    <input
                      className="w-full bg-transparent text-sm outline-none"
                      style={{ color: TEXT }}
                      placeholder="搜索球队..."
                      value={teamSearch}
                      onChange={e => setTeamSearch(e.target.value)}
                      autoFocus
                    />
                  </div>
                  {filteredTeams.map((t) => (
                    <div
                      key={t.teamName}
                      className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-white/5"
                      onClick={() => {
                        setSelectedTeam({ name: t.teamName, code: t.teamCode ?? null });
                        setShowTeamDropdown(false);
                        setTeamSearch("");
                      }}
                    >
                      <span className="text-sm" style={{ color: TEXT }}>{t.teamName}</span>
                      <span className="text-xs" style={{ color: GOLD }}>
                        {t.pinnacleOdds ? `${parseFloat(t.pinnacleOdds).toFixed(2)}` : "-"}
                      </span>
                    </div>
                  ))}
                  {filteredTeams.length === 0 && (
                    <div className="px-3 py-3 text-center text-sm" style={{ color: TEXT2 }}>无匹配球队</div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 最新赔率（自动填充） */}
          {selectedTeam && (
            <div
              className="rounded-lg px-4 py-3"
              style={{ backgroundColor: "rgba(255,215,0,0.06)", border: `1px solid rgba(255,215,0,0.2)` }}
            >
              <div className="text-xs mb-1" style={{ color: TEXT2 }}>最新 Pinnacle 赔率（快照 #{latestOdds?.snapshotId ?? "-"}）</div>
              <div className="flex items-center gap-3">
                <span className="text-2xl font-bold" style={{ color: GOLD }}>
                  {odds ? odds.toFixed(2) : "暂无数据"}
                </span>
                {odds && (
                  <span className="text-xs" style={{ color: TEXT2 }}>
                    隐含概率 {(100 / odds).toFixed(1)}%
                  </span>
                )}
              </div>
              {latestOdds?.fetchedAt && (
                <div className="text-xs mt-1" style={{ color: TEXT2 }}>
                  更新于 {formatTime(latestOdds.fetchedAt)}
                </div>
              )}
            </div>
          )}

          {/* 第三步：货币选择 + 投注金额 */}
          <div>
            <label className="text-xs mb-1.5 block" style={{ color: TEXT2 }}>投注金额</label>
            <div className="flex gap-2">
              {/* 货币切换按鈕 */}
              <div className="flex rounded-lg overflow-hidden flex-shrink-0" style={{ border: `1px solid ${BORDER}` }}>
                {(["USDT", "CNY"] as const).map(c => (
                  <button
                    key={c}
                    onClick={() => { setCurrency(c); setAmount(""); }}
                    className="px-3 py-2 text-xs font-semibold transition-colors"
                    style={{
                      backgroundColor: currency === c ? GOLD : BG3,
                      color: currency === c ? "#0D1B2A" : TEXT2,
                    }}
                  >
                    {c}
                  </button>
                ))}
              </div>
              {/* 金额输入 */}
              <input
                type="number"
                min="0"
                step="0.01"
                className="flex-1 px-3 py-2.5 rounded-lg text-sm outline-none"
                style={{
                  backgroundColor: BG3,
                  border: `1px solid ${isBalanceInsufficient ? "#ff4d4f" : BORDER}`,
                  color: TEXT,
                }}
                placeholder={availableBalance !== null
                  ? `最多 ${availableBalance.toFixed(2)} ${currency}`
                  : selectedUser ? "请输入金额..." : "请先选择下单人"}
                value={amount}
                disabled={!selectedUser}
                onChange={e => setAmount(e.target.value)}
              />
            </div>
            {isBalanceInsufficient && (
              <div className="mt-1.5 text-xs" style={{ color: "#ff4d4f" }}>
                {currency} 余额不足，当前可用 {availableBalance?.toFixed(2)} {currency}
              </div>
            )}
          </div>

          {/* 潜在回报预览 */}
          {potentialReturn && (
            <div
              className="rounded-lg px-4 py-3 flex items-center justify-between"
              style={{ backgroundColor: "rgba(82,196,26,0.06)", border: `1px solid rgba(82,196,26,0.2)` }}
            >
              <span className="text-sm" style={{ color: TEXT2 }}>潜在回报</span>
              <span className="text-xl font-bold" style={{ color: COLOR_UP }}>
                {formatAmount(potentialReturn)} {currency}
              </span>
            </div>
          )}

          {/* 备注 */}
          <div>
            <label className="text-xs mb-1.5 block" style={{ color: TEXT2 }}>备注（可选）</label>
            <textarea
              className="w-full px-3 py-2.5 rounded-lg text-sm outline-none resize-none"
              style={{ backgroundColor: BG3, border: `1px solid ${BORDER}`, color: TEXT }}
              placeholder="备注信息..."
              rows={2}
              value={note}
              onChange={e => setNote(e.target.value)}
            />
          </div>

          {/* 确认按钮 */}
          <button
            onClick={handleSubmit}
            disabled={createOrder.isPending}
            className="w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2"
            style={{
              backgroundColor: createOrder.isPending ? "rgba(255,215,0,0.3)" : GOLD,
              color: "#0D1B2A",
            }}
          >
            {createOrder.isPending ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <PlusCircle className="w-4 h-4" />
            )}
            {createOrder.isPending ? "提交中..." : "确认下单"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ===================== 二次确认 Dialog =====================
type ConfirmAction = {
  orderId: number;
  newStatus: "pending" | "won" | "lost" | "revoked" | "deleted";
  title: string;
  desc: string;
  confirmText: string;
  confirmColor: string;
  needBonus?: boolean; // won 时需要填奖金
};

function ConfirmDialog({
  action,
  onConfirm,
  onCancel,
  isPending,
}: {
  action: ConfirmAction | null;
  onConfirm: (bonusAmount?: string) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [bonusInput, setBonusInput] = useState("");
  if (!action) return null;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center px-4"
      style={{ backgroundColor: "rgba(0,0,0,0.75)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-5"
        style={{ backgroundColor: BG2, border: `1px solid ${BORDER}` }}
      >
        <div className="text-base font-bold mb-1" style={{ color: TEXT }}>{action.title}</div>
        <div className="text-sm mb-4" style={{ color: TEXT2 }}>{action.desc}</div>
        {action.needBonus && (
          <div className="mb-4">
            <label className="text-xs mb-1.5 block" style={{ color: TEXT2 }}>实际奖金金额 <span style={{ color: "#ff4d4f" }}>*</span></label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
              style={{ backgroundColor: BG3, border: `1px solid ${BORDER}`, color: TEXT }}
              placeholder="请输入实际到账奖金..."
              value={bonusInput}
              onChange={e => setBonusInput(e.target.value)}
              autoFocus
            />
          </div>
        )}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium"
            style={{ backgroundColor: "rgba(255,255,255,0.06)", border: `1px solid ${BORDER}`, color: TEXT2 }}
          >
            取消
          </button>
          <button
            onClick={() => onConfirm(action.needBonus ? bonusInput : undefined)}
            disabled={isPending || (action.needBonus ? !bonusInput || isNaN(parseFloat(bonusInput)) : false)}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
            style={{ backgroundColor: action.confirmColor, color: "#0D1B2A", opacity: isPending ? 0.6 : 1 }}
          >
            {isPending ? "处理中..." : action.confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

// ===================== 订单列表 =====================
function OrdersTab() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "won" | "lost" | "revoked" | "deleted">("all");
  const [page, setPage] = useState(1);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);

  const { data, isLoading, refetch } = trpc.wcOdds.getOrders.useQuery({
    page,
    pageSize: 20,
    status: statusFilter,
  });

  const updateStatus = trpc.wcOdds.updateOrderStatus.useMutation({
    onSuccess: () => {
      toast.success("✅ 状态已更新");
      setConfirmAction(null);
      refetch();
    },
    onError: (err) => {
      toast.error(`❌ 更新失败：${err.message}`);
    },
  });

  const orders = data?.orders ?? [];

  const statusLabel: Record<string, { text: string; color: string; emoji: string }> = {
    pending:  { text: "进行中",  color: "#FFD700", emoji: "⏳" },
    won:      { text: "中奖",    color: "#52C41A", emoji: "🏆" },
    lost:     { text: "未中",    color: "#FF4D4F", emoji: "❌" },
    revoked:  { text: "已撤销",  color: "#8FA3B8", emoji: "↩️" },
    deleted:  { text: "已删除",  color: "#555",    emoji: "🗑️" },
  };

  // 根据当前状态决定可用操作
  function getActions(status: string): ConfirmAction[] {
    const id = 0; // placeholder, will be replaced
    switch (status) {
      case "pending": return [
        { orderId: id, newStatus: "won",     title: "确认中奖？",   desc: "请填写实际奖金金额，确认后记录中奖结果。可随时撤回。", confirmText: "确认中奖", confirmColor: "#52C41A", needBonus: true },
        { orderId: id, newStatus: "lost",    title: "确认未中？",   desc: "标记为未中（赔注），可随时撤回恢复进行中。",           confirmText: "确认未中", confirmColor: "#FF4D4F" },
        { orderId: id, newStatus: "revoked", title: "确认撤销订单？", desc: "撤销后可随时恢复为进行中，不影响钱包余额。",          confirmText: "确认撤销", confirmColor: "#8FA3B8" },
        { orderId: id, newStatus: "deleted", title: "确认删除订单？", desc: "软删除，订单将从默认列表隐藏，可在[已删除]筛选中恢复。", confirmText: "确认删除", confirmColor: "#555" },
      ];
      case "won": return [
        { orderId: id, newStatus: "pending", title: "撤回中奖结算？", desc: "将订单恢复为进行中，清除奖金记录。", confirmText: "确认撤回", confirmColor: GOLD },
        { orderId: id, newStatus: "deleted", title: "确认删除订单？", desc: "软删除，可在[已删除]筛选中恢复。",    confirmText: "确认删除", confirmColor: "#555" },
      ];
      case "lost": return [
        { orderId: id, newStatus: "pending", title: "撤回未中结算？", desc: "将订单恢复为进行中。",            confirmText: "确认撤回", confirmColor: GOLD },
        { orderId: id, newStatus: "deleted", title: "确认删除订单？", desc: "软删除，可在[已删除]筛选中恢复。", confirmText: "确认删除", confirmColor: "#555" },
      ];
      case "revoked": return [
        { orderId: id, newStatus: "pending", title: "恢复为进行中？", desc: "将已撤销订单重新激活为进行中。",   confirmText: "确认恢复", confirmColor: GOLD },
                { orderId: id, newStatus: "deleted", title: "确认删除订单？", desc: "软删除，可在[已删除]筛选中恢复。", confirmText: "确认删除", confirmColor: "#555" },
      ];
      case "deleted": return [
        { orderId: id, newStatus: "pending", title: "从回收站恢复？", desc: "将订单恢复为进行中状态。", confirmText: "确认恢复", confirmColor: GOLD },
      ];
      default: return [];
    }
  }

  return (
    <div className="px-4 pb-6">
      {/* 二次确认 Dialog */}
      <ConfirmDialog
        action={confirmAction}
        onConfirm={(bonus) => {
          if (!confirmAction) return;
          updateStatus.mutate({ orderId: confirmAction.orderId, status: confirmAction.newStatus, bonusAmount: bonus });
        }}
        onCancel={() => setConfirmAction(null)}
        isPending={updateStatus.isPending}
      />
      {/* 顶部操作栏 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex gap-1.5 flex-wrap">
          {(["all", "pending", "won", "lost", "revoked", "deleted"] as const).map(s => (
            <button
              key={s}
              onClick={() => { setStatusFilter(s); setPage(1); }}
              className="px-2.5 py-1 rounded-full text-xs font-medium"
              style={{
                backgroundColor: statusFilter === s ? "rgba(255,215,0,0.15)" : "rgba(255,255,255,0.05)",
                border: `1px solid ${statusFilter === s ? GOLD : BORDER}`,
                color: statusFilter === s ? GOLD : TEXT2,
              }}
            >
              {s === "all" ? "全部" : (statusLabel[s]?.emoji + " " + statusLabel[s]?.text)}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowCreateDialog(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
          style={{ backgroundColor: GOLD, color: "#0D1B2A" }}
        >
          <PlusCircle className="w-3.5 h-3.5" />
          新建订单
        </button>
      </div>

      {/* 订单列表 */}
      {isLoading ? (
        <div className="text-center py-8" style={{ color: TEXT2 }}>加载中...</div>
      ) : orders.length === 0 ? (
        <div
          className="rounded-xl p-8 text-center"
          style={{ backgroundColor: BG3, border: `1px solid ${BORDER}` }}
        >
          <div style={{ color: TEXT2 }} className="text-sm">暂无订单</div>
          <div style={{ color: TEXT2 }} className="text-xs mt-1">点击右上角"新建订单"创建第一笔</div>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => {
            const sl = statusLabel[order.status] ?? { text: order.status, color: TEXT2 };
            const displayName = order.userName || order.userUsername || `用户#${order.userId}`;
            return (
              <div
                key={order.id}
                className="rounded-xl p-4"
                style={{ backgroundColor: BG3, border: `1px solid ${BORDER}` }}
              >
                {/* 顶行：球队 + 状态 */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-base" style={{ color: TEXT }}>{order.teamName}</span>
                    {order.teamCode && (
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: "rgba(255,255,255,0.06)", color: TEXT2 }}>
                        {order.teamCode}
                      </span>
                    )}
                  </div>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ backgroundColor: `${sl.color}20`, color: sl.color, border: `1px solid ${sl.color}40` }}
                  >
                    {sl.text}
                  </span>
                </div>

                {/* 金额行 */}
                <div className="flex items-center gap-4 mb-2">
                  <div>
                    <div className="text-xs mb-0.5" style={{ color: TEXT2 }}>赔率</div>
                    <div className="font-bold" style={{ color: GOLD }}>
                      {order.pinnacleOdds ? parseFloat(order.pinnacleOdds).toFixed(2) : "-"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs mb-0.5" style={{ color: TEXT2 }}>投注</div>
                    <div className="font-bold" style={{ color: TEXT }}>
                      {formatAmount(order.amount)}
                      <span className="text-xs ml-0.5" style={{ color: TEXT2 }}>{(order as any).currency || "USDT"}</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs mb-0.5" style={{ color: TEXT2 }}>潜在回报</div>
                    <div className="font-bold" style={{ color: COLOR_UP }}>
                      {formatAmount(order.potentialReturn)}
                      <span className="text-xs ml-0.5" style={{ color: COLOR_UP }}>{(order as any).currency || "USDT"}</span>
                    </div>
                  </div>
                </div>

                {/* 下单人 + 时间 */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{ backgroundColor: "rgba(255,215,0,0.15)", color: GOLD }}>
                      {displayName.charAt(0)}
                    </div>
                    <span className="text-xs" style={{ color: TEXT2 }}>{displayName}</span>
                    {order.userPhone && (
                      <span className="text-xs" style={{ color: TEXT2 }}>· {order.userPhone}</span>
                    )}
                  </div>
                  <span className="text-xs" style={{ color: TEXT2 }}>{formatTime(order.createdAt)}</span>
                </div>

                {/* 备注 */}
                {order.note && (
                  <div className="mt-2 text-xs px-2 py-1 rounded" style={{ backgroundColor: "rgba(255,255,255,0.04)", color: TEXT2 }}>
                    备注：{order.note}
                  </div>
                )}

                {/* 中奖奖金显示 */}
                {order.status === "won" && (order as any).bonusAmount && (
                  <div
                    className="mt-2 flex items-center justify-between px-3 py-2 rounded-lg"
                    style={{ backgroundColor: "rgba(82,196,26,0.08)", border: "1px solid rgba(82,196,26,0.25)" }}
                  >
                    <span className="text-xs" style={{ color: COLOR_UP }}>🏆 实际奖金</span>
                    <span className="font-bold text-sm" style={{ color: COLOR_UP }}>
                      {formatAmount((order as any).bonusAmount)}
                      <span className="text-xs ml-0.5">{(order as any).currency || "USDT"}</span>
                    </span>
                  </div>
                )}

                {/* 结算时间 */}
                {(order.status === "won" || order.status === "lost") && order.settledAt && (
                  <div className="mt-1 text-xs" style={{ color: TEXT2 }}>
                    结算于 {formatTime(order.settledAt)}
                  </div>
                )}

                {/* 状态操作按钮（全部通过二次确认） */}
                {(() => {
                  const actions = getActions(order.status).map(a => ({ ...a, orderId: order.id }));
                  if (actions.length === 0) return null;
                  return (
                    <div className="flex gap-2 mt-3 flex-wrap">
                      {actions.map((action, idx) => (
                        <button
                          key={idx}
                          onClick={() => setConfirmAction(action)}
                          className="flex-1 min-w-[60px] py-1.5 rounded-lg text-xs font-medium"
                          style={{
                            backgroundColor: `${action.confirmColor}18`,
                            border: `1px solid ${action.confirmColor}40`,
                            color: action.confirmColor === "#555" ? TEXT2 : action.confirmColor,
                          }}
                        >
                          {action.confirmText}
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </div>
            );
          })}

          {/* 分页 */}
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 rounded-lg text-xs"
              style={{ backgroundColor: "rgba(255,255,255,0.05)", color: page === 1 ? TEXT2 : TEXT, border: `1px solid ${BORDER}` }}
            >
              上一页
            </button>
            <span className="text-xs" style={{ color: TEXT2 }}>第 {page} 页</span>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={orders.length < 20}
              className="px-3 py-1.5 rounded-lg text-xs"
              style={{ backgroundColor: "rgba(255,255,255,0.05)", color: orders.length < 20 ? TEXT2 : TEXT, border: `1px solid ${BORDER}` }}
            >
              下一页
            </button>
          </div>
        </div>
      )}

      <CreateOrderDialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        onSuccess={() => refetch()}
      />
    </div>
  );
}

// ===================== 主页面 =====================
export default function WcOddsAdmin() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const isAdmin = user?.role === "super_admin";
  const [activeTab, setActiveTab] = useState<"odds" | "orders">("odds");

  if (user && !isAdmin) {
    navigate("/world-cup");
    return null;
  }

  const { data: stats, refetch: refetchStats } = trpc.wcOdds.getStats.useQuery();
  const { data: matrix, isLoading: matrixLoading, refetch: refetchMatrix } = trpc.wcOdds.getOddsMatrix.useQuery({ limit: 30 });
  const triggerFetch = trpc.wcOdds.triggerFetch.useMutation({
    onSuccess: (data) => {
      toast.success(`✅ 抓取成功！共 ${data.teamCount} 支球队，快照 #${data.snapshotId}`);
      refetchStats();
      refetchMatrix();
    },
    onError: (err) => {
      toast.error(`❌ 抓取失败：${err.message}`);
    },
  });

  const tableRef = useRef<HTMLDivElement>(null);
  const snapshots = matrix?.snapshots ?? [];
  const teams = matrix?.teams ?? [];
  const matrixData = matrix?.matrix ?? {};

  function getOddsColor(current: number | null, prev: number | null): string {
    if (!current || !prev) return COLOR_SAME;
    if (current < prev) return COLOR_DOWN;
    if (current > prev) return COLOR_UP;
    return COLOR_SAME;
  }
  function getOddsArrow(current: number | null, prev: number | null): string {
    if (!current || !prev) return "";
    if (current < prev) return "↓";
    if (current > prev) return "↑";
    return "";
  }

  const snapshotsDesc = [...snapshots].reverse();

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: BG, color: TEXT }}>
      {/* 顶部导航 */}
      <div
        className="flex items-center gap-3 px-4 py-3 sticky top-0 z-30"
        style={{ backgroundColor: BG2, borderBottom: `1px solid ${BORDER}` }}
      >
        <button
          onClick={() => navigate("/world-cup")}
          className="w-8 h-8 flex items-center justify-center rounded-full"
          style={{ backgroundColor: "rgba(255,255,255,0.08)" }}
        >
          <ArrowLeft className="w-4 h-4 text-white" />
        </button>
        <span className="font-bold text-base" style={{ color: TEXT }}>
          世界杯管理
        </span>
        <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: "rgba(255,215,0,0.15)", color: GOLD }}>
          管理员
        </span>
      </div>

      {/* Tab 切换 */}
      <div
        className="flex px-4 pt-3 pb-0 gap-1"
        style={{ borderBottom: `1px solid ${BORDER}` }}
      >
        {([
          { key: "odds", label: "赔率追踪" },
          { key: "orders", label: "订单管理" },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className="px-4 py-2 text-sm font-medium rounded-t-lg"
            style={{
              backgroundColor: activeTab === tab.key ? BG3 : "transparent",
              color: activeTab === tab.key ? GOLD : TEXT2,
              borderBottom: activeTab === tab.key ? `2px solid ${GOLD}` : "2px solid transparent",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 赔率追踪 Tab */}
      {activeTab === "odds" && (
        <>
          {/* 信息卡片 */}
          <div className="px-4 pt-4 pb-2 space-y-3">
            <div
              className="rounded-xl p-4"
              style={{ backgroundColor: BG3, border: `1px solid ${BORDER}` }}
            >
              <div className="flex items-center gap-2 mb-3">
                <Info className="w-4 h-4" style={{ color: GOLD }} />
                <span className="text-sm font-semibold" style={{ color: GOLD }}>数据源信息</span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div style={{ color: TEXT2 }} className="text-xs mb-1">数据来源</div>
                  <div style={{ color: TEXT }} className="font-medium">wc-2026.com</div>
                  <div style={{ color: TEXT2 }} className="text-xs">（聚合 Pinnacle + William Hill）</div>
                </div>
                <div>
                  <div style={{ color: TEXT2 }} className="text-xs mb-1">抓取频率</div>
                  <div style={{ color: TEXT }} className="font-medium">手动触发</div>
                  <div style={{ color: TEXT2 }} className="text-xs">（需要时点击下方按钮）</div>
                </div>
                <div>
                  <div style={{ color: TEXT2 }} className="text-xs mb-1">累计运行</div>
                  <div style={{ color: GOLD }} className="font-bold text-lg">{stats?.totalRuns ?? 0} 次</div>
                </div>
                <div>
                  <div style={{ color: TEXT2 }} className="text-xs mb-1">最后更新</div>
                  <div style={{ color: TEXT }} className="font-medium text-xs">
                    {stats?.lastFetchedAt ? formatTime(stats.lastFetchedAt) : "尚未抓取"}
                  </div>
                </div>
              </div>
            </div>
            <button
              onClick={() => triggerFetch.mutate()}
              disabled={triggerFetch.isPending}
              className="w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2"
              style={{
                backgroundColor: triggerFetch.isPending ? "rgba(255,215,0,0.3)" : "rgba(255,215,0,0.15)",
                border: `1px solid ${GOLD}`,
                color: GOLD,
              }}
            >
              {triggerFetch.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {triggerFetch.isPending ? "正在抓取..." : "立即抓取一次"}
            </button>
          </div>

          {/* 赔率追踪表格 */}
          <div className="px-4 pb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold" style={{ color: TEXT }}>赔率变化追踪</span>
              <span className="text-xs" style={{ color: TEXT2 }}>
                {snapshots.length > 0
                  ? `共 ${snapshots.length} 次记录，最新：${formatTime(snapshots[snapshots.length - 1]?.fetchedAt ?? null)}`
                  : "暂无数据"}
              </span>
            </div>
            <div className="flex items-center gap-4 mb-3 text-xs" style={{ color: TEXT2 }}>
              <span><span style={{ color: COLOR_DOWN }}>↓红</span> = 赔率降低（更热门）</span>
              <span><span style={{ color: COLOR_UP }}>↑绿</span> = 赔率升高（变冷门）</span>
            </div>
            {matrixLoading ? (
              <div className="text-center py-8" style={{ color: TEXT2 }}>加载中...</div>
            ) : snapshots.length === 0 ? (
              <div className="rounded-xl p-8 text-center" style={{ backgroundColor: BG3, border: `1px solid ${BORDER}` }}>
                <div style={{ color: TEXT2 }} className="text-sm">暂无赔率数据</div>
                <div style={{ color: TEXT2 }} className="text-xs mt-1">点击上方"立即抓取一次"获取数据</div>
              </div>
            ) : (
              <div
                ref={tableRef}
                style={{
                  overflowX: "auto",
                  overflowY: "auto",
                  maxHeight: "calc(100vh - 320px)",
                  borderRadius: 12,
                  border: `1px solid ${BORDER}`,
                }}
              >
                <table style={{ borderCollapse: "collapse", minWidth: "max-content", width: "100%" }}>
                  <thead>
                    <tr style={{ backgroundColor: BG3 }}>
                      <th style={{
                        position: "sticky", left: 0, zIndex: 10,
                        backgroundColor: BG3, padding: "10px 12px",
                        borderRight: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}`,
                        textAlign: "left", whiteSpace: "nowrap", color: TEXT2, fontSize: 11, fontWeight: 600,
                      }}>
                        球队
                      </th>
                      {snapshotsDesc.map((snap) => (
                        <th key={snap.id} style={{
                          padding: "10px 8px", textAlign: "center",
                          borderRight: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}`,
                          whiteSpace: "nowrap", color: TEXT2, fontSize: 11, fontWeight: 600, minWidth: 70,
                        }}>
                          {formatTime(snap.fetchedAt)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {teams.map((team: { name: string; code: string }) => {
                      const teamData = matrixData[team.name] ?? {};
                      return (
                        <tr key={team.name} style={{ borderBottom: `1px solid rgba(255,255,255,0.03)` }}>
                          <td style={{
                            position: "sticky", left: 0, zIndex: 5,
                            backgroundColor: BG2, padding: "8px 12px",
                            borderRight: `1px solid ${BORDER}`,
                            whiteSpace: "nowrap", color: TEXT, fontWeight: 500, fontSize: 13,
                          }}>
                            {team.name}
                            {team.code && (
                              <span style={{ fontSize: 10, color: TEXT2, marginLeft: 4 }}>{team.code}</span>
                            )}
                          </td>
                          {snapshotsDesc.map((snap, colIdx) => {
                            const current = teamData[snap.id];
                            const prevSnap = snapshotsDesc[colIdx + 1];
                            const prev = prevSnap ? teamData[prevSnap.id] : null;
                            const pinnacle = current?.pinnacle ? parseFloat(current.pinnacle) : null;
                            const prevPinnacle = prev?.pinnacle ? parseFloat(prev.pinnacle) : null;
                            const color = getOddsColor(pinnacle, prevPinnacle);
                            const arrow = getOddsArrow(pinnacle, prevPinnacle);
                            return (
                              <td key={snap.id} style={{
                                padding: "7px 6px", textAlign: "center",
                                borderRight: `1px solid ${BORDER}`,
                                borderBottom: `1px solid rgba(255,255,255,0.04)`,
                                color: pinnacle ? color : "rgba(255,255,255,0.15)",
                                fontWeight: pinnacle && color !== COLOR_SAME ? 600 : 400,
                                whiteSpace: "nowrap",
                              }}>
                                {pinnacle ? (
                                  <>
                                    <div>
                                      {arrow && <span style={{ fontSize: 10, marginRight: 1 }}>{arrow}</span>}
                                      {pinnacle.toFixed(2)}
                                    </div>
                                    <div style={{ fontSize: 9, opacity: 0.55, marginTop: 1 }}>
                                      {(100 / pinnacle).toFixed(1)}%
                                    </div>
                                  </>
                                ) : (
                                  <span style={{ color: "rgba(255,255,255,0.15)" }}>-</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ backgroundColor: "rgba(255,215,0,0.08)", borderTop: `2px solid ${BORDER}` }}>
                      <td style={{
                        position: "sticky", left: 0, zIndex: 5,
                        backgroundColor: "rgba(255,215,0,0.12)", padding: "8px 10px",
                        borderRight: `1px solid ${BORDER}`, whiteSpace: "nowrap",
                        color: "rgba(255,215,0,0.9)", fontWeight: 700, fontSize: 11,
                      }}>
                        隐含概率合计
                      </td>
                      {snapshotsDesc.map((snap) => {
                        let total = 0, count = 0;
                        teams.forEach((team: { name: string; code: string }) => {
                          const current = (matrixData[team.name] ?? {})[snap.id];
                          const pinnacle = current?.pinnacle ? parseFloat(current.pinnacle) : null;
                          if (pinnacle && pinnacle > 0) { total += (1 / pinnacle) * 100; count++; }
                        });
                        const overround = total - 100;
                        const color = total > 120 ? "#ff6b6b" : total > 110 ? "#ffd700" : "#4ade80";
                        return (
                          <td key={snap.id} style={{
                            padding: "8px 6px", textAlign: "center",
                            borderRight: `1px solid ${BORDER}`,
                            color, fontWeight: 700, fontSize: 11, whiteSpace: "nowrap",
                          }}>
                            {count > 0 ? (
                              <>
                                <div>{total.toFixed(1)}%</div>
                                <div style={{ fontSize: 9, opacity: 0.7 }}>+{overround.toFixed(1)}%</div>
                              </>
                            ) : "-"}
                          </td>
                        );
                      })}
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* 订单管理 Tab */}
      {activeTab === "orders" && <OrdersTab />}
    </div>
  );
}
