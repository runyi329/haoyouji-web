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
  Save,
  RefreshCw,
} from "lucide-react";
import { useSmartBack } from "@/hooks/useSmartBack";
import { trpc } from "@/lib/trpc";
import { useYabanClinic } from "./useYabanClinic";
import YabanClinicHeader from "./YabanClinicHeader";
import { toast } from "sonner";

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

interface ChannelConfig {
  channel_id: string | number;
  welcome_msg: string;
  waiting_msg: string;
  system_prompt: string;
  ai_model: string;
  context_rounds: number;
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

const AI_MODEL_OPTIONS = [
  { value: "deepseek-chat", label: "DeepSeek 快速（推荐）" },
  { value: "deepseek-v4-flash", label: "DeepSeek V4 Flash" },
  { value: "deepseek-v4-pro", label: "DeepSeek V4 Pro" },
  { value: "manus-1.6", label: "Manus 标准" },
  { value: "manus-1.6-max", label: "Manus Max" },
];

// ---- AI 配置编辑区子组件 ----
function AiConfigEditor({ tenantId }: { tenantId: number | null }) {
  const [channelId, setChannelId] = useState<number | null>(null);
  const [loadingChannel, setLoadingChannel] = useState(false);
  const [config, setConfig] = useState<ChannelConfig | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // 本地编辑态
  const [welcomeMsg, setWelcomeMsg] = useState("");
  const [waitingMsg, setWaitingMsg] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [aiModel, setAiModel] = useState("deepseek-chat");
  const [contextRounds, setContextRounds] = useState(10);

  // 第一步：根据 tenantId 查绑定的 channel_id
  useEffect(() => {
    if (!tenantId) return;
    setChannelId(null);
    setConfig(null);
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

  // 第二步：channel_id 确定后加载 AI 配置
  useEffect(() => {
    if (!channelId) return;
    setLoadingConfig(true);
    fetch(`/api/wecom/channel-config/${channelId}`)
      .then(r => r.json())
      .then(d => {
        setConfig(d);
        setWelcomeMsg(d.welcome_msg || "");
        setWaitingMsg(d.waiting_msg || "收到，稍等为您解答～");
        setSystemPrompt(d.system_prompt || "");
        setAiModel(d.ai_model || "deepseek-chat");
        setContextRounds(d.context_rounds ?? 10);
      })
      .catch(() => setConfig(null))
      .finally(() => setLoadingConfig(false));
  }, [channelId]);

  async function handleSave() {
    if (!channelId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/wecom/channel-config/${channelId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          welcome_msg: welcomeMsg,
          waiting_msg: waitingMsg,
          system_prompt: systemPrompt,
          ai_model: aiModel,
          context_rounds: contextRounds,
        }),
      });
      const d = await res.json();
      if (d.ok) {
        toast.success("AI 配置已保存");
      } else {
        toast.error(d.error || "保存失败");
      }
    } catch {
      toast.error("网络错误");
    } finally {
      setSaving(false);
    }
  }

  // 未绑定渠道
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
          {channelId && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
              style={{ backgroundColor: BRAND_LIGHT, color: BRAND }}
            >
              渠道 #{channelId}
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-400" />
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-gray-50">
          {loadingConfig ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: BRAND }} />
            </div>
          ) : (
            <>
              {/* 欢迎语 */}
              <div>
                <label className="text-xs text-gray-500 font-medium block mb-1 mt-3">欢迎语</label>
                <textarea
                  rows={2}
                  value={welcomeMsg}
                  onChange={e => setWelcomeMsg(e.target.value)}
                  placeholder="用户首次发消息时的欢迎语（留空则不发送）"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 resize-none focus:outline-none focus:border-blue-400"
                />
              </div>

              {/* 等待提示 */}
              <div>
                <label className="text-xs text-gray-500 font-medium block mb-1">等待提示语</label>
                <input
                  type="text"
                  value={waitingMsg}
                  onChange={e => setWaitingMsg(e.target.value)}
                  placeholder="收到，稍等为您解答～"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-blue-400"
                />
              </div>

              {/* 系统 Prompt */}
              <div>
                <label className="text-xs text-gray-500 font-medium block mb-1">系统 Prompt</label>
                <textarea
                  rows={4}
                  value={systemPrompt}
                  onChange={e => setSystemPrompt(e.target.value)}
                  placeholder="定义 AI 的角色、语气和回答范围..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 resize-none focus:outline-none focus:border-blue-400"
                />
              </div>

              {/* AI 模型 + 上下文轮数 */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-500 font-medium block mb-1">AI 模型</label>
                  <select
                    value={aiModel}
                    onChange={e => setAiModel(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-2 py-2 text-sm text-gray-800 focus:outline-none focus:border-blue-400 bg-white"
                  >
                    {AI_MODEL_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium block mb-1">上下文轮数</label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={contextRounds}
                    onChange={e => setContextRounds(Number(e.target.value))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-blue-400"
                  />
                </div>
              </div>

              {/* 保存按钮 */}
              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors"
                style={{
                  backgroundColor: saving ? "#93C5FD" : BRAND,
                  color: "white",
                }}
              >
                {saving ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" />保存中...</>
                ) : (
                  <><Save className="w-3.5 h-3.5" />保存 AI 配置</>
                )}
              </button>
            </>
          )}
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

        {/* ===== AI 配置编辑区 ===== */}
        <AiConfigEditor tenantId={currentTenantId} />

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
            onChange={(e) => setKeywordInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="搜索消息内容..."
            className="flex-1 text-sm text-gray-900 bg-transparent outline-none placeholder:text-gray-300"
          />
          <button
            onClick={handleSearch}
            className="px-3 py-1.5 text-white text-xs font-medium rounded-xl active:opacity-80 transition-opacity"
            style={{ backgroundColor: BRAND }}
          >
            搜索
          </button>
        </div>

        {/* ===== 总条数提示 ===== */}
        {!loading && (
          <div className="text-xs text-gray-400 text-center">
            共 {total} 条对话记录
          </div>
        )}

        {/* ===== 日志列表 ===== */}
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 size={24} className="animate-spin" style={{ color: BRAND }} />
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center py-20 gap-3">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: BRAND_LIGHT }}
            >
              <MessageSquare className="w-7 h-7" style={{ color: BRAND }} />
            </div>
            <p className="text-sm text-gray-500 font-medium">暂无聊天记录</p>
            <p className="text-xs text-gray-300">客户与 AI 助手的对话将显示在这里</p>
          </div>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => (
              <div
                key={log.id}
                className="bg-white rounded-2xl shadow-sm overflow-hidden"
              >
                <button
                  className="w-full px-4 py-3 text-left active:bg-[#F0F7FD] transition-colors"
                  onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                >
                  {/* 头部：用户名 + 时间 + 展开箭头 */}
                  <div className="flex items-center gap-2 mb-2.5">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-white text-[11px] font-bold"
                      style={{ backgroundColor: BRAND }}
                    >
                      {(log.nickname || "用").slice(0, 1)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-gray-800 truncate block">
                        {log.nickname || `用户 ${log.wecom_user_id.slice(0, 8)}`}
                      </span>
                    </div>
                    <span className="text-[11px] text-gray-400 flex-shrink-0">
                      {formatDate(log.created_at)}
                    </span>
                    {expandedLog === log.id ? (
                      <ChevronDown className="w-4 h-4 text-gray-300 flex-shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
                    )}
                  </div>

                  {/* 用户消息气泡（灰色，左对齐） */}
                  <div className="flex items-start gap-2 mb-2">
                    <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-gray-500 font-bold" style={{ fontSize: "9px" }}>客</span>
                    </div>
                    <div className="rounded-2xl rounded-tl-none px-3 py-2 bg-gray-100 flex-1 min-w-0">
                      <p
                        className={`text-sm leading-snug text-gray-800 ${
                          expandedLog === log.id ? "" : "line-clamp-2"
                        }`}
                      >
                        {log.user_message || "(无内容)"}
                      </p>
                    </div>
                  </div>

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
