// @ts-nocheck
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { mtrpc } from "./mibanTrpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";

const ROLE_LABELS: Record<string, string> = {
  user: "用户",
  agent: "业务员",
  admin: "管理员",
  supplier: "供应商",
};
const ROLE_COLORS: Record<string, string> = {
  user: "border-white/20 text-white/60",
  agent: "border-blue-500/50 text-blue-400",
  admin: "border-[#FF6900]/50 text-[#FF6900]",
  supplier: "border-purple-500/50 text-purple-400",
};

// ─── 用户管理 Tab ─────────────────────────────────────────────────────────────
function UserManagement() {
  const utils = mtrpc.useUtils();
  const { data: users, isLoading } = mtrpc.adminUser.list.useQuery();
  const setRoleMutation = mtrpc.adminUser.setRole.useMutation({
    onSuccess: () => {
      utils.adminUser.list.invalidate();
      toast.success("角色已更新");
    },
    onError: (e) => toast.error(e.message),
  });

  const [search, setSearch] = useState("");
  const filtered = (users ?? []).filter(u =>
    !search || (u.name ?? "").includes(search) || u.openId.includes(search)
  );

  function setRole(userId: number, role: "user" | "parent" | "super_admin" | "supplier") {
    setRoleMutation.mutate({ userId, role });
  }

  return (
    <div className="space-y-4">
      <Input
        placeholder="搜索用户名或ID…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="bg-white/5 border-white/10 text-white placeholder:text-white/30 rounded-xl"
      />
      {isLoading ? (
        <div className="flex justify-center py-8"><Spinner className="w-6 h-6 text-[#FF6900]" /></div>
      ) : !filtered.length ? (
        <div className="text-center py-12 text-white/30 text-sm">暂无用户</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(u => (
            <div key={u.id} className="bg-white/5 border border-white/10 rounded-xl px-4 py-3">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-full bg-[#FF6900]/20 flex items-center justify-center shrink-0">
                  <span className="text-[#FF6900] text-xs font-bold">{(u.name ?? "用").slice(0, 1)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{u.name ?? "匿名用户"}</p>
                  <p className="text-xs text-white/30 truncate">{u.openId}</p>
                </div>
                <Badge variant="outline" className={`text-xs shrink-0 ${ROLE_COLORS[u.role]}`}>
                  {ROLE_LABELS[u.role]}
                </Badge>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-white/30">设为：</span>
                {(["user", "parent", "super_admin"] as const).map(role => (
                  <button
                    key={role}
                    disabled={u.role === role || setRoleMutation.isPending}
                    onClick={() => setRole(u.id, role)}
                    className={`text-xs px-3 py-1 rounded-lg border transition-colors ${
                      u.role === role
                        ? "border-white/20 text-white/30 cursor-default"
                        : "border-white/20 text-white/60 hover:border-[#FF6900]/50 hover:text-[#FF6900] cursor-pointer"
                    }`}
                  >
                    {ROLE_LABELS[role]}
                  </button>
                ))}
                <span className="ml-auto text-xs text-white/30">
                  邀请 {u.inviteCount} 人 · {u.inviteCode ?? "无邀请码"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── 佣金配置 Tab ─────────────────────────────────────────────────────────────
function CommissionConfig() {
  const utils = mtrpc.useUtils();
  const { data: configs, isLoading } = mtrpc.adminCommission.configs.useQuery();
  const { data: agentStats } = mtrpc.adminCommission.agentStats.useQuery();

  const setConfigMutation = mtrpc.adminCommission.setConfig.useMutation({
    onSuccess: () => { utils.adminCommission.configs.invalidate(); toast.success("佣金配置已保存"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteConfigMutation = mtrpc.adminCommission.deleteConfig.useMutation({
    onSuccess: () => { utils.adminCommission.configs.invalidate(); toast.success("已删除"); },
    onError: (e) => toast.error(e.message),
  });

  const [globalMultiplier, setGlobalMultiplier] = useState("");
  const [globalNote, setGlobalNote] = useState("");
  const [agentId, setAgentId] = useState("");
  const [agentRate, setAgentRate] = useState("");
  const [agentNote, setAgentNote] = useState("");

  const globalConfig = configs?.find(c => c.agentId === null);

  function saveGlobal() {
    const multiplier = globalMultiplier ? parseFloat(globalMultiplier) / 100 : 1.0;
    if (isNaN(multiplier) || multiplier < 0 || multiplier > 1) { toast.error("请输入0-100之间的百分比"); return; }
    setConfigMutation.mutate({ agentId: null, payoutRateMultiplier: multiplier, note: globalNote || undefined });
    setGlobalMultiplier(""); setGlobalNote("");
  }

  function saveAgent() {
    const id = parseInt(agentId);
    const rate = parseFloat(agentRate) / 100;
    if (isNaN(id) || id <= 0) { toast.error("请输入有效的业务员用户ID"); return; }
    if (isNaN(rate) || rate < 0 || rate > 1) { toast.error("请输入0-100之间的百分比"); return; }
    setConfigMutation.mutate({ agentId: id, rate, note: agentNote || undefined });
    setAgentId(""); setAgentRate(""); setAgentNote("");
  }

  return (
    <div className="space-y-5">
      {/* 兜底配置 */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">兜底配置</h3>
          {globalConfig && (
            <span className="text-[#FF6900] text-sm font-bold">
              拨出系数：{(Number((globalConfig as any).payoutRateMultiplier ?? 1) * 100).toFixed(0)}%
            </span>
          )}
        </div>
        <p className="text-xs text-white/40">未单独分配团队的人员默认走此配置</p>
        <div className="flex gap-2">
          <Input
            placeholder="拨出系数 % （不填则100%）"
            value={globalMultiplier}
            onChange={e => setGlobalMultiplier(e.target.value)}
            className="bg-black/30 border-white/10 text-white placeholder:text-white/30 rounded-xl"
          />
          <Input
            placeholder="备注（选填）"
            value={globalNote}
            onChange={e => setGlobalNote(e.target.value)}
            className="bg-black/30 border-white/10 text-white placeholder:text-white/30 rounded-xl"
          />
          <Button
            onClick={saveGlobal}
            disabled={setConfigMutation.isPending}
            className="bg-[#FF6900] hover:bg-[#e55f00] text-white rounded-xl shrink-0"
          >
            保存
          </Button>
        </div>
      </div>

      {/* 个人专属比例 */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
        <h3 className="text-sm font-semibold">单独设置业务员比例</h3>
        <p className="text-xs text-white/40">为特定业务员设置专属佣金比例，优先级高于全局默认</p>
        <div className="grid grid-cols-2 gap-2">
          <Input
            placeholder="业务员用户ID"
            value={agentId}
            onChange={e => setAgentId(e.target.value)}
            className="bg-black/30 border-white/10 text-white placeholder:text-white/30 rounded-xl"
          />
          <Input
            placeholder="比例 % (如 8)"
            value={agentRate}
            onChange={e => setAgentRate(e.target.value)}
            className="bg-black/30 border-white/10 text-white placeholder:text-white/30 rounded-xl"
          />
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="备注（选填，如：首次合作优惠）"
            value={agentNote}
            onChange={e => setAgentNote(e.target.value)}
            className="bg-black/30 border-white/10 text-white placeholder:text-white/30 rounded-xl flex-1"
          />
          <Button
            onClick={saveAgent}
            disabled={setConfigMutation.isPending}
            className="bg-[#FF6900] hover:bg-[#e55f00] text-white rounded-xl shrink-0"
          >
            保存
          </Button>
        </div>
      </div>

      {/* 现有配置列表 */}
      {isLoading ? (
        <div className="flex justify-center py-4"><Spinner className="w-6 h-6 text-[#FF6900]" /></div>
      ) : configs && configs.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-xs text-white/40 uppercase tracking-wider">已有配置</h3>
          {configs.map(c => (
            <div key={c.id} className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 flex items-center gap-3">
              <div className="flex-1">
                <p className="text-sm font-medium">
                  {c.agentId === null ? "兜底默认" : `业务员 ID: ${c.agentId}`}
                </p>
                {c.note && <p className="text-xs text-white/40 mt-0.5">{c.note}</p>}
              </div>
              <span className="text-[#FF6900] font-bold text-base">
                {(Number((c as any).payoutRateMultiplier ?? 1) * 100).toFixed(0)}%
              </span>
              <button
                onClick={() => deleteConfigMutation.mutate({ id: c.id })}
                disabled={deleteConfigMutation.isPending}
                className="text-white/30 hover:text-red-400 transition-colors text-sm ml-2"
              >
                删除
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {/* 业务员业绩汇总 */}
      {agentStats && agentStats.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs text-white/40 uppercase tracking-wider">业务员业绩汇总</h3>
          {agentStats.map(a => (
            <div key={a.id} className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{a.name ?? "匿名"}</p>
                <p className="text-xs text-white/40">ID: {a.id} · 推荐 {a.inviteCount} 人 · {a.orderCount} 单</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[#FF6900] font-bold">¥{Number(a.totalCommission).toFixed(2)}</p>
                <p className="text-xs text-yellow-400">待结算 ¥{Number(a.pendingCommission).toFixed(2)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── 主页面 ───────────────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  if (!isAuthenticated || user?.role !== "super_admin") {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-white">
        <div className="text-center">
          <p className="text-white/50 mb-4">此页面仅限管理员访问</p>
          <button onClick={() => setLocation("/")} className="text-[#FF6900] underline">返回首页</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white pb-24">
      {/* 顶部导航 */}
      <div className="sticky top-0 z-10 bg-black/90 backdrop-blur-md border-b border-white/10 px-4 py-3 flex items-center gap-3">
        <button onClick={() => setLocation("/")} className="text-white/60 hover:text-white transition-colors">
          ←
        </button>
        <h1 className="font-semibold text-base">管理员后台</h1>
        <Badge variant="outline" className="ml-auto border-[#FF6900]/50 text-[#FF6900] text-xs">管理员</Badge>
      </div>

      <div className="px-4 py-5">
        <Tabs defaultValue="users">
          <TabsList className="w-full bg-white/5 border border-white/10 rounded-xl mb-5">
            <TabsTrigger value="users" className="flex-1 text-sm data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/50 rounded-lg">
              用户管理
            </TabsTrigger>
            <TabsTrigger value="commission" className="flex-1 text-sm data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/50 rounded-lg">
              佣金配置
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users">
            <UserManagement />
          </TabsContent>

          <TabsContent value="commission">
            <CommissionConfig />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
