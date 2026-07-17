// @ts-nocheck
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { mtrpc } from "./mibanTrpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

const SITE_URL = window.location.origin;

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl p-4 ${accent ? "bg-[#FF6900]" : "bg-white/5 border border-white/10"}`}>
      <p className={`text-xs mb-1 ${accent ? "text-white/70" : "text-white/50"}`}>{label}</p>
      <p className={`text-2xl font-bold ${accent ? "text-white" : "text-white"}`}>{value}</p>
      {sub && <p className={`text-xs mt-1 ${accent ? "text-white/70" : "text-white/40"}`}>{sub}</p>}
    </div>
  );
}

export default function AgentDashboard() {
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  // 权限检查
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-white">
        <div className="text-center">
          <p className="text-white/50 mb-4">请先登录</p>
          <button onClick={() => setLocation("/")} className="text-[#FF6900] underline">返回首页</button>
        </div>
      </div>
    );
  }
  if (user?.role !== "parent" && user?.role !== "super_admin") {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-white">
        <div className="text-center">
          <p className="text-white/50 mb-4">此页面仅限业务员访问</p>
          <button onClick={() => setLocation("/")} className="text-[#FF6900] underline">返回首页</button>
        </div>
      </div>
    );
  }

  return <AgentDashboardInner />;
}

function AgentDashboardInner() {
  const [, setLocation] = useLocation();
  const { data: inviteInfo, isLoading: inviteLoading } = mtrpc.agent.myInviteInfo.useQuery();
  const { data: stats, isLoading: statsLoading } = mtrpc.agent.myMonthlyStats.useQuery();
  const { data: commissions, isLoading: commissionsLoading } = mtrpc.agent.myCommissions.useQuery();
  const { data: referrals, isLoading: referralsLoading } = mtrpc.agent.myReferrals.useQuery();

  const inviteLink = inviteInfo?.inviteCode ? `${SITE_URL}/join?ref=${inviteInfo.inviteCode}` : "";

  function copyLink() {
    if (!inviteLink) return;
    navigator.clipboard.writeText(inviteLink).then(() => toast.success("邀请链接已复制"));
  }

  return (
    <div className="min-h-screen bg-black text-white pb-24">
      {/* 顶部导航 */}
      <div className="sticky top-0 z-10 bg-black/90 backdrop-blur-md border-b border-white/10 px-4 py-3 flex items-center gap-3">
        <button onClick={() => setLocation("/")} className="text-white/60 hover:text-white transition-colors">
          ←
        </button>
        <h1 className="font-semibold text-base">业务员中心</h1>
        <Badge variant="outline" className="ml-auto border-[#FF6900]/50 text-[#FF6900] text-xs">业务员</Badge>
      </div>

      <div className="px-4 py-5 space-y-5">
        {/* 本月收益统计 */}
        <section>
          <h2 className="text-xs text-white/40 uppercase tracking-wider mb-3">本月收益</h2>
          {statsLoading ? (
            <div className="flex justify-center py-6"><Spinner className="w-6 h-6 text-[#FF6900]" /></div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="本月总佣金" value={`¥${Number(stats?.totalCommission ?? 0).toFixed(2)}`} accent />
              <StatCard label="待结算" value={`¥${Number(stats?.pendingCommission ?? 0).toFixed(2)}`} sub="订单完成后结算" />
              <StatCard label="已结算" value={`¥${Number(stats?.settledCommission ?? 0).toFixed(2)}`} />
              <StatCard label="本月订单数" value={`${stats?.orderCount ?? 0} 单`} />
            </div>
          )}
        </section>

        {/* 邀请码 */}
        <section>
          <h2 className="text-xs text-white/40 uppercase tracking-wider mb-3">我的邀请码</h2>
          {inviteLoading ? (
            <div className="flex justify-center py-4"><Spinner className="w-6 h-6 text-[#FF6900]" /></div>
          ) : (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-white/40 mb-1">邀请码</p>
                  <p className="text-3xl font-mono font-bold tracking-[0.2em] text-[#FF6900]">
                    {inviteInfo?.inviteCode ?? "——"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-white/40 mb-1">已推荐</p>
                  <p className="text-2xl font-bold">{inviteInfo?.inviteCount ?? 0}<span className="text-sm text-white/40 ml-1">人</span></p>
                </div>
              </div>

              <div className="bg-black/30 rounded-xl px-3 py-2 flex items-center gap-2">
                <p className="text-xs text-white/50 flex-1 truncate">{inviteLink || "生成中…"}</p>
                <button
                  onClick={copyLink}
                  className="text-xs text-[#FF6900] font-medium shrink-0 hover:text-[#e55f00] transition-colors"
                >
                  复制链接
                </button>
              </div>

              <p className="text-xs text-white/30 text-center">
                分享此链接，好友注册后自动绑定为你的推荐用户
              </p>
            </div>
          )}
        </section>

        {/* Tabs：推荐用户 / 佣金明细 */}
        <section>
          <Tabs defaultValue="referrals">
            <TabsList className="w-full bg-white/5 border border-white/10 rounded-xl mb-4">
              <TabsTrigger value="referrals" className="flex-1 text-sm data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/50 rounded-lg">
                推荐用户 {referrals ? `(${referrals.length})` : ""}
              </TabsTrigger>
              <TabsTrigger value="commissions" className="flex-1 text-sm data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/50 rounded-lg">
                佣金明细 {commissions ? `(${commissions.length})` : ""}
              </TabsTrigger>
            </TabsList>

            {/* 推荐用户列表 */}
            <TabsContent value="referrals">
              {referralsLoading ? (
                <div className="flex justify-center py-8"><Spinner className="w-6 h-6 text-[#FF6900]" /></div>
              ) : !referrals?.length ? (
                <div className="text-center py-12 text-white/30">
                  <p className="text-sm">暂无推荐用户</p>
                  <p className="text-xs mt-1">分享邀请链接，邀请好友加入</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {referrals.map((u) => (
                    <div key={u.id} className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-[#FF6900]/20 flex items-center justify-center shrink-0">
                        <span className="text-[#FF6900] text-sm font-bold">
                          {(u.name ?? "用").slice(0, 1)}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{u.name ?? "匿名用户"}</p>
                        <p className="text-xs text-white/40">
                          {u.createdAt ? new Date(u.createdAt).toLocaleDateString("zh-CN") : ""}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-white/40">已推荐</p>
                        <p className="text-sm font-medium">{u.inviteCount} 人</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* 佣金明细 */}
            <TabsContent value="commissions">
              {commissionsLoading ? (
                <div className="flex justify-center py-8"><Spinner className="w-6 h-6 text-[#FF6900]" /></div>
              ) : !commissions?.length ? (
                <div className="text-center py-12 text-white/30">
                  <p className="text-sm">暂无佣金记录</p>
                  <p className="text-xs mt-1">推荐用户下单后，佣金将在此显示</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {commissions.map((c) => (
                    <div key={c.id} className="bg-white/5 border border-white/10 rounded-xl px-4 py-3">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-mono text-white/60">{c.orderNo}</p>
                        <Badge
                          variant="outline"
                          className={
                            c.status === "settled"
                              ? "border-green-500/50 text-green-400 text-xs"
                              : c.status === "cancelled"
                              ? "border-red-500/50 text-red-400 text-xs"
                              : "border-yellow-500/50 text-yellow-400 text-xs"
                          }
                        >
                          {c.status === "settled" ? "已结算" : c.status === "cancelled" ? "已取消" : "待结算"}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-white/40">
                          订单金额 ¥{Number(c.orderAmount).toFixed(2)} · 比例 {(Number(c.commissionRate) * 100).toFixed(1)}%
                        </p>
                        <p className="text-base font-bold text-[#FF6900]">
                          +¥{Number(c.commissionAmount).toFixed(2)}
                        </p>
                      </div>
                      <p className="text-xs text-white/30 mt-1">
                        {new Date(c.createdAt).toLocaleDateString("zh-CN")}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </section>
      </div>
    </div>
  );
}
