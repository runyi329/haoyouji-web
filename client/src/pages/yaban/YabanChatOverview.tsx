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
  Users,
  CalendarDays,
  Zap,
  Search,
  Settings2,
} from "lucide-react";
import { useSmartBack } from "@/hooks/useSmartBack";
import { trpc } from "@/lib/trpc";
import { useYabanClinic } from "./useYabanClinic";
import YabanClinicHeader from "./YabanClinicHeader";
import { toast } from "sonner";
import { ProjectConfigTab } from "@/components/channel/ProjectConfigTab";
import { ProjectAIBrainTab } from "@/components/channel/ProjectAIBrainTab";

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

// 微信风格头像（方形圆角）
const AI_AVATAR = "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/icons/points-mall/dental-care.webp";
const DEFAULT_USER_AVATAR = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Crect width='40' height='40' rx='4' fill='%23576B95'/%3E%3Ctext x='20' y='27' text-anchor='middle' font-size='20' fill='white'%3E%F0%9F%91%A4%3C/text%3E%3C/svg%3E";

function WxAvatar({ src, gradient, label }: { src?: string; gradient?: boolean; label?: string }) {
  return (
    <div
      className="flex-shrink-0 flex items-center justify-center"
      style={{
        width: 36, height: 36, borderRadius: 6, overflow: 'hidden',
        background: gradient
          ? 'linear-gradient(135deg, #4facfe 0%, #00c6fb 50%, #1a78c2 100%)'
          : '#f0f0f0',
        border: gradient ? 'none' : '1px solid #d0d0d0',
        padding: gradient ? 3 : 0,
      }}
    >
      <img
        src={src || DEFAULT_USER_AVATAR}
        alt={label || ''}
        style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: gradient ? 3 : 0 }}
        onError={e => { (e.target as HTMLImageElement).src = DEFAULT_USER_AVATAR; }}
      />
    </div>
  );
}

// ---- AI 配置区（内嵌，由主组件控制展开）----
function AiConfigSection({ tenantId, expanded, onClose }: { tenantId: number | null; expanded: boolean; onClose: () => void }) {
  const [channelId, setChannelId] = useState<number | null>(null);
  const [loadingChannel, setLoadingChannel] = useState(false);

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

  if (!expanded) return null;

  return (
    <div className="fixed inset-0 z-40 flex flex-col" style={{ backgroundColor: '#F0F4F8' }}>
      {/* 抗屏头部 */}
      <div className="sticky top-0 z-10 bg-gradient-to-r from-[#2196C8] to-[#3BA9E0] text-white flex items-center gap-2 px-4 py-3">
        <button onClick={onClose} aria-label="关闭" className="active:opacity-70">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <span className="text-base font-bold flex-1">AI 配置</span>
      </div>

      {/* 诊所切换条：复用统一的医院上下文栏，切换后下方配置随之重载 ==/ */}
      <div className="bg-gradient-to-r from-[#2196C8] to-[#3BA9E0] px-4 pb-3">
        <YabanClinicHeader asBar />
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
        {loadingChannel ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: BRAND }} />
          </div>
        ) : !channelId ? (
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <div
              className="rounded-xl p-3 text-xs leading-relaxed"
              style={{ backgroundColor: BRAND_LIGHT, color: BRAND }}
            >
              当前诊所尚未绑定企微渠道，请联系管理员在「渠道管理 - 绑定服务商」中完成绑定后，即可在此编辑 AI 配置。
            </div>
          </div>
        ) : (
          <>
            <ProjectConfigTab channelId={channelId} channelType="kf" />
            <div className="border-t border-gray-200" />
            <ProjectAIBrainTab channelId={channelId} channelType="kf" hideDigitalTwin serviceType="yaban" serviceTenantId={tenantId ? Number(tenantId) : undefined} />
          </>
        )}
      </div>
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
  const [aiConfigOpen, setAiConfigOpen] = useState(false);

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
      icon: <MessageSquare className="w-4 h-4 text-white" />,
    },
    {
      label: "对话用户",
      value: summary?.total_users ?? "--",
      icon: <Users className="w-4 h-4 text-white" />,
    },
    {
      label: "本月对话",
      value: summary?.month_logs ?? "--",
      icon: <CalendarDays className="w-4 h-4 text-white" />,
    },
    {
      label: "均 Token",
      value: summary?.avg_credits ?? "--",
      icon: <Zap className="w-4 h-4 text-white" />,
    },
  ];

  return (
    <div className="min-h-screen bg-[#F0F4F8] pb-10">
      {/* ===== AI 配置全屏页 ===== */}
      <AiConfigSection tenantId={currentTenantId} expanded={aiConfigOpen} onClose={() => setAiConfigOpen(false)} />

      {/* ===== 顶部蓝色区域（导航 + 医院切换 + 统计）===== */}
      <div className="bg-gradient-to-r from-[#2196C8] to-[#3BA9E0] text-white px-4 pt-3 pb-5">
        {/* 导航栏 */}
        <div className="flex items-center gap-2 mb-3">
          <button onClick={goBack} aria-label="返回" className="active:opacity-70">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <span className="text-base font-bold flex-1">聊天功能设置</span>
          <button
            onClick={() => setAiConfigOpen(true)}
            aria-label="AI 配置"
            className="w-8 h-8 rounded-xl flex items-center justify-center active:opacity-70"
            style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}
          >
            <Settings2 className="w-4 h-4 text-white" />
          </button>
        </div>
        {/* 医院切换帽檐 */}
        <div className="mb-4">
          <YabanClinicHeader asBar />
        </div>
        {/* 统计卡片2×2 网格 */}
        <div className="grid grid-cols-2 gap-2.5">
          {statCards.map((s) => (
            <div
              key={s.label}
              className="rounded-2xl px-4 py-3 flex items-center gap-3"
              style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
            >
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: 'rgba(255,255,255,0.25)' }}
              >
                {/* 图标改为白色 */}
                <div className="text-white">{s.icon}</div>
              </div>
              <div className="min-w-0">
                <div className="text-xl font-bold leading-tight text-white">
                  {summaryQuery.isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin inline text-white/70" />
                  ) : (
                    s.value
                  )}
                </div>
                <div className="text-xs text-white/70 mt-0.5">{s.label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="px-4 pt-4 space-y-3">

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
                <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-50">
                  <div className="flex items-center gap-2">
                    <div
                      className="flex-shrink-0 flex items-center justify-center text-white text-xs font-bold"
                      style={{ width: 28, height: 28, borderRadius: 6, backgroundColor: '#576B95' }}
                    >
                      {(log.nickname || "匿名").charAt(0)}
                    </div>
                    <span className="text-sm font-medium text-gray-700">
                      {log.nickname || "匿名用户"}
                    </span>
                  </div>
                  <span className="text-xs text-gray-400">{formatDate(log.created_at)}</span>
                </div>

                {/* 对话气泡（微信风格）*/}
                <button
                  className="w-full px-3 py-3 space-y-3 text-left active:bg-gray-50"
                  onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                >
                  {/* 用户消息：左侧方形头像 + 白色气泡（带左尖角）*/}
                  {log.user_message && (
                    <div className="flex items-start gap-2">
                      <WxAvatar />
                      <div className="relative max-w-[72%]">
                        <div className="absolute left-[-5px] top-[10px] w-0 h-0"
                          style={{ borderTop: '5px solid transparent', borderBottom: '5px solid transparent', borderRight: '5px solid #fff' }} />
                        <div className="bg-white px-3 py-2 shadow-sm" style={{ borderRadius: 4, wordBreak: 'break-word' }}>
                          <p className={`text-sm leading-snug text-gray-800 ${expandedLog === log.id ? '' : 'line-clamp-2'}`}>
                            {log.user_message}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* AI 回复：右侧方形头像（渐变）+ 绿色气泡（带右尖角）*/}
                  {log.reply_preview && (
                    <div className="flex items-start gap-2 flex-row-reverse">
                      <WxAvatar src={AI_AVATAR} gradient label="牙伴在线" />
                      <div className="relative max-w-[72%]">
                        <div className="absolute right-[-5px] top-[10px] w-0 h-0"
                          style={{ borderTop: '5px solid transparent', borderBottom: '5px solid transparent', borderLeft: '5px solid #95EC69' }} />
                        <div className="px-3 py-2 shadow-sm" style={{ backgroundColor: '#95EC69', borderRadius: 4, wordBreak: 'break-word' }}>
                          <p className={`text-sm leading-snug text-gray-900 ${expandedLog === log.id ? '' : 'line-clamp-2'}`}>
                            {log.reply_preview}
                          </p>
                        </div>
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
