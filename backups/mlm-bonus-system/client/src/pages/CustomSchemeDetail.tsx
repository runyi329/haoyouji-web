import { useState } from "react";
import { useLocation, useParams } from "wouter";
import {
  ArrowLeft,
  Edit2,
  Share2,
  BarChart2,
  Layers,
  Shield,
  TrendingUp,
  Users,
  GitBranch,
  Settings,
  AlertCircle,
  Check,
  ChevronRight,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import type { SchemeConfig } from "./CustomSchemeWizard";

function MetricCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      <div className={`text-xl font-bold ${color || "text-gray-900"}`}>{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}

export default function CustomSchemeDetail() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const id = parseInt(params.id || "0");

  const { data: scheme, isLoading } = trpc.customScheme.get.useQuery({ id });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!scheme) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4">
        <div className="text-4xl text-gray-300">?</div>
        <div className="text-gray-600">制度不存在或无权限查看</div>
        <button onClick={() => setLocation("/")} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm">
          返回首页
        </button>
      </div>
    );
  }

  let config: SchemeConfig | null = null;
  try {
    config = JSON.parse(scheme.config);
  } catch {
    config = null;
  }

  if (!config) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">制度数据解析失败</div>
      </div>
    );
  }

  const totalPayout =
    config.levels.reduce((sum, l) => sum + l.directBonus, 0) / Math.max(config.levels.length, 1) +
    config.retailMarginBase;

  const SCHEME_TYPE_LABELS: Record<string, string> = {
    staircase: "阶梯级差制",
    generation: "代数制",
    binary: "双轨对碰制",
    matrix: "矩阵制",
    subscription: "订阅制分润",
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center gap-3">
          <button onClick={() => setLocation("/")} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-lg flex-shrink-0"
              style={{ backgroundColor: scheme.color + "20" }}
            >
              {scheme.icon}
            </div>
            <div className="min-w-0">
              <div className="font-bold text-gray-900 text-sm truncate">{scheme.name}</div>
              <div className="text-xs text-gray-400">{scheme.industry} · {SCHEME_TYPE_LABELS[scheme.schemeType] || scheme.schemeType}</div>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setLocation("/compare?a=" + id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              <BarChart2 className="w-3.5 h-3.5" />
              对比
            </button>
            <button
              onClick={() => setLocation("/custom/new")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700"
            >
              <Edit2 className="w-3.5 h-3.5" />
              新建
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Key metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricCard label="层级数量" value={`${config.levels.length} 级`} />
          <MetricCard label="代数深度" value={`${config.generationDepth} 代`} />
          <MetricCard
            label="预估拨出率"
            value={`~${totalPayout.toFixed(1)}%`}
            sub={`上限 ${config.totalPayoutCap}%`}
            color={totalPayout > config.totalPayoutCap ? "text-red-600" : "text-green-700"}
          />
          <MetricCard
            label="月收入封顶"
            value={config.monthlyIncomeCap > 0 ? `¥${config.monthlyIncomeCap.toLocaleString()}` : "无限制"}
          />
        </div>

        {/* Compliance */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-4 h-4 text-gray-500" />
            <span className="font-semibold text-sm text-gray-900">合规性评估</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              {
                ok: totalPayout <= 30,
                label: "拨出率 ≤30%",
                desc: "中国《直销管理条例》要求",
                okText: "符合",
                failText: "超出",
              },
              {
                ok: config.levels.length <= 3,
                label: "层级 ≤3层",
                desc: "严格合规标准",
                okText: "符合",
                failText: `当前${config.levels.length}层`,
              },
              {
                ok: config.antiAbuse,
                label: "防刷机制",
                desc: "防止虚假业绩",
                okText: "已启用",
                failText: "未启用",
              },
            ].map((item) => (
              <div
                key={item.label}
                className={`flex items-start gap-3 p-3 rounded-xl ${item.ok ? "bg-green-50" : "bg-red-50"}`}
              >
                <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${item.ok ? "bg-green-500" : "bg-red-500"}`}>
                  {item.ok ? <Check className="w-3 h-3 text-white" /> : <AlertCircle className="w-3 h-3 text-white" />}
                </div>
                <div>
                  <div className={`text-sm font-semibold ${item.ok ? "text-green-700" : "text-red-700"}`}>
                    {item.label} — {item.ok ? item.okText : item.failText}
                  </div>
                  <div className="text-xs text-gray-500">{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Level details */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-4">
            <Layers className="w-4 h-4 text-gray-500" />
            <span className="font-semibold text-sm text-gray-900">层级结构详情</span>
          </div>
          <div className="space-y-3">
            {config.levels.map((level, i) => (
              <div key={level.id} className="border border-gray-100 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-xs text-white font-bold flex-shrink-0"
                    style={{ backgroundColor: scheme.color }}
                  >
                    {i + 1}
                  </div>
                  <span className="font-semibold text-sm text-gray-900">{level.name}</span>
                  <span className="ml-auto text-xs font-semibold" style={{ color: scheme.color }}>
                    直推奖 {level.directBonus}%
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs text-gray-500">
                  <div>
                    <span className="text-gray-400">晋级直推：</span>
                    <span className="text-gray-700">{level.requiredDirectReferrals > 0 ? `${level.requiredDirectReferrals}人` : "—"}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">个人门槛：</span>
                    <span className="text-gray-700">{level.personalSalesMin > 0 ? `¥${level.personalSalesMin.toLocaleString()}` : "—"}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">团队门槛：</span>
                    <span className="text-gray-700">{level.teamSalesMin > 0 ? `¥${level.teamSalesMin.toLocaleString()}` : "—"}</span>
                  </div>
                </div>
                {/* Bonus bar */}
                <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min((level.directBonus / 30) * 100, 100)}%`,
                      backgroundColor: scheme.color,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Description */}
        {config.description && (
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-sm font-semibold text-gray-900 mb-2">制度说明</div>
            <p className="text-sm text-gray-600 leading-relaxed">{config.description}</p>
          </div>
        )}

        {/* Actions */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setLocation("/compare?a=" + id)}
            className="flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-blue-200 text-blue-700 text-sm font-semibold hover:bg-blue-50"
          >
            <BarChart2 className="w-4 h-4" />
            与其他制度对比
          </button>
          <button
            onClick={() => setLocation("/custom/new")}
            className="flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
          >
            <Settings className="w-4 h-4" />
            创建新制度
          </button>
        </div>
      </div>
    </div>
  );
}
