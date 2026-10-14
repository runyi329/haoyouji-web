import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  Activity,
  ArrowLeft,
  BarChart3,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Database,
  Eye,
  RefreshCw,
  Users,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { isInformationCollectionOwner } from "@shared/informationCollection";

type Scope = "all" | "ledger" | "ledger37" | "ledger52";
type ObservationView = "site" | "user";

const RANGE_OPTIONS = [
  { value: 1, label: "今天" },
  { value: 7, label: "7天" },
  { value: 30, label: "30天" },
] as const;

function formatDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  if (seconds < 60) return seconds > 0 ? `${seconds}秒` : "--";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}分`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}时${remainder}分` : `${hours}时`;
}

function formatTime(value: string | null | undefined) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function ScopeCard({
  label,
  users,
  views,
  duration,
  selected,
  onClick,
  site,
}: {
  label: string;
  users: number;
  views: number;
  duration: number;
  selected: boolean;
  onClick: () => void;
  site?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-xl border px-3 py-3 transition-colors ${
        selected
          ? "border-[#1E88D6] bg-[#EFF7FF] shadow-sm"
          : "border-gray-200 bg-white hover:border-[#90CAF9]"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-sm text-gray-900">{label}</span>
        <ChevronRight className={`w-4 h-4 ${selected ? "text-[#1E88D6]" : "text-gray-300"}`} />
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1 text-center">
        <div>
          <div className="text-[10px] text-gray-400">用户</div>
          <div className="text-sm font-bold text-gray-800">{users}</div>
        </div>
        <div>
          <div className="text-[10px] text-gray-400">{site ? "会话" : "浏览"}</div>
          <div className="text-sm font-bold text-gray-800">{views}</div>
        </div>
        <div>
          <div className="text-[10px] text-gray-400">可见时长</div>
          <div className="text-sm font-bold text-gray-800">{formatDuration(duration)}</div>
        </div>
      </div>
    </button>
  );
}

export default function InformationCollection() {
  const [, setLocation] = useLocation();
  const { user, loading } = useAuth();
  const isOwner = isInformationCollectionOwner(user?.id);
  const [rangeDays, setRangeDays] = useState<1 | 7 | 30>(7);
  const [scope, setScope] = useState<Scope>("all");
  const [observationView, setObservationView] = useState<ObservationView>("site");
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const dashboardQuery = trpc.informationCollection.dashboard.useQuery(
    { rangeDays, scope, selectedUserId },
    {
      enabled: isOwner,
      staleTime: 20_000,
    },
  );
  const data = dashboardQuery.data;

  const scopeName = useMemo(() => {
    if (scope === "ledger") return "账本中心";
    if (scope === "ledger37") return "37号账本";
    if (scope === "ledger52") return "52号账本";
    return "脉动网";
  }, [scope]);

  if (loading) {
    return <div className="min-h-screen bg-gray-50" />;
  }

  if (!isOwner) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl border border-gray-200 p-6 text-center max-w-sm">
          <Database className="w-8 h-8 mx-auto text-gray-300 mb-3" />
          <h1 className="font-semibold text-gray-900">访问受限</h1>
          <p className="text-sm text-gray-500 mt-2">该页面仅用于网站运行数据查看。</p>
          <button type="button" onClick={() => setLocation("/ledger/list")} className="mt-4 text-sm text-[#1E88D6]">
            返回共享账本
          </button>
        </div>
      </div>
    );
  }

  const overview = data?.overview;

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-gray-200">
        <div className="h-14 px-4 flex items-center justify-between">
          <div className="min-w-0 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setLocation("/ledger/list")}
              className="w-9 h-9 -ml-2 flex items-center justify-center rounded-lg hover:bg-gray-100"
              aria-label="返回共享账本"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="font-bold text-base text-gray-900">信息采集</h1>
              <p className="text-[11px] text-gray-400 truncate">网站访问与账本层级追踪</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => dashboardQuery.refetch()}
            className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gray-100"
            aria-label="刷新"
          >
            <RefreshCw className={`w-4 h-4 text-[#1E88D6] ${dashboardQuery.isFetching ? "animate-spin" : ""}`} />
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-3 sm:p-4 space-y-3">
        <section className="bg-white rounded-xl border border-gray-200 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Activity className="w-4 h-4 text-[#1E88D6] flex-none" />
              <span className="text-sm font-semibold text-gray-800">采集范围</span>
            </div>
            <div className="flex rounded-lg bg-gray-100 p-0.5">
              {RANGE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setRangeDays(option.value)}
                  className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                    rangeDays === option.value ? "bg-white text-[#1E88D6] shadow-sm font-semibold" : "text-gray-500"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-2 text-xs leading-5 text-gray-500">
            统计周期与最近访问时间均按北京时间（UTC+8）计算；“今天”从北京时间 00:00 起算。当前先展开脉动网、账本中心、37号与52号账本。
          </p>
        </section>

        {!data?.capturing && (
          <section className="rounded-xl border border-[#BBDEFB] bg-[#F5FAFF] px-3 py-2.5 text-xs leading-5 text-[#406987]">
            当前为热预览环境，访问动作不会写入正式日志；正式部署后会自动开始累计。
          </section>
        )}

        <section className="bg-white rounded-xl border border-gray-200 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[#1E88D6]" />
            <h2 className="font-semibold text-sm text-gray-900">层级观察</h2>
          </div>
          <ScopeCard
            label="脉动网"
            users={overview?.site.users ?? 0}
            views={overview?.site.sessions ?? 0}
            duration={overview?.site.visibleSeconds ?? 0}
            selected={scope === "all"}
            onClick={() => setScope("all")}
            site
          />
          <div className="flex justify-center py-0.5"><ChevronRight className="w-4 h-4 text-gray-300 rotate-90" /></div>
          <ScopeCard
            label="账本中心"
            users={overview?.ledger.users ?? 0}
            views={overview?.ledger.visits ?? 0}
            duration={overview?.ledger.visibleSeconds ?? 0}
            selected={scope === "ledger"}
            onClick={() => setScope("ledger")}
          />
          <div className="flex justify-center py-0.5"><ChevronRight className="w-4 h-4 text-gray-300 rotate-90" /></div>
          <div className="grid grid-cols-2 gap-2">
            <ScopeCard
              label="37号账本"
              users={overview?.ledger37.users ?? 0}
              views={overview?.ledger37.visits ?? 0}
              duration={overview?.ledger37.visibleSeconds ?? 0}
              selected={scope === "ledger37"}
              onClick={() => setScope("ledger37")}
            />
            <ScopeCard
              label="52号账本"
              users={overview?.ledger52.users ?? 0}
              views={overview?.ledger52.visits ?? 0}
              duration={overview?.ledger52.visibleSeconds ?? 0}
              selected={scope === "ledger52"}
              onClick={() => setScope("ledger52")}
            />
          </div>
        </section>

        <section className="bg-white rounded-xl border border-gray-200 p-3">
          <div className="flex items-center gap-2 mb-2.5">
            <Eye className="w-4 h-4 text-[#1E88D6]" />
            <h2 className="font-semibold text-sm text-gray-900">观察视角</h2>
          </div>
          <div className="grid grid-cols-2 rounded-lg bg-gray-100 p-0.5">
            <button
              type="button"
              onClick={() => setObservationView("site")}
              className={`rounded-md py-2 text-sm transition-colors ${observationView === "site" ? "bg-white text-[#1E88D6] shadow-sm font-semibold" : "text-gray-500"}`}
            >
              网站视角
            </button>
            <button
              type="button"
              onClick={() => setObservationView("user")}
              className={`rounded-md py-2 text-sm transition-colors ${observationView === "user" ? "bg-white text-[#1E88D6] shadow-sm font-semibold" : "text-gray-500"}`}
            >
              用户视角
            </button>
          </div>
        </section>

        {observationView === "site" ? (
          <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-3 py-2.5 border-b border-gray-100 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <BookOpen className="w-4 h-4 text-[#1E88D6]" />
                <h2 className="font-semibold text-sm text-gray-900 truncate">{scopeName}网页浏览表</h2>
              </div>
              <span className="text-xs text-gray-400">网页 → 用户</span>
            </div>
            {dashboardQuery.isLoading ? (
              <div className="p-6 text-center text-sm text-gray-400">读取中…</div>
            ) : data?.pages.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-left">
                  <thead className="bg-gray-50 text-[11px] text-gray-400">
                    <tr>
                      <th className="px-3 py-2 font-medium">网页</th>
                      <th className="px-3 py-2 font-medium">看过的用户</th>
                      <th className="px-3 py-2 font-medium text-right">浏览</th>
                      <th className="px-3 py-2 font-medium text-right">最近访问</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.pages.map((page) => (
                      <tr key={page.key}>
                        <td className="px-3 py-2.5 align-top">
                          <div className="max-w-[145px] text-sm font-medium text-gray-800 leading-5">{page.label}</div>
                          <div className="mt-0.5 text-[11px] text-gray-400">{page.users} 位 · {formatDuration(page.visibleSeconds)}</div>
                        </td>
                        <td className="px-3 py-2.5 align-top">
                          <div className="flex max-w-[270px] flex-wrap gap-1">
                            {page.viewers.map((viewer) => (
                              <span key={viewer.userId} className="inline-flex items-center rounded-md bg-[#F1F8FE] px-1.5 py-0.5 text-[11px] text-[#356C96]">
                                {viewer.name}<span className="ml-1 text-[#7BA4C4]">{viewer.views}</span>
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 align-top text-right text-sm font-semibold text-gray-800">{page.views} 次</td>
                        <td className="px-3 py-2.5 align-top text-right text-[11px] text-gray-400 whitespace-nowrap">{formatTime(page.lastSeenAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-6 text-center text-sm text-gray-400">当前范围内暂无网页访问记录</div>
            )}
          </section>
        ) : (
          <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-3 py-2.5 border-b border-gray-100 flex items-center gap-2">
              <Users className="w-4 h-4 text-[#1E88D6]" />
              <h2 className="font-semibold text-sm text-gray-900">用户浏览操作表</h2>
            </div>
            <div className="p-3 border-b border-gray-100">
              <label className="block text-[11px] text-gray-400 mb-1.5">指定用户</label>
              <select
                value={selectedUserId ?? ""}
                onChange={(event) => setSelectedUserId(event.target.value ? Number(event.target.value) : null)}
                className="w-full h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 outline-none focus:border-[#1E88D6]"
              >
                <option value="">请选择用户</option>
                {(data?.users ?? []).map((visitor) => (
                  <option key={visitor.userId} value={visitor.userId}>
                    {visitor.name}{visitor.username ? `（@${visitor.username}）` : ""}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-[11px] leading-4 text-gray-400">显示该用户在当前统计范围内已记录的查看/进入页面动作，不采集输入内容。</p>
            </div>
            {!selectedUserId ? (
              <div className="p-6 text-center text-sm text-gray-400">请先选择一位用户</div>
            ) : dashboardQuery.isFetching ? (
              <div className="p-6 text-center text-sm text-gray-400">读取中…</div>
            ) : data?.userActivities.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[540px] text-left">
                  <thead className="bg-gray-50 text-[11px] text-gray-400">
                    <tr>
                      <th className="px-3 py-2 font-medium">动作</th>
                      <th className="px-3 py-2 font-medium">网页</th>
                      <th className="px-3 py-2 font-medium text-right">次数 / 时长</th>
                      <th className="px-3 py-2 font-medium text-right">最近时间</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.userActivities.map((activity) => (
                      <tr key={activity.key}>
                        <td className="px-3 py-2.5 text-sm font-medium text-[#356C96] whitespace-nowrap">{activity.action}</td>
                        <td className="px-3 py-2.5 text-sm text-gray-800">{activity.pageLabel}</td>
                        <td className="px-3 py-2.5 text-right text-[11px] text-gray-500 whitespace-nowrap">{activity.views} 次 · {formatDuration(activity.visibleSeconds)}</td>
                        <td className="px-3 py-2.5 text-right text-[11px] text-gray-400 whitespace-nowrap">{formatTime(activity.lastSeenAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-6 text-center text-sm text-gray-400">该用户在当前范围内暂无已记录的页面动作</div>
            )}
          </section>
        )}

        <section className="bg-white rounded-xl border border-gray-200 p-3">
          <div className="flex items-center gap-2 mb-2.5">
            <Eye className="w-4 h-4 text-[#1E88D6]" />
            <h2 className="font-semibold text-sm text-gray-900">模块启用状态</h2>
          </div>
          <div className="space-y-2">
            {data?.modules.map((module) => {
              const enabled = module.state === "capturing";
              return (
                <div key={module.key} className="flex items-start justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-800">{module.label}</div>
                    <div className="mt-0.5 text-[11px] leading-4 text-gray-400">{module.note}</div>
                  </div>
                  <div className={`flex-none inline-flex items-center gap-1 text-[11px] ${enabled ? "text-[#1E88D6]" : "text-gray-400"}`}>
                    {enabled ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Clock3 className="w-3.5 h-3.5" />}
                    {enabled ? "已启用" : "暂未启用"}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
