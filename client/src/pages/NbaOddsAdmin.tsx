/**
 * NBA 总决赛赔率追踪 - 管理员页面
 * 功能：查看抓取状态、手动触发抓取、横向时间轴表格展示赔率变化、订单管理
 */
import { useState, useCallback } from "react";
import { ArrowLeft, RefreshCw, PlusCircle, Search, X, ChevronDown } from "lucide-react";
import { trpc } from "@/lib/trpc";
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

// NBA 球队名称映射（中文）
const NBA_TEAM_ZH_MAP: Record<string, string> = {
  "San Antonio Spurs": "马刺",
  "New York Knicks": "尼克斯",
  "Oklahoma City Thunder": "雷霆",
  "Boston Celtics": "凯尔特人",
  "Golden State Warriors": "勇士",
  "Los Angeles Lakers": "湖人",
  "Miami Heat": "热火",
  "Denver Nuggets": "掘金",
  "Milwaukee Bucks": "雄鹿",
  "Phoenix Suns": "太阳",
  "Cleveland Cavaliers": "骑士",
  "Minnesota Timberwolves": "森林狼",
  "Dallas Mavericks": "独行侠",
  "Los Angeles Clippers": "快船",
  "Memphis Grizzlies": "灰熊",
  "Philadelphia 76ers": "76人",
  "Chicago Bulls": "公牛",
  "Toronto Raptors": "猛龙",
  "Indiana Pacers": "步行者",
  "Atlanta Hawks": "老鹰",
  "Charlotte Hornets": "黄蜂",
  "Detroit Pistons": "活塞",
  "Orlando Magic": "魔术",
  "Washington Wizards": "奇才",
  "Brooklyn Nets": "篮网",
  "New Orleans Pelicans": "鹈鹕",
  "Sacramento Kings": "国王",
  "Portland Trail Blazers": "开拓者",
  "Utah Jazz": "爵士",
  "Houston Rockets": "火箭",
};

function getTeamZh(name: string): string {
  return NBA_TEAM_ZH_MAP[name] || name;
}

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
  const [teamSearch, setTeamSearch] = useState("");
  const [selectedTeam, setSelectedTeam] = useState<{ name: string } | null>(null);
  const [showTeamDropdown, setShowTeamDropdown] = useState(false);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<"CNY" | "USDT">("USDT");
  const [note, setNote] = useState("");
  const [userKeyword, setUserKeyword] = useState("");
  const [selectedUser, setSelectedUser] = useState<{ id: number; name: string | null; username: string | null; phone: string | null } | null>(null);
  const [showUserDropdown, setShowUserDropdown] = useState(false);

  const { data: oddsMatrix } = trpc.nbaOdds.getOddsMatrix.useQuery({ limit: 1 }, { enabled: open });
  const { data: marginData } = trpc.nbaOdds.getMarginPct.useQuery(undefined, { enabled: open });
  const { data: userResults } = trpc.nbaOdds.searchUsers.useQuery(
    { keyword: userKeyword },
    { enabled: userKeyword.length >= 1 }
  );
  const { data: walletData } = trpc.nbaOdds.getUserWallet.useQuery(
    { userId: selectedUser?.id ?? 0 },
    { enabled: !!selectedUser }
  );

  const createOrder = trpc.nbaOdds.createOrder.useMutation({
    onSuccess: () => {
      toast.success("订单创建成功，已从钱包扣款！");
      onSuccess();
      handleClose();
    },
    onError: (err) => {
      toast.error(`创建失败：${err.message}`);
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

  // 从最新快照获取球队列表和赔率
  const teams = oddsMatrix?.teams ?? [];
  const latestSnapshotId = oddsMatrix?.snapshots?.[oddsMatrix.snapshots.length - 1]?.id;
  const matrix = oddsMatrix?.matrix ?? {};

  const marginPct = marginData?.marginPct ?? 8;

  // 计算水钱调整后赔率
  function getAdjustedOdds(teamName: string): number | null {
    if (!latestSnapshotId) return null;
    const rec = matrix[teamName]?.[latestSnapshotId];
    if (!rec?.decimalOdds) return null;
    const rawOdds = parseFloat(rec.decimalOdds);
    if (!rawOdds || rawOdds <= 0) return null;

    // 计算全场隐含概率之和
    let sumImplied = 0;
    for (const t of teams) {
      const r = matrix[t.name]?.[latestSnapshotId];
      if (r?.decimalOdds) {
        const o = parseFloat(r.decimalOdds);
        if (o > 0) sumImplied += 1 / o;
      }
    }
    if (sumImplied === 0) return rawOdds;
    const targetSum = (100 + marginPct) / 100;
    const adjustedImplied = (1 / rawOdds) / sumImplied * targetSum;
    return 1 / adjustedImplied;
  }

  const adjustedOdds = selectedTeam ? getAdjustedOdds(selectedTeam.name) : null;
  const amtNum = parseFloat(amount);
  const potentialReturn = adjustedOdds && !isNaN(amtNum) && amtNum > 0
    ? (adjustedOdds * amtNum).toFixed(2)
    : null;

  const availableBalance = walletData
    ? (currency === "USDT" ? walletData.usdt : walletData.cny)
    : null;
  const isBalanceInsufficient = availableBalance !== null && !isNaN(amtNum) && amtNum > 0 && amtNum > availableBalance;

  const filteredTeams = teams.filter(t =>
    !teamSearch || getTeamZh(t.name).includes(teamSearch) || t.name.toLowerCase().includes(teamSearch.toLowerCase())
  );

  function handleSubmit() {
    if (!selectedUser) return toast.error("请先选择下单人");
    if (!selectedTeam) return toast.error("请选择球队");
    if (!adjustedOdds || !latestSnapshotId) return toast.error("该球队暂无赔率数据");
    if (!amount || isNaN(amtNum) || amtNum <= 0) return toast.error("请输入有效金额");
    if (isBalanceInsufficient) return toast.error(`${currency} 余额不足`);

    createOrder.mutate({
      userId: selectedUser.id,
      teamName: selectedTeam.name,
      snapshotId: latestSnapshotId,
      decimalOdds: adjustedOdds.toFixed(4),
      amount: amtNum.toFixed(4),
      currency,
      note: note || undefined,
    });
  }

  if (!open) return null;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 16px" }}>
      <div style={{ background: BG2, borderRadius: 16, padding: 24, width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <span style={{ color: TEXT, fontWeight: 700, fontSize: 18 }}>新建 NBA 投注订单</span>
          <button onClick={handleClose} style={{ background: "none", border: "none", color: TEXT2, cursor: "pointer", padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        {/* 下单人搜索 */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ color: TEXT2, fontSize: 13, marginBottom: 6 }}>下单人</div>
          <div style={{ position: "relative" }}>
            <input
              value={selectedUser ? `${selectedUser.name || selectedUser.username} · ${selectedUser.phone || ""}` : userKeyword}
              onChange={e => { setUserKeyword(e.target.value); setSelectedUser(null); setShowUserDropdown(true); }}
              onFocus={() => setShowUserDropdown(true)}
              placeholder="搜索姓名/用户名/手机号"
              style={{ width: "100%", background: BG3, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 12px", color: TEXT, fontSize: 14, boxSizing: "border-box" }}
            />
            {showUserDropdown && (userResults ?? []).length > 0 && !selectedUser && (
              <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: BG3, border: `1px solid ${BORDER}`, borderRadius: 8, zIndex: 10, maxHeight: 200, overflowY: "auto" }}>
                {(userResults ?? []).map(u => (
                  <div key={u.id} onClick={() => { setSelectedUser(u as any); setShowUserDropdown(false); setUserKeyword(""); }}
                    style={{ padding: "10px 12px", color: TEXT, fontSize: 14, cursor: "pointer", borderBottom: `1px solid ${BORDER}` }}>
                    <span style={{ fontWeight: 600 }}>{u.name || u.username}</span>
                    <span style={{ color: TEXT2, marginLeft: 8, fontSize: 12 }}>{u.phone}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          {selectedUser && walletData && (
            <div style={{ marginTop: 6, fontSize: 12, color: TEXT2 }}>
              USDT 余额：<span style={{ color: GOLD }}>{walletData.usdt.toFixed(2)}</span>
              <span style={{ margin: "0 8px" }}>|</span>
              CNY 余额：<span style={{ color: GOLD }}>{walletData.cny.toFixed(2)}</span>
            </div>
          )}
        </div>

        {/* 球队选择 */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ color: TEXT2, fontSize: 13, marginBottom: 6 }}>选择球队</div>
          <div style={{ position: "relative" }}>
            <div onClick={() => setShowTeamDropdown(!showTeamDropdown)}
              style={{ background: BG3, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 12px", color: selectedTeam ? TEXT : TEXT2, fontSize: 14, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>{selectedTeam ? getTeamZh(selectedTeam.name) : "请选择球队"}</span>
              <ChevronDown size={16} color={TEXT2} />
            </div>
            {showTeamDropdown && (
              <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: BG3, border: `1px solid ${BORDER}`, borderRadius: 8, zIndex: 10, maxHeight: 240, overflowY: "auto" }}>
                <div style={{ padding: "8px 12px", borderBottom: `1px solid ${BORDER}` }}>
                  <input value={teamSearch} onChange={e => setTeamSearch(e.target.value)} placeholder="搜索球队"
                    style={{ width: "100%", background: "transparent", border: "none", color: TEXT, fontSize: 13, outline: "none" }} />
                </div>
                {filteredTeams.map(t => {
                  const odds = getAdjustedOdds(t.name);
                  return (
                    <div key={t.name} onClick={() => { setSelectedTeam({ name: t.name }); setShowTeamDropdown(false); setTeamSearch(""); }}
                      style={{ padding: "10px 12px", color: TEXT, fontSize: 14, cursor: "pointer", borderBottom: `1px solid ${BORDER}`, display: "flex", justifyContent: "space-between" }}>
                      <span>{getTeamZh(t.name)}</span>
                      {odds && <span style={{ color: GOLD, fontSize: 13 }}>{odds.toFixed(2)}x</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          {selectedTeam && adjustedOdds && (
            <div style={{ marginTop: 6, fontSize: 12, color: TEXT2 }}>
              当前赔率：<span style={{ color: GOLD, fontWeight: 700 }}>{adjustedOdds.toFixed(2)}x</span>
              <span style={{ marginLeft: 8 }}>（含 {marginPct}% 水钱）</span>
            </div>
          )}
        </div>

        {/* 金额和货币 */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ color: TEXT2, fontSize: 13, marginBottom: 6 }}>投注金额</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={amount} onChange={e => setAmount(e.target.value)} placeholder="输入金额"
              style={{ flex: 1, background: BG3, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 12px", color: TEXT, fontSize: 14 }} />
            <div style={{ display: "flex", gap: 4 }}>
              {(["USDT", "CNY"] as const).map(c => (
                <button key={c} onClick={() => setCurrency(c)}
                  style={{ padding: "10px 14px", borderRadius: 8, border: `1px solid ${currency === c ? GOLD : BORDER}`, background: currency === c ? "rgba(255,215,0,0.1)" : BG3, color: currency === c ? GOLD : TEXT2, fontSize: 13, cursor: "pointer" }}>
                  {c}
                </button>
              ))}
            </div>
          </div>
          {isBalanceInsufficient && (
            <div style={{ marginTop: 4, fontSize: 12, color: COLOR_DOWN }}>余额不足（可用 {availableBalance?.toFixed(2)}）</div>
          )}
          {potentialReturn && (
            <div style={{ marginTop: 6, fontSize: 12, color: TEXT2 }}>
              潜在回报：<span style={{ color: COLOR_UP, fontWeight: 700 }}>{potentialReturn} {currency}</span>
            </div>
          )}
        </div>

        {/* 备注 */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ color: TEXT2, fontSize: 13, marginBottom: 6 }}>备注（可选）</div>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="备注信息"
            style={{ width: "100%", background: BG3, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 12px", color: TEXT, fontSize: 14, boxSizing: "border-box" }} />
        </div>

        <button onClick={handleSubmit} disabled={createOrder.isPending || isBalanceInsufficient}
          style={{ width: "100%", padding: "14px", borderRadius: 10, background: GOLD, color: "#000", fontWeight: 700, fontSize: 16, border: "none", cursor: "pointer", opacity: createOrder.isPending ? 0.7 : 1 }}>
          {createOrder.isPending ? "提交中..." : "确认下单"}
        </button>
      </div>
    </div>
  );
}

// ===================== 确认操作 Dialog =====================
type ConfirmAction = {
  orderId: number;
  status: "pending" | "won" | "lost" | "revoked" | "deleted";
  label: string;
  needSecondConfirm?: boolean;
};

function ConfirmDialog({
  action,
  onConfirm,
  onCancel,
}: {
  action: ConfirmAction | null;
  onConfirm: (bonusAmount?: string) => void;
  onCancel: () => void;
}) {
  const [bonusAmount, setBonusAmount] = useState("");
  const [secondConfirmText, setSecondConfirmText] = useState("");

  if (!action) return null;

  const isWon = action.status === "won";
  const isSecondConfirm = action.needSecondConfirm;
  const canConfirm = isSecondConfirm
    ? secondConfirmText === "确认删除"
    : (!isWon || (bonusAmount && !isNaN(parseFloat(bonusAmount)) && parseFloat(bonusAmount) > 0));

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 16px" }}>
      <div style={{ background: BG2, borderRadius: 16, padding: 24, width: "100%", maxWidth: 360 }}>
        <div style={{ color: TEXT, fontWeight: 700, fontSize: 17, marginBottom: 12 }}>确认操作</div>
        <div style={{ color: TEXT2, fontSize: 14, marginBottom: 16 }}>确定要{action.label}吗？</div>
        {isWon && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ color: TEXT2, fontSize: 13, marginBottom: 6 }}>实际奖金金额</div>
            <input value={bonusAmount} onChange={e => setBonusAmount(e.target.value)} placeholder="输入实际派发奖金"
              style={{ width: "100%", background: BG3, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 12px", color: TEXT, fontSize: 14, boxSizing: "border-box" }} />
          </div>
        )}
        {isSecondConfirm && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ color: COLOR_DOWN, fontSize: 13, marginBottom: 6 }}>此操作不可撤销，请输入「确认删除」以继续</div>
            <input value={secondConfirmText} onChange={e => setSecondConfirmText(e.target.value)} placeholder="输入确认删除"
              style={{ width: "100%", background: BG3, border: `1px solid ${COLOR_DOWN}`, borderRadius: 8, padding: "10px 12px", color: TEXT, fontSize: 14, boxSizing: "border-box" }} />
          </div>
        )}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: "12px", borderRadius: 8, background: BG3, color: TEXT2, border: `1px solid ${BORDER}`, cursor: "pointer", fontSize: 14 }}>取消</button>
          <button onClick={() => canConfirm && onConfirm(isWon ? bonusAmount : undefined)} disabled={!canConfirm}
            style={{ flex: 1, padding: "12px", borderRadius: 8, background: canConfirm ? GOLD : BG3, color: canConfirm ? "#000" : TEXT2, border: "none", cursor: canConfirm ? "pointer" : "not-allowed", fontSize: 14, fontWeight: 700 }}>
            确认
          </button>
        </div>
      </div>
    </div>
  );
}

// ===================== 主组件 =====================
export default function NbaOddsAdmin() {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<"odds" | "orders" | "stats">("odds");
  const [showCreateOrder, setShowCreateOrder] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [orderStatusFilter, setOrderStatusFilter] = useState<"all" | "pending" | "won" | "lost" | "revoked" | "deleted">("all");
  const [orderPage, setOrderPage] = useState(1);
  const [showRawOdds, setShowRawOdds] = useState(false);

  const { data: stats, refetch: refetchStats } = trpc.nbaOdds.getStats.useQuery();
  const { data: oddsMatrix, refetch: refetchMatrix } = trpc.nbaOdds.getOddsMatrix.useQuery({ limit: 30 });
  const { data: marginData, refetch: refetchMargin } = trpc.nbaOdds.getMarginPct.useQuery();
  const { data: ordersData, refetch: refetchOrders } = trpc.nbaOdds.getOrders.useQuery({
    page: orderPage,
    pageSize: 20,
    status: orderStatusFilter,
  });
  const { data: bettingStats } = trpc.nbaOdds.getBettingStats.useQuery();

  const triggerFetch = trpc.nbaOdds.triggerFetch.useMutation({
    onSuccess: (data) => {
      toast.success(`抓取成功！共 ${data.teamsCount ?? 0} 支球队`);
      refetchMatrix();
      refetchStats();
    },
    onError: (err) => toast.error(`抓取失败：${err.message}`),
  });

  const setMarginPct = trpc.nbaOdds.setMarginPct.useMutation({
    onSuccess: () => { toast.success("水钱设置已更新"); refetchMargin(); refetchMatrix(); },
    onError: (err) => toast.error(`设置失败：${err.message}`),
  });

  const updateOrderStatus = trpc.nbaOdds.updateOrderStatus.useMutation({
    onSuccess: () => { toast.success("操作成功"); refetchOrders(); setConfirmAction(null); },
    onError: (err) => { toast.error(`操作失败：${err.message}`); setConfirmAction(null); },
  });

  const handleConfirm = useCallback((bonusAmount?: string) => {
    if (!confirmAction) return;
    updateOrderStatus.mutate({ orderId: confirmAction.orderId, status: confirmAction.status, bonusAmount });
  }, [confirmAction, updateOrderStatus]);

  const marginPct = marginData?.marginPct ?? 8;
  const snapshots = oddsMatrix?.snapshots ?? [];
  const teams = oddsMatrix?.teams ?? [];
  const matrix = oddsMatrix?.matrix ?? {};

  // 计算水钱调整后赔率
  function getAdjustedOdds(teamName: string, snapshotId: number): number | null {
    const rec = matrix[teamName]?.[snapshotId];
    if (!rec?.decimalOdds) return null;
    const rawOdds = parseFloat(rec.decimalOdds);
    if (!rawOdds || rawOdds <= 0) return null;
    if (showRawOdds) return rawOdds;

    let sumImplied = 0;
    for (const t of teams) {
      const r = matrix[t.name]?.[snapshotId];
      if (r?.decimalOdds) {
        const o = parseFloat(r.decimalOdds);
        if (o > 0) sumImplied += 1 / o;
      }
    }
    if (sumImplied === 0) return rawOdds;
    const targetSum = (100 + marginPct) / 100;
    const adjustedImplied = (1 / rawOdds) / sumImplied * targetSum;
    return 1 / adjustedImplied;
  }

  const latestSnapshotId = snapshots.length > 0 ? snapshots[snapshots.length - 1].id : null;

  const STATUS_LABELS: Record<string, string> = {
    all: "全部", pending: "进行中", won: "已中奖", lost: "未中奖", revoked: "已撤销", deleted: "已删除",
  };
  const STATUS_COLORS: Record<string, string> = {
    pending: GOLD, won: COLOR_UP, lost: COLOR_DOWN, revoked: TEXT2, deleted: TEXT2,
  };

  return (
    <div style={{ minHeight: "100vh", background: BG, color: TEXT, fontFamily: "system-ui, sans-serif" }}>
      {/* 顶部导航 */}
      <div style={{ position: "sticky", top: 0, zIndex: 50, background: BG, borderBottom: `1px solid ${BORDER}`, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={() => setLocation("/nba-finals")} style={{ background: "none", border: "none", color: TEXT2, cursor: "pointer", padding: 4 }}>
          <ArrowLeft size={20} />
        </button>
        <span style={{ flex: 1, fontWeight: 700, fontSize: 17, color: TEXT }}>NBA 总决赛管理</span>
        <span style={{ background: "rgba(255,100,0,0.15)", color: "#FF6400", fontSize: 11, padding: "3px 8px", borderRadius: 6, fontWeight: 700 }}>管理员</span>
      </div>

      {/* 数据统计卡片 */}
      <div style={{ padding: "16px 16px 0" }}>
        <div style={{ background: BG2, borderRadius: 12, padding: "14px 16px", display: "flex", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ color: TEXT2, fontSize: 12 }}>抓取次数</div>
            <div style={{ color: GOLD, fontWeight: 700, fontSize: 18 }}>{stats?.totalRuns ?? 0}</div>
          </div>
          <div>
            <div style={{ color: TEXT2, fontSize: 12 }}>最后抓取</div>
            <div style={{ color: TEXT, fontSize: 14 }}>{formatTime(stats?.lastFetchedAt ?? null)}</div>
          </div>
          <div>
            <div style={{ color: TEXT2, fontSize: 12 }}>有效订单</div>
            <div style={{ color: GOLD, fontWeight: 700, fontSize: 18 }}>{stats?.totalOrders ?? 0}</div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center" }}>
            <button onClick={() => triggerFetch.mutate()} disabled={triggerFetch.isPending}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, background: "rgba(255,215,0,0.1)", border: `1px solid ${GOLD}`, color: GOLD, fontSize: 13, cursor: "pointer" }}>
              <RefreshCw size={14} style={{ animation: triggerFetch.isPending ? "spin 1s linear infinite" : "none" }} />
              {triggerFetch.isPending ? "抓取中..." : "手动抓取"}
            </button>
          </div>
        </div>
      </div>

      {/* Tab 切换 */}
      <div style={{ display: "flex", padding: "12px 16px 0", gap: 4 }}>
        {[["odds", "赔率追踪"], ["orders", "订单管理"], ["stats", "投注比例"]] .map(([key, label]) => (
          <button key={key} onClick={() => setActiveTab(key as any)}
            style={{ flex: 1, padding: "10px 0", borderRadius: 8, background: activeTab === key ? GOLD : BG2, color: activeTab === key ? "#000" : TEXT2, border: "none", cursor: "pointer", fontWeight: activeTab === key ? 700 : 400, fontSize: 14 }}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ padding: 16 }}>
        {/* 赔率追踪 Tab */}
        {activeTab === "odds" && (
          <div>
            {/* 水钱设置 */}
            <div style={{ background: BG2, borderRadius: 12, padding: "12px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span style={{ color: TEXT2, fontSize: 13 }}>水钱设置：</span>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button onClick={() => setShowRawOdds(true)}
                  style={{ padding: "6px 12px", borderRadius: 6, background: showRawOdds ? "rgba(255,215,0,0.15)" : BG3, border: `1px solid ${showRawOdds ? GOLD : BORDER}`, color: showRawOdds ? GOLD : TEXT2, fontSize: 12, cursor: "pointer" }}>
                  原始数据
                </button>
                {[5, 8, 10, 12, 15, 20, 25].map(pct => (
                  <button key={pct} onClick={() => { setShowRawOdds(false); setMarginPct.mutate({ marginPct: pct }); }}
                    style={{ padding: "6px 12px", borderRadius: 6, background: !showRawOdds && marginPct === pct ? "rgba(255,215,0,0.15)" : BG3, border: `1px solid ${!showRawOdds && marginPct === pct ? GOLD : BORDER}`, color: !showRawOdds && marginPct === pct ? GOLD : TEXT2, fontSize: 12, cursor: "pointer" }}>
                    {pct}%
                  </button>
                ))}
              </div>
            </div>

            {/* 赔率矩阵表格 */}
            {snapshots.length === 0 ? (
              <div style={{ textAlign: "center", color: TEXT2, padding: 40 }}>暂无数据，请先手动抓取</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: BG3 }}>
                      <th style={{ padding: "10px 12px", textAlign: "left", color: TEXT2, fontWeight: 600, position: "sticky", left: 0, background: BG3, zIndex: 1 }}>球队</th>
                      {snapshots.map(s => (
                        <th key={s.id} style={{ padding: "10px 12px", textAlign: "center", color: TEXT2, fontWeight: 600, whiteSpace: "nowrap", minWidth: 80 }}>
                          {formatTime(s.fetched_at)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {teams.map((t, idx) => {
                      const latestOdds = latestSnapshotId ? getAdjustedOdds(t.name, latestSnapshotId) : null;
                      return (
                        <tr key={t.name} style={{ background: idx % 2 === 0 ? BG2 : BG, borderBottom: `1px solid ${BORDER}` }}>
                          <td style={{ padding: "10px 12px", position: "sticky", left: 0, background: idx % 2 === 0 ? BG2 : BG, zIndex: 1 }}>
                            <div style={{ fontWeight: 600, color: TEXT }}>{getTeamZh(t.name)}</div>
                            <div style={{ color: TEXT2, fontSize: 11 }}>{t.name}</div>
                          </td>
                          {snapshots.map((s, si) => {
                            const odds = getAdjustedOdds(t.name, s.id);
                            const prevSnap = snapshots[si - 1];
                            const prevOdds = prevSnap ? getAdjustedOdds(t.name, prevSnap.id) : null;
                            const isLatest = s.id === latestSnapshotId;
                            let arrowColor = TEXT2;
                            let arrow = "";
                            if (odds && prevOdds) {
                              if (odds > prevOdds) { arrow = " ↑"; arrowColor = COLOR_UP; }
                              else if (odds < prevOdds) { arrow = " ↓"; arrowColor = COLOR_DOWN; }
                            }
                            return (
                              <td key={s.id} style={{ padding: "10px 12px", textAlign: "center" }}>
                                {odds ? (
                                  <span style={{ color: isLatest ? GOLD : TEXT, fontWeight: isLatest ? 700 : 400 }}>
                                    {odds.toFixed(2)}
                                    {arrow && <span style={{ color: arrowColor, fontSize: 11 }}>{arrow}</span>}
                                  </span>
                                ) : (
                                  <span style={{ color: TEXT2 }}>-</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* 订单管理 Tab */}
        {activeTab === "orders" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {(["all", "pending", "won", "lost", "revoked", "deleted"] as const).map(s => (
                  <button key={s} onClick={() => { setOrderStatusFilter(s); setOrderPage(1); }}
                    style={{ padding: "6px 12px", borderRadius: 6, background: orderStatusFilter === s ? "rgba(255,215,0,0.15)" : BG2, border: `1px solid ${orderStatusFilter === s ? GOLD : BORDER}`, color: orderStatusFilter === s ? GOLD : TEXT2, fontSize: 12, cursor: "pointer" }}>
                    {STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
              <button onClick={() => setShowCreateOrder(true)}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, background: GOLD, color: "#000", fontSize: 13, fontWeight: 700, border: "none", cursor: "pointer" }}>
                <PlusCircle size={14} />
                新建订单
              </button>
            </div>

            {(ordersData?.orders ?? []).length === 0 ? (
              <div style={{ textAlign: "center", color: TEXT2, padding: 40 }}>暂无订单</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {(ordersData?.orders ?? []).map(order => (
                  <div key={order.id} style={{ background: BG2, borderRadius: 12, padding: "14px 16px" }}>
                    {/* 球队和状态 */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                      <div>
                        <span style={{ fontWeight: 700, fontSize: 16, color: TEXT }}>{getTeamZh(order.teamName)}</span>
                        {order.orderNo && (
                          <span style={{ marginLeft: 8, background: "rgba(255,215,0,0.15)", color: GOLD, fontSize: 11, padding: "2px 7px", borderRadius: 10, fontWeight: 700 }}>
                            #{order.orderNo}
                          </span>
                        )}
                      </div>
                      <span style={{ background: `${STATUS_COLORS[order.status]}22`, color: STATUS_COLORS[order.status], fontSize: 12, padding: "3px 10px", borderRadius: 8, fontWeight: 600 }}>
                        {STATUS_LABELS[order.status]}
                      </span>
                    </div>

                    {/* 庄家优势 + k值 */}
                    <div style={{ display: "flex", gap: 20, marginBottom: 10 }}>
                      <div>
                        <div style={{ color: TEXT2, fontSize: 11, marginBottom: 2 }}>庄家优势</div>
                        <div style={{ color: order.isDynamicPrice ? "#FF8C00" : GOLD, fontWeight: 700, fontSize: 15 }}>
                          {order.houseEdgePct != null ? `${order.houseEdgePct.toFixed(2)}%` : "-"}
                        </div>
                      </div>
                      <div>
                        <div style={{ color: TEXT2, fontSize: 11, marginBottom: 2 }}>k值</div>
                        <div style={{ fontSize: 18 }}>{order.isDynamicPrice ? "✓" : "✗"}</div>
                      </div>
                      <div>
                        <div style={{ color: TEXT2, fontSize: 11, marginBottom: 2 }}>投注</div>
                        <div style={{ color: TEXT, fontWeight: 600, fontSize: 14 }}>{formatAmount(order.amount)} {order.currency}</div>
                      </div>
                      <div>
                        <div style={{ color: TEXT2, fontSize: 11, marginBottom: 2 }}>潜在回报</div>
                        <div style={{ color: COLOR_UP, fontWeight: 700, fontSize: 14 }}>{formatAmount(order.potentialReturn)} {order.currency}</div>
                      </div>
                    </div>

                    {/* 用户信息 */}
                    <div style={{ color: TEXT2, fontSize: 12, marginBottom: 10 }}>
                      <span style={{ background: "rgba(255,215,0,0.1)", color: GOLD, padding: "2px 6px", borderRadius: 4, marginRight: 6, fontSize: 11 }}>
                        {(order.userName || order.userUsername || "").charAt(0).toUpperCase()}
                      </span>
                      {order.userName || order.userUsername} · {order.userPhone}
                      <span style={{ marginLeft: 12 }}>{formatTime(order.createdAt)}</span>
                    </div>

                    {/* 操作按钮 */}
                    {order.status !== "deleted" && (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {order.status === "pending" && (
                          <>
                            <button onClick={() => setConfirmAction({ orderId: order.id, status: "won", label: "确认中奖" })}
                              style={{ padding: "7px 14px", borderRadius: 8, background: "rgba(82,196,26,0.15)", color: COLOR_UP, border: `1px solid ${COLOR_UP}`, fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
                              确认中奖
                            </button>
                            <button onClick={() => setConfirmAction({ orderId: order.id, status: "lost", label: "确认未中" })}
                              style={{ padding: "7px 14px", borderRadius: 8, background: "rgba(255,77,79,0.15)", color: COLOR_DOWN, border: `1px solid ${COLOR_DOWN}`, fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
                              确认未中
                            </button>
                            <button onClick={() => setConfirmAction({ orderId: order.id, status: "revoked", label: "确认撤销" })}
                              style={{ padding: "7px 14px", borderRadius: 8, background: BG3, color: TEXT2, border: `1px solid ${BORDER}`, fontSize: 12, cursor: "pointer" }}>
                              确认撤销
                            </button>
                            <button onClick={() => setConfirmAction({ orderId: order.id, status: "deleted", label: "删除订单", needSecondConfirm: true })}
                              style={{ padding: "7px 14px", borderRadius: 8, background: BG3, color: TEXT2, border: `1px solid ${BORDER}`, fontSize: 12, cursor: "pointer" }}>
                              确认删除
                            </button>
                          </>
                        )}
                        {order.status === "won" && (
                          <button onClick={() => setConfirmAction({ orderId: order.id, status: "pending", label: "撤回中奖结算" })}
                            style={{ padding: "7px 14px", borderRadius: 8, background: BG3, color: TEXT2, border: `1px solid ${BORDER}`, fontSize: 12, cursor: "pointer" }}>
                            撤回结算
                          </button>
                        )}
                        {(order.status === "lost" || order.status === "revoked") && (
                          <button onClick={() => setConfirmAction({ orderId: order.id, status: "deleted", label: "删除订单", needSecondConfirm: true })}
                            style={{ padding: "7px 14px", borderRadius: 8, background: BG3, color: TEXT2, border: `1px solid ${BORDER}`, fontSize: 12, cursor: "pointer" }}>
                            确认删除
                          </button>
                        )}
                      </div>
                    )}
                    {order.status === "deleted" && (
                      <button onClick={() => setConfirmAction({ orderId: order.id, status: "pending", label: "从回收站恢复" })}
                        style={{ padding: "7px 14px", borderRadius: 8, background: "rgba(255,215,0,0.1)", color: GOLD, border: `1px solid ${GOLD}`, fontSize: 12, cursor: "pointer" }}>
                        从回收站恢复
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* 分页 */}
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, marginTop: 16 }}>
              <button onClick={() => setOrderPage(p => Math.max(1, p - 1))} disabled={orderPage === 1}
                style={{ padding: "8px 16px", borderRadius: 8, background: BG2, color: orderPage === 1 ? TEXT2 : TEXT, border: `1px solid ${BORDER}`, cursor: orderPage === 1 ? "not-allowed" : "pointer" }}>
                上一页
              </button>
              <span style={{ color: TEXT2, fontSize: 13 }}>第 {orderPage} 页</span>
              <button onClick={() => setOrderPage(p => p + 1)} disabled={(ordersData?.orders ?? []).length < 20}
                style={{ padding: "8px 16px", borderRadius: 8, background: BG2, color: (ordersData?.orders ?? []).length < 20 ? TEXT2 : TEXT, border: `1px solid ${BORDER}`, cursor: (ordersData?.orders ?? []).length < 20 ? "not-allowed" : "pointer" }}>
                下一页
              </button>
            </div>
          </div>
        )}

        {/* 投注比例 Tab */}
        {activeTab === "stats" && (
          <div>
            {(bettingStats ?? []).length === 0 ? (
              <div style={{ textAlign: "center", color: TEXT2, padding: 40 }}>暂无进行中订单</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {(bettingStats ?? []).map((s: any, i: number) => {
                  const totalAmt = (bettingStats ?? []).filter((x: any) => x.currency === s.currency).reduce((sum: number, x: any) => sum + parseFloat(x.total_amount || "0"), 0);
                  const pct = totalAmt > 0 ? (parseFloat(s.total_amount || "0") / totalAmt * 100) : 0;
                  return (
                    <div key={i} style={{ background: BG2, borderRadius: 10, padding: "12px 14px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <span style={{ fontWeight: 600, color: TEXT }}>{getTeamZh(s.team_name)}</span>
                        <span style={{ color: GOLD, fontWeight: 700 }}>{pct.toFixed(1)}%</span>
                      </div>
                      <div style={{ background: BG3, borderRadius: 4, height: 6, overflow: "hidden" }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: GOLD, borderRadius: 4 }} />
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 12, color: TEXT2 }}>
                        <span>{s.order_count} 单</span>
                        <span>{formatAmount(s.total_amount)} {s.currency}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <CreateOrderDialog open={showCreateOrder} onClose={() => setShowCreateOrder(false)} onSuccess={() => refetchOrders()} />
      <ConfirmDialog action={confirmAction} onConfirm={handleConfirm} onCancel={() => setConfirmAction(null)} />

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
