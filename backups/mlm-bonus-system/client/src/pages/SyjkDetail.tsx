/**
 * 数研金控「让利制」无限代奖金系统
 */
import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  ChevronLeft, Users, DollarSign, TrendingUp, GitBranch, Loader2,
  RefreshCw, BookOpen, BarChart2, Settings, Play
} from "lucide-react";
import { toast } from "sonner";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from "recharts";

const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth() + 1;
const DEPTH_COLORS = ["#3b82f6", "#6366f1", "#8b5cf6", "#a855f7", "#ec4899", "#f43f5e", "#ef4444"];

type TabKey = "dashboard" | "members" | "bonuses" | "tree" | "settings" | "guide";

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: "dashboard", label: "概览", icon: <BarChart2 className="w-3.5 h-3.5" /> },
  { key: "members", label: "会员", icon: <Users className="w-3.5 h-3.5" /> },
  { key: "bonuses", label: "奖金", icon: <DollarSign className="w-3.5 h-3.5" /> },
  { key: "tree", label: "组织树", icon: <GitBranch className="w-3.5 h-3.5" /> },
  { key: "settings", label: "配置", icon: <Settings className="w-3.5 h-3.5" /> },
  { key: "guide", label: "制度说明", icon: <BookOpen className="w-3.5 h-3.5" /> },
];

function DashboardTab() {
  const [year] = useState(CURRENT_YEAR);
  const [month] = useState(CURRENT_MONTH);
  const { data: stats, refetch: refetchStats } = trpc.mlm.syjk.getStats.useQuery({ year, month });
  const { data: bonusResults, refetch: refetchBonus } = trpc.mlm.syjk.getBonusResults.useQuery({ year, month });
  const { data: config } = trpc.mlm.syjk.getConfig.useQuery();

  const seedMutation = trpc.mlm.syjk.seed.useMutation({
    onSuccess: (data: any) => { toast.success(`模拟数据生成成功：${data.message}`); refetchStats(); refetchBonus(); },
    onError: (e: any) => toast.error(`生成失败：${e.message}`),
  });
  const calcMutation = trpc.mlm.syjk.calculateBonuses.useMutation({
    onSuccess: (data: any) => {
      toast.success(`奖金计算完成：共 ${data.calculated} 人，总奖金 ¥${data.totalBonus.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`);
      refetchStats(); refetchBonus();
    },
    onError: (e: any) => toast.error(`计算失败：${e.message}`),
  });

  const hasData = (stats?.totalMembers ?? 0) > 0;
  const topBonus = (bonusResults ?? []).slice(0, 8);
  const depthData = (stats?.depthDistribution ?? []).map((d: any, i: number) => ({
    name: `第${d.depth}代`, value: d.count, color: DEPTH_COLORS[i % DEPTH_COLORS.length]
  }));

  return (
    <div className="p-4 space-y-4">
      <div className="flex gap-2">
        <button onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending}
          className="flex items-center gap-1.5 bg-[#3b82f6] text-white text-sm px-4 py-2 rounded-xl font-medium">
          {seedMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          生成模拟数据
        </button>
        {hasData && (
          <button onClick={() => calcMutation.mutate({ year, month })} disabled={calcMutation.isPending}
            className="flex items-center gap-1.5 bg-[#1e1e35] border border-[#2a2a40] text-white text-sm px-4 py-2 rounded-xl font-medium">
            {calcMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            计算本月奖金
          </button>
        )}
      </div>

      {config && (
        <div className="bg-[#0d0d1a] border border-[#1e1e35] rounded-xl p-3 flex items-center gap-3">
          <div className="text-[10px] text-[#666680]">初始比例上限</div>
          <div className="text-sm font-bold text-blue-400 ml-auto">{config.initialRate ?? 25}%</div>
          <div className="text-[10px] text-[#666680]">·</div>
          <div className="text-[10px] text-[#666680]">{year}年{month}月</div>
        </div>
      )}

      {!hasData && (
        <div className="bg-[#0d0d1a] border border-dashed border-blue-500/30 rounded-2xl p-8 text-center">
          <GitBranch className="w-10 h-10 text-blue-500/50 mx-auto mb-3" />
          <div className="text-sm font-bold text-white mb-1">数研金控让利制奖金系统</div>
          <p className="text-[11px] text-[#666680] leading-relaxed max-w-xs mx-auto">
            点击「生成模拟数据」，系统将创建多层级虚拟会员，模拟无限代让利制的奖金分配逻辑。
          </p>
        </div>
      )}

      {hasData && (
        <>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "总会员数", value: stats?.totalMembers ?? 0, icon: <Users className="w-4 h-4 text-blue-400" />, bg: "bg-blue-400/10" },
              { label: "最大深度", value: `${stats?.maxDepth ?? 0} 代`, icon: <GitBranch className="w-4 h-4 text-purple-400" />, bg: "bg-purple-400/10" },
              { label: "总业绩", value: `¥${Number(stats?.totalRevenue ?? 0).toLocaleString("zh-CN", { maximumFractionDigits: 0 })}`, icon: <TrendingUp className="w-4 h-4 text-green-400" />, bg: "bg-green-400/10" },
              { label: "总奖金", value: `¥${Number(stats?.totalBonus ?? 0).toLocaleString("zh-CN", { maximumFractionDigits: 0 })}`, icon: <DollarSign className="w-4 h-4 text-amber-400" />, bg: "bg-amber-400/10" },
            ].map(card => (
              <div key={card.label} className="bg-[#0d0d1a] border border-[#1e1e35] rounded-2xl p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-[#666680]">{card.label}</span>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center ${card.bg}`}>{card.icon}</div>
                </div>
                <div className="text-lg font-bold text-white">{card.value}</div>
              </div>
            ))}
          </div>

          {depthData.length > 0 && (
            <div className="bg-[#0d0d1a] border border-[#1e1e35] rounded-2xl p-4">
              <div className="text-sm font-bold text-white mb-3">层级人数分布</div>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={depthData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e1e35" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#666680" }} />
                  <YAxis tick={{ fontSize: 10, fill: "#666680" }} />
                  <Tooltip formatter={(v: number) => [`${v} 人`, "人数"]} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {depthData.map((entry: any, i: number) => <Cell key={i} fill={entry.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {topBonus.length > 0 && (
            <div className="bg-[#0d0d1a] border border-[#1e1e35] rounded-2xl p-4">
              <div className="text-sm font-bold text-white mb-3">奖金排行 Top 8</div>
              <div className="space-y-2">
                {topBonus.map((item: any, i: number) => (
                  <div key={item.memberId} className="flex items-center gap-3 p-2.5 rounded-xl bg-[#0a0a14]">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                      style={{ background: DEPTH_COLORS[i % DEPTH_COLORS.length] }}>
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-white truncate">{item.memberName}</div>
                      <div className="text-[10px] text-[#666680]">第 {item.depth} 代</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-green-400">¥{Number(item.bonusAmount ?? 0).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}</div>
                      <div className="text-[10px] text-[#666680]">实留 {Number(item.retainedRate ?? 0).toFixed(1)}%</div>
                    </div>
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
  const members = trpc.mlm.syjk.listMembers.useQuery({ search: search || undefined, pageSize: 100 });

  return (
    <div className="p-4 space-y-3">
      <input
        className="w-full bg-[#0d0d1a] border border-[#1e1e35] rounded-xl px-3 py-2 text-sm text-white placeholder-[#444466] outline-none"
        placeholder="搜索会员姓名或编号..."
        value={search}
        onChange={e => setSearch(e.target.value)}
      />
      {members.isLoading && <div className="text-center py-8"><Loader2 className="w-5 h-5 animate-spin mx-auto text-[#666680]" /></div>}
      <div className="space-y-2">
        {(members.data?.members ?? []).map((m: any) => (
          <div key={m.id} className="bg-[#0d0d1a] border border-[#1e1e35] rounded-xl p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
              style={{ background: DEPTH_COLORS[(m.depth ?? 0) % DEPTH_COLORS.length] }}>
              {m.name?.charAt(0) ?? "?"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-white">{m.name}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400">第 {m.depth ?? 0} 代</span>
              </div>
              <div className="text-[10px] text-[#666680]">{m.memberId} · 让利比 {Number(m.receivedRate ?? 0).toFixed(1)}%</div>
            </div>
          </div>
        ))}
        {!members.isLoading && (members.data?.members ?? []).length === 0 && (
          <div className="text-center py-8 text-[#666680] text-sm">暂无会员数据，请先生成模拟数据</div>
        )}
      </div>
    </div>
  );
}

function BonusesTab() {
  const [year, setYear] = useState(CURRENT_YEAR);
  const [month, setMonth] = useState(CURRENT_MONTH);
  const bonuses = trpc.mlm.syjk.getBonusResults.useQuery({ year, month });

  return (
    <div className="p-4 space-y-3">
      <div className="flex gap-2">
        <select value={year} onChange={e => setYear(Number(e.target.value))}
          className="flex-1 bg-[#0d0d1a] border border-[#1e1e35] rounded-xl px-3 py-2 text-sm text-white outline-none">
          {[CURRENT_YEAR, CURRENT_YEAR - 1].map(y => <option key={y} value={y}>{y}年</option>)}
        </select>
        <select value={month} onChange={e => setMonth(Number(e.target.value))}
          className="flex-1 bg-[#0d0d1a] border border-[#1e1e35] rounded-xl px-3 py-2 text-sm text-white outline-none">
          {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}月</option>)}
        </select>
      </div>
      {bonuses.isLoading && <div className="text-center py-8"><Loader2 className="w-5 h-5 animate-spin mx-auto text-[#666680]" /></div>}
      <div className="space-y-2">
        {(bonuses.data ?? []).map((b: any) => (
          <div key={b.memberId} className="bg-[#0d0d1a] border border-[#1e1e35] rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <div>
                <span className="text-sm font-medium text-white">{b.memberName}</span>
                <span className="text-[10px] text-[#666680] ml-2">第 {b.depth} 代</span>
              </div>
              <span className="text-sm font-bold text-green-400">¥{Number(b.bonusAmount ?? 0).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5 text-[10px]">
              <div className="flex justify-between text-[#666680]"><span>业绩基数</span><span className="text-white">¥{Number(b.revenueBase ?? 0).toLocaleString("zh-CN", { maximumFractionDigits: 0 })}</span></div>
              <div className="flex justify-between text-[#666680]"><span>实留比例</span><span className="text-white">{Number(b.retainedRate ?? 0).toFixed(2)}%</span></div>
              <div className="flex justify-between text-[#666680]"><span>让利比例</span><span className="text-white">{Number(b.receivedRateSnapshot ?? 0).toFixed(2)}%</span></div>
            </div>
          </div>
        ))}
        {!bonuses.isLoading && (bonuses.data ?? []).length === 0 && (
          <div className="text-center py-8 text-[#666680] text-sm">暂无奖金数据，请先在概览页计算奖金</div>
        )}
      </div>
    </div>
  );
}

function TreeTab() {
  const tree = trpc.mlm.syjk.getTree.useQuery({ rootId: undefined });

  const renderNode = (node: any, depth = 0): React.ReactNode => {
    if (!node) return null;
    const color = DEPTH_COLORS[depth % DEPTH_COLORS.length];
    return (
      <div key={node.id} style={{ marginLeft: depth * 14 }} className="mb-1">
        <div className="flex items-center gap-2 p-2 rounded-lg bg-[#0d0d1a] border border-[#1e1e35]">
          <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
          <span className="text-xs text-white font-medium">{node.name}</span>
          <span className="text-[10px] text-[#666680] ml-auto">让利 {Number(node.receivedRate ?? 0).toFixed(1)}%</span>
        </div>
        {(node.children ?? []).map((child: any) => renderNode(child, depth + 1))}
      </div>
    );
  };

  return (
    <div className="p-4">
      {tree.isLoading && <div className="text-center py-8"><Loader2 className="w-5 h-5 animate-spin mx-auto text-[#666680]" /></div>}
      {(() => {
        const nodes = Array.isArray(tree.data) ? tree.data : (tree.data ? [tree.data] : []);
        if (nodes.length > 0) return nodes.map((n: any) => renderNode(n, 0));
        if (!tree.isLoading) return <div className="text-center py-8 text-[#666680] text-sm">暂无组织树数据，请先生成模拟数据</div>;
        return null;
      })()}
    </div>
  );
}

function SettingsTab() {
  const { data: config, refetch } = trpc.mlm.syjk.getConfig.useQuery();
  const [rate, setRate] = useState<number>(25);
  const setConfig = trpc.mlm.syjk.setConfig.useMutation({
    onSuccess: () => { toast.success("配置已保存"); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="p-4 space-y-4">
      <div className="bg-[#0d0d1a] border border-[#1e1e35] rounded-2xl p-4">
        <div className="text-sm font-bold text-white mb-3">让利制参数配置</div>
        <div className="space-y-3">
          <div>
            <label className="text-[11px] text-[#666680] block mb-1">初始让利比例上限（%）</label>
            <div className="flex gap-2">
              <input type="number" min={1} max={100} defaultValue={config?.initialRate ?? 25}
                onChange={e => setRate(Number(e.target.value))}
                className="flex-1 bg-[#0a0a14] border border-[#2a2a40] rounded-xl px-3 py-2 text-sm text-white outline-none" />
              <button onClick={() => setConfig.mutate({ initialRate: rate })} disabled={setConfig.isPending}
                className="bg-blue-600 text-white text-sm px-4 py-2 rounded-xl font-medium">
                {setConfig.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "保存"}
              </button>
            </div>
          </div>
          <p className="text-[10px] text-[#666680] leading-relaxed">
            当前配置：初始比例上限 <span className="text-blue-400">{config?.initialRate ?? 25}%</span>。每向下一代，让利比例递减，确保上级始终保留部分收益。
          </p>
        </div>
      </div>
    </div>
  );
}

function GuideTab() {
  return (
    <div className="p-4 space-y-4">
      <div className="bg-[#0d0d1a] border border-[#1e1e35] rounded-2xl p-4">
        <div className="text-sm font-bold text-white mb-2">数研金控让利制概述</div>
        <p className="text-[11px] text-[#888899] leading-relaxed">
          数研金控采用无限代深度让利制，核心逻辑是：每个节点将自身让利比例的一部分向下传递，
          自己保留差额部分作为奖金。层级越深，让利比例越低，形成自然的收益递减结构。
        </p>
      </div>
      <div className="bg-[#0d0d1a] border border-[#1e1e35] rounded-2xl p-4 space-y-3">
        <div className="text-sm font-bold text-white">核心规则</div>
        {[
          { title: "无限代深度", desc: "不限制层级数量，理论上可无限延伸" },
          { title: "动态比例分配", desc: "每代让利比例由上级决定，不超过自身让利比例" },
          { title: "实留奖金", desc: "节点奖金 = 业绩基数 × (自身让利比 - 给下级让利比)" },
          { title: "月度核算", desc: "每月独立计算，支持历史数据回溯" },
          { title: "链路追溯", desc: "每笔奖金均记录完整的上下游链路" },
        ].map(item => (
          <div key={item.title} className="flex gap-2">
            <span className="text-blue-400 text-xs shrink-0">▸</span>
            <div>
              <span className="text-xs font-medium text-white">{item.title}：</span>
              <span className="text-[11px] text-[#666680]">{item.desc}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SyjkDetail() {
  const [activeTab, setActiveTab] = useState<TabKey>("dashboard");

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white flex flex-col">
      <div className="bg-[#0d0d14]/95 border-b border-blue-500/20 backdrop-blur-sm px-4 py-3 flex items-center gap-3">
        <Link href="/" className="text-[#666680] hover:text-white transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <div className="text-sm font-bold text-white">数研金控让利制</div>
          <div className="text-[10px] text-[#666680]">SYJK · 无限代让利制奖金模拟研究</div>
        </div>
      </div>

      <div className="bg-[#0d0d14] border-b border-[#1e1e35] overflow-x-auto">
        <div className="flex min-w-max">
          {TABS.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors border-b-2 ${
                activeTab === tab.key ? "text-blue-400 border-blue-400" : "text-[#666680] border-transparent hover:text-white"
              }`}>
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === "dashboard" && <DashboardTab />}
        {activeTab === "members" && <MembersTab />}
        {activeTab === "bonuses" && <BonusesTab />}
        {activeTab === "tree" && <TreeTab />}
        {activeTab === "settings" && <SettingsTab />}
        {activeTab === "guide" && <GuideTab />}
      </div>
    </div>
  );
}
