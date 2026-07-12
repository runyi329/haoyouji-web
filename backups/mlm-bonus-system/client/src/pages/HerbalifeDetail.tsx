import { useState } from "react";
import { ChevronLeft, Users, DollarSign, TrendingUp, Award, GitBranch, Loader2, RefreshCw, BookOpen, BarChart2 } from "lucide-react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from "recharts";

const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth() + 1;

const LEVEL_CONFIG: Record<string, { label: string; color: string; sortOrder: number }> = {
  member: { label: "普通会员", color: "#6b7280", sortOrder: 1 },
  senior_consultant: { label: "高级顾问", color: "#3b82f6", sortOrder: 2 },
  qualified_producer: { label: "合格生产商", color: "#10b981", sortOrder: 3 },
  supervisor: { label: "主管", color: "#f59e0b", sortOrder: 4 },
  world_team: { label: "世界组", color: "#8b5cf6", sortOrder: 5 },
  get_team: { label: "全球扩展组", color: "#ef4444", sortOrder: 6 },
  millionaire_team: { label: "百万富翁组", color: "#d97706", sortOrder: 7 },
  presidents_team: { label: "总裁组", color: "#dc2626", sortOrder: 8 },
};

type TabKey = "dashboard" | "members" | "bonuses" | "tree" | "guide";

function DashboardTab() {
  const seedStatus = trpc.mlm.seed.status.useQuery();
  const memberStats = trpc.mlm.members.stats.useQuery();
  const bonusSummary = trpc.mlm.bonuses.summary.useQuery({ year: CURRENT_YEAR, month: CURRENT_MONTH });
  const leaderboard = trpc.mlm.bonuses.leaderboard.useQuery({ year: CURRENT_YEAR, month: CURRENT_MONTH, limit: 5 });

  const seedMutation = trpc.mlm.seed.run.useMutation({
    onSuccess: (data: any) => { toast.success(data.message); seedStatus.refetch(); memberStats.refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const calculateMutation = trpc.mlm.bonuses.calculate.useMutation({
    onSuccess: () => { toast.success("奖金计算完成！"); bonusSummary.refetch(); leaderboard.refetch(); },
    onError: (e: any) => toast.error(e.message),
  });

  const isSeeded = seedStatus.data?.seeded;
  const totalMembers = memberStats.data?.total ?? 0;
  const bonusData = bonusSummary.data;

  const levelData = (memberStats.data?.byLevel ?? [])
    .map((item: any) => ({
      name: LEVEL_CONFIG[item.level]?.label ?? item.level,
      value: item.count,
      color: LEVEL_CONFIG[item.level]?.color ?? "#6b7280",
    }))
    .sort((a: any, b: any) => {
      const aO = Object.values(LEVEL_CONFIG).find(c => c.label === a.name)?.sortOrder ?? 0;
      const bO = Object.values(LEVEL_CONFIG).find(c => c.label === b.name)?.sortOrder ?? 0;
      return aO - bO;
    });

  const bonusBarData = bonusData ? [
    { name: "零售利润", value: Number(bonusData.totalRetail ?? 0), color: "#059669" },
    { name: "批发利润", value: Number(bonusData.totalWholesale ?? 0), color: "#2563eb" },
    { name: "皇家权益金", value: Number(bonusData.totalRoyalty ?? 0), color: "#7c3aed" },
    { name: "生产奖金", value: Number(bonusData.totalProduction ?? 0), color: "#d97706" },
  ] : [];

  return (
    <div className="space-y-4 p-4">
      <div className="flex gap-2">
        {!isSeeded && !seedStatus.isLoading && (
          <button
            onClick={() => seedMutation.mutate()}
            disabled={seedMutation.isPending}
            className="flex items-center gap-1.5 bg-primary text-white text-sm px-4 py-2 rounded-xl font-medium"
          >
            {seedMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
            生成模拟数据
          </button>
        )}
        {isSeeded && (
          <button
            onClick={() => calculateMutation.mutate({ year: CURRENT_YEAR, month: CURRENT_MONTH })}
            disabled={calculateMutation.isPending}
            className="flex items-center gap-1.5 tech-card text-foreground text-sm px-4 py-2 rounded-xl font-medium"
          >
            {calculateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            计算本月奖金
          </button>
        )}
      </div>

      {!isSeeded && !seedStatus.isLoading && (
        <div className="tech-card border-dashed border-primary/30 rounded-2xl p-8 text-center">
          <GitBranch className="w-10 h-10 text-primary/50 mx-auto mb-3" />
          <div className="text-sm font-bold text-foreground mb-1">欢迎使用 Herbalife 奖金研究系统</div>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-xs mx-auto">
            点击「生成模拟数据」，系统将自动创建约80名虚拟会员，覆盖所有8个等级，并填充3个月的业绩数据。
          </p>
        </div>
      )}

      {isSeeded && (
        <>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "总会员数", value: totalMembers, icon: <Users className="w-4 h-4 text-green-400" />, bg: "bg-green-400/10" },
              { label: "本月总奖金", value: `$${Number(bonusData?.totalAll ?? 0).toLocaleString("en", { maximumFractionDigits: 0 })}`, icon: <DollarSign className="w-4 h-4 text-blue-400" />, bg: "bg-blue-400/10" },
              { label: "主管以上", value: (memberStats.data?.byLevel ?? []).filter((l: any) => ["supervisor","world_team","get_team","millionaire_team","presidents_team"].includes(l.level)).reduce((s: number, l: any) => s + l.count, 0), icon: <TrendingUp className="w-4 h-4 text-purple-400" />, bg: "bg-purple-400/10" },
              { label: "TAB Team", value: (memberStats.data?.byLevel ?? []).filter((l: any) => ["get_team","millionaire_team","presidents_team"].includes(l.level)).reduce((s: number, l: any) => s + l.count, 0), icon: <Award className="w-4 h-4 text-amber-400" />, bg: "bg-amber-400/10" },
            ].map((card) => (
              <div key={card.label} className="tech-card rounded-2xl p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground">{card.label}</span>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center ${card.bg}`}>{card.icon}</div>
                </div>
                <div className="text-xl font-bold text-foreground">{card.value}</div>
              </div>
            ))}
          </div>

          {levelData.length > 0 && (
            <div className="tech-card rounded-2xl p-4">
              <div className="text-sm font-bold text-foreground mb-3">会员等级分布</div>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={levelData} cx="40%" cy="50%" outerRadius={75} dataKey="value" label={false}>
                    {levelData.map((entry: any, i: number) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: number, n: string) => [`${v} 人`, n]} />
                  <Legend layout="vertical" align="right" verticalAlign="middle" formatter={(v) => <span className="text-xs">{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}

          {bonusBarData.some(d => d.value > 0) && (
            <div className="tech-card rounded-2xl p-4">
              <div className="text-sm font-bold text-foreground mb-3">本月奖金类型分布</div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={bonusBarData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                  <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => [`$${v.toLocaleString("en", { maximumFractionDigits: 2 })}`, "金额"]} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {bonusBarData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {(leaderboard.data ?? []).length > 0 && (
            <div className="tech-card rounded-2xl p-4">
              <div className="text-sm font-bold text-foreground mb-3">本月奖金 Top 5</div>
              <div className="space-y-2">
                {(leaderboard.data ?? []).map((item: any, i: number) => (
                  <div key={item.memberId} className="flex items-center gap-3 p-2.5 rounded-xl bg-background/50">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                      style={{ background: i === 0 ? "#d97706" : i === 1 ? "#6b7280" : i === 2 ? "#b45309" : "#374151" }}>
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">{item.memberName}</div>
                      <div className="text-xs text-muted-foreground">{item.memberCode}</div>
                    </div>
                    <div className="text-sm font-bold text-green-400">${Number(item.totalBonus).toLocaleString("en", { maximumFractionDigits: 2 })}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MembersTab() {
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const members = trpc.mlm.members.list.useQuery({ search: search || undefined, level: levelFilter === "all" ? undefined : levelFilter });

  return (
    <div className="p-4 space-y-3">
      <input
        className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-primary"
        placeholder="搜索会员姓名或编号..."
        value={search}
        onChange={e => setSearch(e.target.value)}
      />
      <div className="flex gap-2 overflow-x-auto pb-1">
        {["all", ...Object.keys(LEVEL_CONFIG)].map(lv => (
          <button
            key={lv}
            onClick={() => setLevelFilter(lv)}
            className={cn(
              "flex-shrink-0 text-xs px-2.5 py-1 rounded-full border transition-colors",
              levelFilter === lv ? "bg-primary border-primary text-white" : "border-border text-muted-foreground"
            )}
          >
            {lv === "all" ? "全部" : LEVEL_CONFIG[lv]?.label ?? lv}
          </button>
        ))}
      </div>
      {members.isLoading && <div className="text-center py-8"><Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></div>}
      <div className="space-y-2">
        {(members.data ?? []).map((m: any) => (
          <div key={m.id} className="tech-card rounded-xl p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
              style={{ background: LEVEL_CONFIG[m.level]?.color ?? "#374151" }}>
              {m.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">{m.name}</span>
                <span className="text-xs px-1.5 py-0.5 rounded-full"
                  style={{ background: `${LEVEL_CONFIG[m.level]?.color ?? "#374151"}20`, color: LEVEL_CONFIG[m.level]?.color ?? "#6b7280" }}>
                  {LEVEL_CONFIG[m.level]?.label ?? m.level}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">{m.memberCode} · {m.phone}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground">月业绩</div>
              <div className="text-sm font-bold text-foreground">{Number(m.monthlyVolume ?? 0).toLocaleString()}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BonusesTab() {
  const [year, setYear] = useState(CURRENT_YEAR);
  const [month, setMonth] = useState(CURRENT_MONTH);
  const bonuses = trpc.mlm.bonuses.leaderboard.useQuery({ year, month, limit: 50 });

  return (
    <div className="p-4 space-y-3">
      <div className="flex gap-2">
        <select value={year} onChange={e => setYear(Number(e.target.value))}
          className="flex-1 bg-background border border-border rounded-xl px-3 py-2 text-sm text-foreground outline-none">
          {[CURRENT_YEAR, CURRENT_YEAR - 1].map(y => <option key={y} value={y}>{y}年</option>)}
        </select>
        <select value={month} onChange={e => setMonth(Number(e.target.value))}
          className="flex-1 bg-background border border-border rounded-xl px-3 py-2 text-sm text-foreground outline-none">
          {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}月</option>)}
        </select>
      </div>
      {bonuses.isLoading && <div className="text-center py-8"><Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></div>}
      <div className="space-y-2">
        {(bonuses.data ?? []).map((b: any) => (
          <div key={b.memberId} className="tech-card rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">{b.memberName}</span>
                <span className="text-xs px-1.5 py-0.5 rounded-full"
                  style={{ background: `${LEVEL_CONFIG[b.level]?.color ?? '#374151'}20`, color: LEVEL_CONFIG[b.level]?.color ?? '#6b7280' }}>
                  {LEVEL_CONFIG[b.level]?.label ?? b.level}
                </span>
              </div>
              <span className="text-sm font-bold text-green-400">${Number(b.totalBonus ?? 0).toLocaleString("en", { maximumFractionDigits: 2 })}</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5 text-xs">
              {[
                { label: "零售利润", value: b.retailProfit },
                { label: "批发利润", value: b.wholesaleProfit },
                { label: "皇家权益金", value: b.royaltyOverride },
                { label: "生产奖金", value: b.productionBonus },
              ].map(item => (
                <div key={item.label} className="flex justify-between text-muted-foreground">
                  <span>{item.label}</span>
                  <span className="text-foreground">${Number(item.value ?? 0).toLocaleString("en", { maximumFractionDigits: 2 })}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
        {!bonuses.isLoading && (bonuses.data ?? []).length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm">暂无奖金数据，请先在概览页计算奖金</div>
        )}
      </div>
    </div>
  );
}

function TreeTab() {
  const tree = trpc.mlm.tree.getNode.useQuery({ memberId: undefined });

  const renderNode = (node: any, depth = 0): React.ReactNode => {
    if (!node) return null;
    const color = LEVEL_CONFIG[node.level]?.color ?? "#374151";
    return (
      <div key={node.id} style={{ marginLeft: depth * 16 }} className="mb-1">
        <div className="flex items-center gap-2 p-2 rounded-lg tech-card">
          <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
          <span className="text-xs text-foreground font-medium">{node.name}</span>
          <span className="text-xs px-1.5 py-0.5 rounded-full ml-auto shrink-0"
            style={{ background: `${color}20`, color }}>
            {LEVEL_CONFIG[node.level]?.label ?? node.level}
          </span>
        </div>
        {(node.children ?? []).map((child: any) => renderNode(child, depth + 1))}
      </div>
    );
  };

  return (
    <div className="p-4">
      {tree.isLoading && <div className="text-center py-8"><Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></div>}
      {tree.data && renderNode(tree.data)}
      {!tree.isLoading && !tree.data && (
        <div className="text-center py-8 text-muted-foreground text-sm">暂无组织树数据，请先生成模拟数据</div>
      )}
    </div>
  );
}

function GuideTab() {
  return (
    <div className="p-4 space-y-4">
      <div className="tech-card rounded-2xl p-4">
        <div className="text-sm font-bold text-foreground mb-2">康宝莱营销计划概述</div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          康宝莱（Herbalife）采用8级固定层级制度，会员通过零售产品和发展下线获得多种奖金收益。
          整体奖金拨出率约为73%，是全球最成熟的直销奖金制度之一。
        </p>
      </div>
      <div className="space-y-2">
        {Object.entries(LEVEL_CONFIG).map(([key, cfg]) => (
          <div key={key} className="tech-card rounded-xl p-3 flex items-center gap-3">
            <div className="w-3 h-3 rounded-full shrink-0" style={{ background: cfg.color }} />
            <div className="flex-1">
              <div className="text-sm font-medium text-foreground">{cfg.label}</div>
            </div>
            <div className="text-xs text-muted-foreground">Level {cfg.sortOrder}</div>
          </div>
        ))}
      </div>
      <div className="tech-card rounded-2xl p-4 space-y-2">
        <div className="text-sm font-bold text-foreground mb-2">奖金类型</div>
        {[
          { name: "零售利润", desc: "建议零售价与会员价之差，约25-50%" },
          { name: "批发利润", desc: "下线进货价差，约25%" },
          { name: "皇家权益金", desc: "主管及以上，下线业绩的1-5%" },
          { name: "生产奖金", desc: "世界组及以上，全球业绩分红" },
        ].map(item => (
          <div key={item.name} className="flex gap-2">
            <span className="text-primary text-xs shrink-0">▸</span>
            <div>
              <span className="text-xs font-medium text-foreground">{item.name}：</span>
              <span className="text-xs text-muted-foreground">{item.desc}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function HerbalifeDetail() {
  const [activeTab, setActiveTab] = useState<TabKey>("dashboard");

  const TABS = [
    { key: "dashboard" as TabKey, label: "概览", icon: <BarChart2 className="w-3.5 h-3.5" /> },
    { key: "members" as TabKey, label: "会员", icon: <Users className="w-3.5 h-3.5" /> },
    { key: "bonuses" as TabKey, label: "奖金", icon: <DollarSign className="w-3.5 h-3.5" /> },
    { key: "tree" as TabKey, label: "组织树", icon: <GitBranch className="w-3.5 h-3.5" /> },
    { key: "guide" as TabKey, label: "制度说明", icon: <BookOpen className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <div className="border-b border-border px-4 py-3 flex items-center gap-3 bg-card">
        <Link href="/">
          <button className="text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
        </Link>
        <div className="flex-1">
          <div className="text-sm font-bold text-foreground">康宝莱奖金制度</div>
          <div className="text-xs text-muted-foreground">Herbalife · 8级固定层级模拟研究</div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="border-b border-border overflow-x-auto bg-card">
        <div className="flex min-w-max">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors border-b-2",
                activeTab === tab.key
                  ? "text-primary border-primary"
                  : "text-muted-foreground border-transparent hover:text-foreground"
              )}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "dashboard" && <DashboardTab />}
        {activeTab === "members" && <MembersTab />}
        {activeTab === "bonuses" && <BonusesTab />}
        {activeTab === "tree" && <TreeTab />}
        {activeTab === "guide" && <GuideTab />}
      </div>
    </div>
  );
}
