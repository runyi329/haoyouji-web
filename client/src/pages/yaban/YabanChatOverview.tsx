/**
 * 牙伴齿科 - 聊天功能设置（院长端）
 * 路由：/yaban/settings/chat-overview
 * 权限：仅创始人可见（isPureFounder=true）；普通院长按 tenantId 过滤本院数据
 * 数据源：yabanCustomer.getChatSummary / getChatLogs（tRPC，带权限校验）
 *         channel-config 接口（REST，按 channel_id 读写 AI 配置）
 * 风格：牙伴蓝白风（强调色 #1E88D6）
 */
import { useState, useEffect } from "react";
import {
  ChevronLeft,
  MessageSquare,
  Loader2,
  ChevronDown,
  ChevronRight,
  Users,
  CalendarDays,
  Zap,
  Search,
  Settings2,
  BookOpen,
} from "lucide-react";
import { useSmartBack } from "@/hooks/useSmartBack";
import { trpc } from "@/lib/trpc";
import { useYabanClinic } from "./useYabanClinic";
import YabanClinicHeader from "./YabanClinicHeader";
import { toast } from "sonner";
import { ChannelConfigTab } from "@/components/channel/ChannelConfigTab";
import { ChannelKnowledgeTab } from "@/components/channel/ChannelKnowledgeTab";

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
const BRAND = "#1E88D6";
const BRAND_LIGHT = "#EAF4FE";

// ---- AI 配置区（折叠，内含设置+知识库两个子 Tab）----
function AiConfigSection({ tenantId }: { tenantId: number | null }) {
  const [channelId, setChannelId] = useState<number | null>(null);
  const [loadingChannel, setLoadingChannel] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<"settings" | "kb">("settings");

  // 根据 tenantId 查绑定的 channel_id
  useEffect(() => {
    if (!tenantId) return;
    setChannelId(null);
    setLoadingChannel(true);
    fetch(`/api/wecom/service-binding/channel?service_type=yaban&service_tenant_id=${tenantId}`)
      .then(r => r.json())
      .then(d => {
        if (d.binding?.channel_id) {
          setChannelId(Number(d.binding.channel_id));
        } else {
          setChannelId(null);
        }
      })
      .catch(() => setChannelId(null))
      .finally(() => setLoadingChannel(false));
  }, [tenantId]);

  if (loadingChannel) {
    return (
      <div className="bg-white rounded-2xl shadow-sm p-4 flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" style={{ color: BRAND }} />
        <span className="text-sm text-gray-500">正在查询渠道绑定...</span>
      </div>
    );
  }

  if (!channelId) {
    return (
      <div className="bg-white rounded-2xl shadow-sm p-4">
        <div className="flex items-center gap-2 mb-2">
          <Settings2 className="w-4 h-4" style={{ color: BRAND }} />
          <span className="text-sm font-semibold text-gray-800">AI 配置</span>
        </div>
        <div
          className="rounded-xl p-3 text-xs leading-relaxed"
          style={{ backgroundColor: BRAND_LIGHT, color: BRAND }}
        >
          当前诊所尚未绑定企微渠道，请联系管理员在「渠道管理 - 绑定服务商」中完成绑定后，即可在此编辑 AI 配置。
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      {/* 折叠标题栏 */}
      <button
        className="w-full flex items-center justify-between px-4 py-3.5 active:bg-[#F0F7FD] transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex items-center gap-2">
          <Settings2 className="w-4 h-4" style={{ color: BRAND }} />
          <span className="text-sm font-semibold text-gray-800">AI 配置</span>
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
            style={{ backgroundColor: BRAND_LIGHT, color: BRAND }}
          >
            渠道 #{channelId}
          </span>
        </div>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-400" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-gray-50">
          {/* 子 Tab 切换 */}
          <div className="flex border-b border-gray-100 px-4 pt-2">
            <button
              onClick={() => setActiveTab("settings")}
              className={`flex items-center gap-1.5 text-sm pb-2 mr-5 border-b-2 transition-colors ${
                activeTab === "settings"
                  ? "border-blue-500 text-blue-600 font-medium"
                  : "border-transparent text-gray-400"
              }`}
            >
              <Settings2 className="w-3.5 h-3.5" />
              设置
            </button>
            <button
              onClick={() => setActiveTab("kb")}
              className={`flex items-center gap-1.5 text-sm pb-2 border-b-2 transition-colors ${
                activeTab === "kb"
                  ? "border-blue-500 text-blue-600 font-medium"
                  : "border-transparent text-gray-400"
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              知识库
            </button>
          </div>

          {/* 子 Tab 内容 */}
          <div className="px-4 py-4">
            {activeTab === "settings" ? (
              <ChannelConfigTab
                channel={{ id: channelId, name: "牙伴在线", channel_type: "kf" }}
                yabanMode
              />
            ) : (
              <ChannelKnowledgeTab
                channelType="kf"
                channelId={channelId}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function YabanChatOverview() {
  const goBack = useSmartBack("/yaban/settings/website-features");
  const { currentTenantId } = useYabanClinic();

  // ---- 筛选 ----
  const [page, setPage] = useState(0);
  const [keyword, setKeyword] = useState("");
  const [keywordInput, setKeywordInput] = useState("");
  const [expandedLog, setExpandedLog] = useState<number | null>(null);

  // ---- 统计（tRPC）----
  const summaryQuery = trpc.yabanCustomer.getChatSummary.useQuery(
    { tenantId: currentTenantId ?? undefined },
  );
  const summary = summaryQuery.data;

  // ---- 日志列表（tRPC）----
  const logsQuery = trpc.yabanCustomer.getChatLogs.useQuery({
    page,
    pageSize: PAGE_SIZE,
    keyword: keyword || undefined,
  });
  const logs: ChatLog[] = (logsQuery.data?.logs as ChatLog[]) ?? [];
  const total: number = logsQuery.data?.total ?? 0;
  const loading = logsQuery.isLoading || logsQuery.isFetching;

  function handleSearch() {
    setKeyword(keywordInput.trim());
    setPage(0);
  }

  // ---- 统计卡片配置 ----
  const statCards = [
    {
      label: "总对话数",
      value: summary?.total_logs ?? "--",
      icon: <MessageSquare className="w-4 h-4" style={{ color: BRAND }} />,
    },
    {
      label: "对话用户",
      value: summary?.total_users ?? "--",
      icon: <Users className="w-4 h-4" style={{ color: BRAND }} />,
    },
    {
      label: "本月对话",
      value: summary?.month_logs ?? "--",
      icon: <CalendarDays className="w-4 h-4" style={{ color: BRAND }} />,
    },
    {
      label: "均 Token",
      value: summary?.avg_credits ?? "--",
      icon: <Zap className="w-4 h-4" style={{ color: BRAND }} />,
    },
  ];

  return (
    <div className="min-h-screen bg-[#F0F4F8] pb-10">
      {/* ===== 顶部导航（牙伴蓝色渐变）===== */}
      <div className="sticky top-0 z-30 bg-gradient-to-r from-[#2196C8] to-[#3BA9E0] text-white">
        <div className="flex items-center gap-2 px-4 py-3">
          <button onClick={goBack} aria-label="返回" className="active:opacity-70">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <span className="text-base font-bold flex-1">聊天功能设置</span>
        </div>
        {/* 医院切换帽檐 */}
        <div className="px-4 pb-3">
          <YabanClinicHeader asBar />
        </div>
      </div>

      <div className="px-4 pt-4 space-y-3">

        {/* ===== AI 配置区（折叠，含设置+知识库）===== */}
        <AiConfigSection tenantId={currentTenantId} />

        {/* ===== 统计卡片（2×2 网格）===== */}
        <div className="grid grid-cols-2 gap-2.5">
          {statCards.map((s) => (
            <div
              key={s.label}
              className="bg-white rounded-2xl px-4 py-3 shadow-sm flex items-center gap-3"
            >
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: BRAND_LIGHT }}
              >
                {s.icon}
              </div>
              <div className="min-w-0">
                <div
                  className="text-xl font-bold leading-tight"
                  style={{ color: BRAND }}
                >
                  {summaryQuery.isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin inline" style={{ color: BRAND }} />
                  ) : (
                    s.value
                  )}
                </div>
                <div className="text-xs text-gray-400 mt-0.5">{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ===== 搜索框 ===== */}
        <div className="bg-white rounded-2xl shadow-sm flex items-center gap-2 px-3 py-2.5">
          <Search className="w-4 h-4 text-gray-300 flex-shrink-0" />
          <input
            type="text"
            value={keywordInput}
            onChange={e => setKeywordInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSearch()}
            placeholder="搜索对话内容或用户昵称"
            className="flex-1 text-sm bg-transparent outline-none text-gray-700 placeholder-gray-300"
          />
          {keywordInput && (
            <button
              onClick={() => { setKeywordInput(""); setKeyword(""); setPage(0); }}
              className="text-gray-300 active:text-gray-500"
            >
              ×
            </button>
          )}
          <button
            onClick={handleSearch}
            className="text-xs font-medium px-2.5 py-1 rounded-lg"
            style={{ backgroundColor: BRAND_LIGHT, color: BRAND }}
          >
            搜索
          </button>
        </div>

        {/* ===== 日志列表 ===== */}
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: BRAND }} />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">
            {keyword ? `未找到包含「${keyword}」的对话` : "暂无对话记录"}
          </div>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => (
              <div
                key={log.id}
                className="bg-white rounded-2xl shadow-sm overflow-hidden"
              >
                {/* 头部：昵称 + 时间 */}
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-50">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: BRAND_LIGHT }}
                    >
                      <span className="text-[10px] font-bold" style={{ color: BRAND }}>
                        {(log.nickname || "匿名").charAt(0)}
                      </span>
                    </div>
                    <span className="text-sm font-medium text-gray-700">
                      {log.nickname || "匿名用户"}
                    </span>
                  </div>
                  <span className="text-xs text-gray-400">{formatDate(log.created_at)}</span>
                </div>

                {/* 对话气泡 */}
                <button
                  className="w-full px-4 py-3 space-y-2 text-left active:bg-gray-50"
                  onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                >
                  {/* 用户消息气泡（灰色，左对齐） */}
                  {log.user_message && (
                    <div className="flex items-start gap-2">
                      <div className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-gray-500 font-bold" style={{ fontSize: "8px" }}>用</span>
                      </div>
                      <div className="bg-gray-100 rounded-2xl rounded-tl-none px-3 py-2 flex-1 min-w-0">
                        <p
                          className={`text-sm leading-snug text-gray-700 ${
                            expandedLog === log.id ? "" : "line-clamp-2"
                          }`}
                        >
                          {log.user_message}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* AI 回复气泡（蓝色，右对齐） */}
                  {log.reply_preview && (
                    <div className="flex items-start gap-2 flex-row-reverse">
                      <div
                        className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                        style={{ backgroundColor: BRAND }}
                      >
                        <span className="text-white font-bold" style={{ fontSize: "8px" }}>AI</span>
                      </div>
                      <div
                        className="rounded-2xl rounded-tr-none px-3 py-2 flex-1 min-w-0"
                        style={{ backgroundColor: BRAND }}
                      >
                        <p
                          className={`text-sm leading-snug text-white ${
                            expandedLog === log.id ? "" : "line-clamp-2"
                          }`}
                        >
                          {log.reply_preview}
                        </p>
                      </div>
                    </div>
                  )}
                </button>

                {/* 底部标签栏：模型 + token */}
                {log.model_used && (
                  <div className="px-4 pb-2.5 pt-1.5 border-t border-gray-50 flex items-center gap-2">
                    <span
                      className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                      style={{ color: BRAND, backgroundColor: BRAND_LIGHT }}
                    >
                      {log.model_used}
                    </span>
                    {log.credits_used > 0 && (
                      <span className="text-[10px] text-gray-400">
                        {log.credits_used} token
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ===== 分页 ===== */}
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-center gap-3 py-3">
            <button
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
              className="px-4 py-2 rounded-xl text-sm border border-gray-200 text-gray-600 disabled:opacity-40 active:bg-gray-50"
            >
              上一页
            </button>
            <span className="text-xs text-gray-400">
              第 {page + 1} / {Math.ceil(total / PAGE_SIZE)} 页
            </span>
            <button
              disabled={(page + 1) * PAGE_SIZE >= total}
              onClick={() => setPage(page + 1)}
              className="px-4 py-2 rounded-xl text-sm border border-gray-200 text-gray-600 disabled:opacity-40 active:bg-gray-50"
            >
              下一页
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
