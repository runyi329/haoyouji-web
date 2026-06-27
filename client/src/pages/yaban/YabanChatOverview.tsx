/**
 * 牙伴齿科 - 聊天总览页（院长端）
 * 路由：/yaban/settings/chat-overview
 * 功能：展示所有用户与 AI 助手的聊天记录总览（含统计卡片）
 * 数据源：wecom_message_credits（channel_type='web'，即 web-chat 接口写入）
 */
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { ChevronLeft, MessageSquare, Loader2, ChevronDown, ChevronRight, ChevronUp } from "lucide-react";
import { useSmartBack } from "@/hooks/useSmartBack";
import YabanClinicHeader from "./YabanClinicHeader";

// ---- 类型 ----
interface ChatLog {
  id: number;
  wecom_user_id: string;
  user_message: string | null;
  reply_preview: string | null;
  model_used: string | null;
  credits_used: number;
  created_at: string;
  nickname: string | null;
}

interface Summary {
  total_logs: number;
  total_users: number;
  month_logs: number;
  avg_credits: number;
}

// ---- 工具函数 ----
function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${mo}/${day} ${h}:${mi}`;
}

const PAGE_SIZE = 20;

export default function YabanChatOverview() {
  const [, navigate] = useLocation();
  const goBack = useSmartBack("/yaban/settings/website-features");

  // ---- 统计 ----
  const [summary, setSummary] = useState<Summary | null>(null);

  // ---- 日志列表 ----
  const [logs, setLogs] = useState<ChatLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<number | null>(null);

  // ---- 筛选 ----
  const [keyword, setKeyword] = useState("");
  const [keywordInput, setKeywordInput] = useState("");

  // ---- 初始化：加载统计 ----
  useEffect(() => {
    fetch("/api/wecom/ch/data/summary?channel_type=web")
      .then((r) => r.json())
      .then((d) => { if (d.ok) setSummary(d); })
      .catch(() => {});
  }, []);

  // ---- 加载日志 ----
  async function fetchLogs(p = 0) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("channel_type", "web");
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(p * PAGE_SIZE));
      if (keyword) params.set("keyword", keyword);
      const res = await fetch(`/api/wecom/ch/logs?${params.toString()}`);
      const data = await res.json();
      if (data.ok) {
        setLogs(data.logs || []);
        setTotal(data.total || 0);
        setPage(p);
      }
    } catch {
      // 静默失败
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchLogs(0); }, [keyword]);

  function handleSearch() {
    setKeyword(keywordInput.trim());
  }

  return (
    <div className="min-h-screen bg-[#F0F4F8] pb-10">
      {/* 顶部导航 */}
      <div className="sticky top-0 z-30 bg-gradient-to-r from-green-600 to-green-500 text-white">
        <div className="flex items-center gap-2 px-4 py-3">
          <button onClick={goBack} aria-label="返回">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <span className="text-base font-bold flex-1">聊天总览</span>
        </div>
        <div className="px-4 pb-3">
          <YabanClinicHeader asBar />
        </div>
      </div>

      <div className="px-4 pt-4 space-y-3">
        {/* 统计卡片 */}
        {summary && (
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "总对话", value: summary.total_logs, color: "#16a34a" },
              { label: "总用户", value: summary.total_users, color: "#1a1a1a" },
              { label: "本月对话", value: summary.month_logs, color: "#16a34a" },
              { label: "均 Token/条", value: summary.avg_credits, color: "#6b7280" },
            ].map((s) => (
              <div
                key={s.label}
                className="bg-white rounded-xl p-3 text-center border border-gray-100 shadow-sm"
              >
                <div className="text-xl font-bold" style={{ color: s.color }}>
                  {s.value}
                </div>
                <div className="text-xs mt-0.5 text-gray-400">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* 搜索框 */}
        <div className="flex gap-2">
          <input
            type="text"
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="搜索消息内容..."
            className="flex-1 bg-white rounded-xl px-3 py-2.5 text-sm text-gray-900 border border-gray-100 shadow-sm outline-none"
          />
          <button
            onClick={handleSearch}
            className="px-4 py-2.5 bg-green-600 text-white text-sm font-medium rounded-xl shadow-sm"
          >
            搜索
          </button>
        </div>

        {/* 总条数 */}
        {!loading && (
          <div className="text-xs text-gray-400 text-center">
            共 {total} 条对话记录
          </div>
        )}

        {/* 日志列表 */}
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 size={24} className="text-green-500 animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center py-20 text-gray-400 gap-3">
            <MessageSquare size={40} className="text-gray-200" />
            <p className="text-sm">暂无聊天记录</p>
            <p className="text-xs text-gray-300">客户与 AI 助手的对话将显示在这里</p>
          </div>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => (
              <div
                key={log.id}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
              >
                <button
                  className="w-full px-3 py-2.5 text-left"
                  onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                >
                  {/* 时间 + 用户 + 展开按钮 */}
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-[10px] text-gray-400 flex-shrink-0">
                      {formatDate(log.created_at)}
                    </span>
                    <span className="text-[10px] text-gray-400 truncate flex-1">
                      {log.nickname || `用户 ${log.wecom_user_id.slice(0, 8)}`}
                    </span>
                    {expanded === log.id ? (
                      <ChevronDown className="w-3 h-3 text-gray-400 flex-shrink-0" />
                    ) : (
                      <ChevronRight className="w-3 h-3 text-gray-400 flex-shrink-0" />
                    )}
                  </div>
                  {/* 用户气泡 */}
                  <div className="flex items-start gap-1.5 mb-1">
                    <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-green-600" style={{ fontSize: "10px", fontWeight: 700 }}>
                        客
                      </span>
                    </div>
                    <div className="rounded-2xl rounded-tl-none px-2.5 py-1.5 flex-1 min-w-0 bg-gray-100">
                      <div
                        className={`text-sm leading-snug text-gray-900 ${
                          expanded === log.id ? "" : "line-clamp-1"
                        }`}
                      >
                        {log.user_message || "(无内容)"}
                      </div>
                    </div>
                  </div>
                  {/* AI 回复气泡 */}
                  {log.reply_preview && (
                    <div className="flex items-start gap-1.5 flex-row-reverse">
                      <div className="w-6 h-6 rounded-full bg-green-600 flex items-center justify-center flex-shrink-0">
                        <span className="text-white" style={{ fontSize: "9px", fontWeight: 700 }}>
                          AI
                        </span>
                      </div>
                      <div className="rounded-2xl rounded-tr-none px-2.5 py-1.5 flex-1 min-w-0 bg-green-600">
                        <div
                          className={`text-sm leading-snug text-white ${
                            expanded === log.id ? "" : "line-clamp-1"
                          }`}
                        >
                          {log.reply_preview}
                        </div>
                      </div>
                    </div>
                  )}
                </button>
                {/* 底部：模型标签 */}
                {log.model_used && (
                  <div className="px-3 pb-2.5 border-t border-gray-50 pt-1.5">
                    <span className="text-[10px] text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                      {log.model_used}
                    </span>
                    {log.credits_used > 0 && (
                      <span className="text-[10px] text-gray-400 ml-2">
                        {log.credits_used} token
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 分页 */}
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-center gap-3 py-3">
            <button
              disabled={page === 0}
              onClick={() => fetchLogs(page - 1)}
              className="px-4 py-2 rounded-xl text-sm border border-gray-200 text-gray-600 disabled:opacity-40"
            >
              上一页
            </button>
            <span className="text-xs text-gray-400">
              第 {page + 1} / {Math.ceil(total / PAGE_SIZE)} 页
            </span>
            <button
              disabled={(page + 1) * PAGE_SIZE >= total}
              onClick={() => fetchLogs(page + 1)}
              className="px-4 py-2 rounded-xl text-sm border border-gray-200 text-gray-600 disabled:opacity-40"
            >
              下一页
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
