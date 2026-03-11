/**
 * OKX AI 交易助手
 * 路由：/jiang/okx-trader
 * 仅限 jiang 账户访问
 * 功能：实时行情、账户余额、持仓查询、AI 对话
 */
import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Wallet,
  BarChart2,
  Send,
  Bot,
  User,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Streamdown } from "streamdown";

type Message = {
  role: "user" | "assistant";
  content: string;
};

// 币种颜色配置
const COIN_COLORS: Record<string, string> = {
  BTC: "#F7931A",
  ETH: "#627EEA",
  SOL: "#9945FF",
  SUI: "#4DA2FF",
  FIL: "#0090FF",
  ASTER: "#FF6B35",
};

function getCoinColor(instId: string): string {
  const coin = instId.split("-")[0];
  return COIN_COLORS[coin] || "#888";
}

export default function JiangOKXTrader() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "你好！我是你的 OKX 交易助手 🤖\n\n我可以帮你：\n- 查看实时行情（BTC、ETH、SOL...）\n- 分析当前持仓风险\n- 提供交易策略建议\n- 回答加密货币相关问题\n\n请直接输入你的问题！",
    },
  ]);
  const [inputText, setInputText] = useState("");
  const [activeTab, setActiveTab] = useState<"chat" | "portfolio">("chat");
  const [showPositions, setShowPositions] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 只允许 jiang 访问
  const isOwner = user?.username === "jiang";

  // 获取主要行情
  const { data: tickers, refetch: refetchTickers } =
    trpc.okxTrader.getMultiTickers.useQuery(
      { instIds: ["BTC-USDT", "ETH-USDT", "SOL-USDT"] },
      { refetchInterval: 30000 }
    );

  // 获取账户余额（仅 jiang）
  const {
    data: balance,
    isLoading: balanceLoading,
    refetch: refetchBalance,
  } = trpc.okxTrader.getBalance.useQuery(undefined, {
    enabled: isOwner,
    retry: false,
  });

  // 获取持仓（仅 jiang）
  const {
    data: positions,
    isLoading: positionsLoading,
    refetch: refetchPositions,
  } = trpc.okxTrader.getPositions.useQuery(undefined, {
    enabled: isOwner,
    retry: false,
    refetchInterval: 15000,
  });

  // AI 对话 mutation
  const chatMutation = trpc.okxTrader.chat.useMutation({
    onSuccess: (data) => {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.answer },
      ]);
    },
    onError: (err) => {
      toast.error(`AI 回复失败: ${err.message}`);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "抱歉，获取回复失败，请稍后再试。" },
      ]);
    },
  });

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    if (!inputText.trim() || chatMutation.isPending) return;
    const userMsg = inputText.trim();
    setInputText("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    chatMutation.mutate({
      message: userMsg,
      history: messages.slice(-6), // 保留最近 6 条历史
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleRefresh = () => {
    refetchTickers();
    if (isOwner) {
      refetchBalance();
      refetchPositions();
    }
    toast.success("数据已刷新");
  };

  // 计算总浮盈亏
  const totalUpl = positions?.reduce((sum, p) => sum + p.upl, 0) ?? 0;
  const totalEquityUsd =
    balance?.reduce((sum, b) => sum + b.eqUsd, 0) ?? 0;

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white flex flex-col">
      {/* 顶部导航 */}
      <div className="bg-[#0d0d18] border-b border-[#1e2a4a] sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => setLocation("/jiang/profile")}
            className="text-[#4a9eff] hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <div className="text-sm font-bold text-white">OKX 交易助手</div>
            <div className="text-[10px] text-[#4a9eff]">AI Powered Trading</div>
          </div>
          <button
            onClick={handleRefresh}
            className="text-[#4a9eff] hover:text-white transition-colors p-1"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Tab 切换 */}
        <div className="max-w-lg mx-auto px-4 pb-0 flex gap-0">
          <button
            onClick={() => setActiveTab("chat")}
            className={`flex-1 py-2 text-xs font-medium border-b-2 transition-colors ${
              activeTab === "chat"
                ? "border-[#1A56DB] text-[#4a9eff]"
                : "border-transparent text-[#666]"
            }`}
          >
            AI 对话
          </button>
          <button
            onClick={() => setActiveTab("portfolio")}
            className={`flex-1 py-2 text-xs font-medium border-b-2 transition-colors ${
              activeTab === "portfolio"
                ? "border-[#1A56DB] text-[#4a9eff]"
                : "border-transparent text-[#666]"
            }`}
          >
            持仓概览
          </button>
        </div>
      </div>

      {/* 行情栏（始终显示） */}
      <div className="bg-[#0d0d18] border-b border-[#1e2a4a]">
        <div className="max-w-lg mx-auto px-4 py-2 flex gap-4 overflow-x-auto">
          {tickers?.map((t: any) => {
            const coin = t.instId?.split("-")[0] || "";
            const change = parseFloat(t.change24h || "0");
            const isUp = change >= 0;
            return (
              <div key={t.instId} className="flex items-center gap-1.5 shrink-0">
                <span
                  className="text-xs font-bold"
                  style={{ color: getCoinColor(t.instId) }}
                >
                  {coin}
                </span>
                <span className="text-xs text-white font-mono">
                  ${t.last?.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                </span>
                <span
                  className={`text-[10px] font-medium ${isUp ? "text-[#00c087]" : "text-[#f6465d]"}`}
                >
                  {isUp ? "+" : ""}
                  {change.toFixed(2)}%
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 主内容区 */}
      <div className="flex-1 overflow-hidden flex flex-col max-w-lg mx-auto w-full">
        {activeTab === "chat" ? (
          /* ===== AI 对话 Tab ===== */
          <>
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
                >
                  {/* 头像 */}
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                      msg.role === "assistant"
                        ? "bg-[#1A56DB]/30 border border-[#1A56DB]/50"
                        : "bg-[#1e2a4a]"
                    }`}
                  >
                    {msg.role === "assistant" ? (
                      <Bot className="w-4 h-4 text-[#4a9eff]" />
                    ) : (
                      <User className="w-4 h-4 text-[#888]" />
                    )}
                  </div>
                  {/* 消息气泡 */}
                  <div
                    className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                      msg.role === "assistant"
                        ? "bg-[#0d1a2e] border border-[#1e2a4a] text-[#e0e8ff]"
                        : "bg-[#1A56DB] text-white"
                    }`}
                  >
                    {msg.role === "assistant" ? (
                      <div className="prose prose-invert prose-sm max-w-none text-[#e0e8ff] [&_p]:my-1 [&_ul]:my-1 [&_li]:my-0.5">
                        <Streamdown>{msg.content}</Streamdown>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    )}
                  </div>
                </div>
              ))}
              {chatMutation.isPending && (
                <div className="flex gap-2">
                  <div className="w-7 h-7 rounded-full bg-[#1A56DB]/30 border border-[#1A56DB]/50 flex items-center justify-center shrink-0">
                    <Bot className="w-4 h-4 text-[#4a9eff]" />
                  </div>
                  <div className="bg-[#0d1a2e] border border-[#1e2a4a] rounded-2xl px-3 py-2">
                    <div className="flex gap-1 items-center">
                      <div className="w-1.5 h-1.5 bg-[#4a9eff] rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                      <div className="w-1.5 h-1.5 bg-[#4a9eff] rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                      <div className="w-1.5 h-1.5 bg-[#4a9eff] rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* 快捷问题 */}
            <div className="px-4 pb-2 flex gap-2 overflow-x-auto">
              {[
                "BTC现在多少钱？",
                "我的持仓浮亏多少？",
                "当前市场行情分析",
                "ETH后市怎么看？",
              ].map((q) => (
                <button
                  key={q}
                  onClick={() => {
                    setInputText(q);
                  }}
                  className="shrink-0 text-[10px] bg-[#0d1a2e] border border-[#1e2a4a] text-[#4a9eff] rounded-full px-3 py-1 hover:border-[#1A56DB] transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>

            {/* 输入框 */}
            <div className="px-4 pb-6 pt-2 border-t border-[#1e2a4a] bg-[#0A0A0F]">
              <div className="flex gap-2 items-end">
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="问我任何关于交易的问题..."
                  rows={1}
                  className="flex-1 bg-[#0d1a2e] border border-[#1e2a4a] rounded-xl px-3 py-2 text-sm text-white placeholder-[#444] resize-none focus:outline-none focus:border-[#1A56DB] transition-colors"
                  style={{ minHeight: "40px", maxHeight: "120px" }}
                />
                <button
                  onClick={handleSend}
                  disabled={!inputText.trim() || chatMutation.isPending}
                  className="w-10 h-10 bg-[#1A56DB] rounded-xl flex items-center justify-center disabled:opacity-40 hover:bg-[#1648c0] transition-colors shrink-0"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        ) : (
          /* ===== 持仓概览 Tab ===== */
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 pb-24">
            {/* 总资产卡片 */}
            {isOwner && (
              <div className="bg-gradient-to-br from-[#0d1a2e] to-[#0a1020] border border-[#1e2a4a] rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Wallet className="w-4 h-4 text-[#4a9eff]" />
                  <span className="text-xs text-[#4a9eff] font-medium">账户总资产</span>
                </div>
                {balanceLoading ? (
                  <div className="text-[#444] text-sm">加载中...</div>
                ) : (
                  <>
                    <div className="text-2xl font-bold text-white mb-1">
                      ${totalEquityUsd.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                    </div>
                    <div className={`text-sm font-medium flex items-center gap-1 ${totalUpl >= 0 ? "text-[#00c087]" : "text-[#f6465d]"}`}>
                      {totalUpl >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                      合约浮盈亏: {totalUpl >= 0 ? "+" : ""}{totalUpl.toFixed(2)} USDT
                    </div>
                  </>
                )}
              </div>
            )}

            {/* 余额明细 */}
            {isOwner && balance && balance.length > 0 && (
              <div className="bg-[#0d1a2e] border border-[#1e2a4a] rounded-2xl overflow-hidden">
                <div className="px-4 py-3 border-b border-[#1e2a4a] flex items-center gap-2">
                  <Wallet className="w-3.5 h-3.5 text-[#4a9eff]" />
                  <span className="text-xs text-[#4a9eff] font-medium">资产余额</span>
                </div>
                {balance.map((b) => (
                  <div key={b.ccy} className="px-4 py-3 flex items-center justify-between border-b border-[#1e2a4a] last:border-0">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                        style={{ backgroundColor: getCoinColor(b.ccy) + "33", border: `1px solid ${getCoinColor(b.ccy)}66` }}
                      >
                        {b.ccy.slice(0, 2)}
                      </div>
                      <div>
                        <div className="text-white text-sm font-medium">{b.ccy}</div>
                        <div className="text-[#444] text-[10px]">
                          可用: {b.availBal.toFixed(4)}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-white text-sm">{b.eq.toFixed(4)}</div>
                      <div className="text-[#666] text-[10px]">
                        ≈${b.eqUsd.toFixed(2)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 持仓明细 */}
            {isOwner && (
              <div className="bg-[#0d1a2e] border border-[#1e2a4a] rounded-2xl overflow-hidden">
                <button
                  onClick={() => setShowPositions(!showPositions)}
                  className="w-full px-4 py-3 border-b border-[#1e2a4a] flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <BarChart2 className="w-3.5 h-3.5 text-[#4a9eff]" />
                    <span className="text-xs text-[#4a9eff] font-medium">合约持仓</span>
                    {positions && positions.length > 0 && (
                      <span className="text-[10px] bg-[#1A56DB]/20 text-[#4a9eff] rounded-full px-2 py-0.5">
                        {positions.length}
                      </span>
                    )}
                  </div>
                  {showPositions ? (
                    <ChevronUp className="w-3.5 h-3.5 text-[#444]" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-[#444]" />
                  )}
                </button>
                {showPositions && (
                  <>
                    {positionsLoading ? (
                      <div className="px-4 py-6 text-center text-[#444] text-sm">
                        加载持仓数据...
                      </div>
                    ) : positions && positions.length > 0 ? (
                      positions.map((p) => {
                        const coin = p.instId.split("-")[0];
                        const isLong = p.side === "long";
                        const isProfit = p.upl >= 0;
                        const uplRatioPct = (p.uplRatio * 100).toFixed(2);
                        return (
                          <div
                            key={p.instId}
                            className="px-4 py-3 border-b border-[#1e2a4a] last:border-0"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span
                                  className="text-xs font-bold"
                                  style={{ color: getCoinColor(p.instId) }}
                                >
                                  {coin}
                                </span>
                                <span
                                  className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                    isLong
                                      ? "bg-[#00c087]/20 text-[#00c087]"
                                      : "bg-[#f6465d]/20 text-[#f6465d]"
                                  }`}
                                >
                                  {isLong ? "多" : "空"} {p.lever}x
                                </span>
                                <span className="text-[10px] text-[#666]">
                                  {p.pos}张
                                </span>
                              </div>
                              <div
                                className={`text-sm font-bold ${isProfit ? "text-[#00c087]" : "text-[#f6465d]"}`}
                              >
                                {isProfit ? "+" : ""}
                                {p.upl.toFixed(2)} U
                              </div>
                            </div>
                            <div className="flex justify-between text-[10px] text-[#666]">
                              <span>开仓均价: ${p.avgPx.toLocaleString()}</span>
                              <span
                                className={isProfit ? "text-[#00c087]" : "text-[#f6465d]"}
                              >
                                {isProfit ? "+" : ""}
                                {uplRatioPct}%
                              </span>
                            </div>
                            {p.liqPx && (
                              <div className="text-[10px] text-[#f6465d]/70 mt-0.5">
                                强平价: ${p.liqPx.toLocaleString()}
                              </div>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <div className="px-4 py-6 text-center text-[#444] text-sm">
                        暂无持仓
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {!isOwner && (
              <div className="text-center text-[#444] text-sm py-10">
                账户数据仅限授权用户查看
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
