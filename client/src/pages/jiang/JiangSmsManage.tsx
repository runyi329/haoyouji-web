/**
 * 短信管理中心
 * 路由：/jiang/sms-manage
 * 仅管理员（jiang）可访问
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  MessageSquare, ChevronLeft, CheckCircle, XCircle,
  Clock, Send, RefreshCw, Settings, FileText, Zap, Pencil, Save
} from "lucide-react";

export default function JiangSmsManage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [testPhone, setTestPhone] = useState("");
  const [testTemplateId, setTestTemplateId] = useState("");
  const [activeTab, setActiveTab] = useState<"status" | "templates" | "send">("status");

  const isOwner = user?.username === "jiang";

  // 备注编辑状态：{ [templateId]: string }
  const [editingRemarks, setEditingRemarks] = useState<Record<string, string>>({});
  const [savingRemark, setSavingRemark] = useState<string | null>(null);

  // 获取服务状态
  const { data: statusData, isLoading: statusLoading, refetch: refetchStatus } =
    trpc.smsGetStatus.useQuery(undefined, { enabled: isOwner });

  // 获取模板列表
  const { data: templates, isLoading: templatesLoading, refetch: refetchTemplates } =
    trpc.smsGetTemplates.useQuery(undefined, { enabled: isOwner && activeTab === "templates" });

  // 获取所有模板备注
  const { data: remarks, refetch: refetchRemarks } =
    trpc.smsGetRemarks.useQuery(undefined, { enabled: isOwner && activeTab === "templates" });

  // 保存备注
  const saveRemarkMutation = trpc.smsSaveRemark.useMutation({
    onSuccess: () => {
      toast.success("备注已保存");
      setSavingRemark(null);
      refetchRemarks();
    },
    onError: (err) => {
      toast.error(`保存失败：${err.message}`);
      setSavingRemark(null);
    },
  });

  // 发送测试短信
  const sendTestMutation = trpc.smsSendTest.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`短信发送成功！流水号：${data.serialNo}`);
      } else {
        toast.error(`发送失败：${data.message}`);
      }
    },
    onError: (err) => {
      toast.error(`发送异常：${err.message}`);
    },
  });

  if (!isOwner) {
    return (
      <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center">
        <p className="text-[#444466] text-sm">无权限访问</p>
      </div>
    );
  }

  const handleSendTest = () => {
    if (!testPhone) { toast.error("请输入手机号"); return; }
    if (!testTemplateId) { toast.error("请输入模板ID"); return; }
    sendTestMutation.mutate({ phone: testPhone, templateId: testTemplateId });
  };

  const config = (statusData as any)?.config;

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white">
      {/* 顶部导航 */}
      <div className="bg-[#0d0d14] border-b border-[#D32F2F]/20 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => setLocation("/jiang/profile")}
            className="text-[#666680] hover:text-white transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <MessageSquare className="w-5 h-5 text-[#D32F2F]" />
          <div className="flex-1">
            <div className="text-sm font-bold text-white">短信管理中心</div>
            <div className="text-[10px] text-[#444466]">腾讯云短信服务控制台</div>
          </div>
          <button
            onClick={() => { refetchStatus(); refetchTemplates(); window.location.reload(); }}
            className="text-xs text-[#444466] hover:text-[#D32F2F] transition-colors border border-[#2a2a45] hover:border-[#D32F2F] rounded px-2 py-1"
          >
            刷新
          </button>
        </div>
        {/* Tab 切换 */}
        <div className="max-w-lg mx-auto px-4 flex gap-0 border-t border-[#1e1e35]">
          {[
            { key: "status", label: "服务状态", icon: <Settings className="w-3.5 h-3.5" /> },
            { key: "templates", label: "模板管理", icon: <FileText className="w-3.5 h-3.5" /> },
            { key: "send", label: "发送测试", icon: <Send className="w-3.5 h-3.5" /> },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors border-b-2 ${
                activeTab === tab.key
                  ? "text-[#D32F2F] border-[#D32F2F]"
                  : "text-[#444466] border-transparent hover:text-white"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 pb-24 space-y-4">

        {/* ===== 服务状态 Tab ===== */}
        {activeTab === "status" && (
          <>
            {statusLoading ? (
              <div className="text-center py-8 text-[#444466] text-sm">加载中...</div>
            ) : (
              <>
                {/* 服务状态卡片 */}
                <div className="bg-[#0d0d1a] border border-[#1e1e35] rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[#888899] text-xs font-medium">服务状态</span>
                    {(statusData as any)?.available ? (
                      <div className="flex items-center gap-1.5 bg-green-500/10 border border-green-500/30 rounded-full px-2.5 py-1">
                        <CheckCircle className="w-3 h-3 text-green-400" />
                        <span className="text-green-400 text-xs">正常运行</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 bg-red-500/10 border border-red-500/30 rounded-full px-2.5 py-1">
                        <XCircle className="w-3 h-3 text-red-400" />
                        <span className="text-red-400 text-xs">服务异常</span>
                      </div>
                    )}
                  </div>
                  {!(statusData as any)?.available && (statusData as any)?.reason && (
                    <p className="text-red-400 text-xs bg-red-500/10 rounded-lg px-3 py-2 mt-2">
                      异常原因：{(statusData as any).reason}
                    </p>
                  )}
                </div>

                {/* 当前配置 */}
                {config && (
                  <div className="bg-[#0d0d1a] border border-[#1e1e35] rounded-xl overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-[#1e1e35]">
                      <p className="text-[#444466] text-xs font-medium">当前配置</p>
                    </div>
                    {[
                      { label: "短信 AppId", value: config.appId || "未配置" },
                      { label: "签名", value: config.signName || "未配置" },
                      { label: "默认模板 ID", value: config.templateId || "未配置" },
                      { label: "管理员手机", value: config.adminPhone || "未配置" },
                      { label: "服务区域", value: config.region },
                    ].map((item, i) => (
                      <div key={i} className="flex items-center justify-between px-4 py-3 border-b border-[#1e1e35] last:border-0">
                        <span className="text-[#666680] text-xs">{item.label}</span>
                        <span className="text-white text-xs font-mono">{item.value}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* 当前模板信息 */}
                {(statusData as any)?.template && (
                  <div className="bg-[#0d0d1a] border border-[#1e1e35] rounded-xl overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-[#1e1e35]">
                      <p className="text-[#444466] text-xs font-medium">默认模板详情</p>
                    </div>
                    <div className="p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[#666680] text-xs">模板名称</span>
                        <span className="text-white text-xs">{(statusData as any).template.name}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[#666680] text-xs">模板 ID</span>
                        <span className="text-white text-xs font-mono">{(statusData as any).template.id}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[#666680] text-xs">审核状态</span>
                        <span className={`text-xs ${(statusData as any).template.status === 0 ? "text-green-400" : "text-yellow-400"}`}>
                          {(statusData as any).template.statusText}
                        </span>
                      </div>
                      <div className="mt-2 pt-2 border-t border-[#1e1e35]">
                        <p className="text-[#666680] text-xs mb-1">模板内容</p>
                        <p className="text-white text-xs bg-[#0A0A0F] rounded-lg px-3 py-2 leading-relaxed">
                          {(statusData as any).template.content}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* 说明 */}
                <div className="bg-[#0d0d1a] border border-[#1e1e35] rounded-xl p-4">
                  <div className="flex items-start gap-2">
                    <Zap className="w-4 h-4 text-[#D32F2F] mt-0.5 flex-shrink-0" />
                    <div className="space-y-1">
                      <p className="text-white text-xs font-medium">自动触发规则</p>
                      <p className="text-[#444466] text-xs leading-relaxed">
                        每次服务器重启或部署成功后，自动向管理员手机发送通知短信。
                      </p>
                      <p className="text-[#444466] text-xs leading-relaxed">
                        腾讯云 2024年8月起，通知类短信不再支持变量，内容为固定文字。
                      </p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {/* ===== 模板管理 Tab ===== */}
        {activeTab === "templates" && (
          <>
            {templatesLoading ? (
              <div className="text-center py-8 text-[#444466] text-sm">加载模板中...</div>
            ) : !templates || (templates as any[]).length === 0 ? (
              <div className="text-center py-8 text-[#444466] text-sm">暂无模板数据</div>
            ) : (
              <div className="space-y-3">
                <p className="text-[#444466] text-xs px-1">共 {(templates as any[]).length} 个模板</p>
                {(templates as any[]).map((tpl: any) => (
                  <div key={tpl.id} className="bg-[#0d0d1a] border border-[#1e1e35] rounded-xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-[#1e1e35] flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileText className="w-3.5 h-3.5 text-[#D32F2F]" />
                        <span className="text-white text-sm font-medium">{tpl.name}</span>
                      </div>
                      <div className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
                        tpl.status === 0
                          ? "bg-green-500/10 text-green-400"
                          : tpl.status === 1
                          ? "bg-yellow-500/10 text-yellow-400"
                          : "bg-red-500/10 text-red-400"
                      }`}>
                        {tpl.status === 0 ? <CheckCircle className="w-3 h-3" /> :
                         tpl.status === 1 ? <Clock className="w-3 h-3" /> :
                         <XCircle className="w-3 h-3" />}
                        {tpl.statusText}
                      </div>
                    </div>
                    <div className="p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[#666680] text-xs">模板 ID</span>
                        <span className="text-white text-xs font-mono">{tpl.id}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[#666680] text-xs">创建时间</span>
                        <span className="text-white text-xs">
                          {tpl.createTime ? new Date(tpl.createTime * 1000).toLocaleDateString("zh-CN") : "-"}
                        </span>
                      </div>
                      <div className="mt-2 pt-2 border-t border-[#1e1e35]">
                        <p className="text-[#666680] text-xs mb-1">模板内容</p>
                        <p className="text-white text-xs bg-[#0A0A0F] rounded-lg px-3 py-2 leading-relaxed">
                          {tpl.content}
                        </p>
                      </div>
                      {tpl.reviewReply && (
                        <div className="mt-1 pt-2 border-t border-[#1e1e35]">
                          <p className="text-[#666680] text-xs mb-1">审核备注</p>
                          <p className="text-yellow-400 text-xs">{tpl.reviewReply}</p>
                        </div>
                      )}
                      {/* 功能备注 */}
                      <div className="mt-1 pt-2 border-t border-[#1e1e35]">
                        <div className="flex items-center justify-between mb-1.5">
                          <p className="text-[#666680] text-xs">功能备注</p>
                          <button
                            onClick={() => {
                              const tplId = String(tpl.id);
                              if (editingRemarks[tplId] !== undefined) {
                                // 已在编辑状态，点保存
                                setSavingRemark(tplId);
                                saveRemarkMutation.mutate({ templateId: tplId, remark: editingRemarks[tplId] });
                              } else {
                                // 进入编辑状态
                                setEditingRemarks(prev => ({ ...prev, [tplId]: (remarks as any)?.[tplId] || "" }));
                              }
                            }}
                            className="flex items-center gap-1 text-[#D32F2F] text-xs"
                          >
                            {editingRemarks[String(tpl.id)] !== undefined ? (
                              savingRemark === String(tpl.id) ? (
                                <RefreshCw className="w-3 h-3 animate-spin" />
                              ) : (
                                <><Save className="w-3 h-3" />保存</>
                              )
                            ) : (
                              <><Pencil className="w-3 h-3" />编辑</>
                            )}
                          </button>
                        </div>
                        {editingRemarks[String(tpl.id)] !== undefined ? (
                          <textarea
                            value={editingRemarks[String(tpl.id)]}
                            onChange={(e) => setEditingRemarks(prev => ({ ...prev, [String(tpl.id)]: e.target.value }))}
                            placeholder="如：担保缺口预警通知（AI智能通知功能）"
                            rows={2}
                            className="w-full bg-[#0A0A0F] border border-[#D32F2F]/30 rounded-lg px-3 py-2 text-white text-xs placeholder-[#333355] focus:outline-none focus:border-[#D32F2F]/60 resize-none"
                          />
                        ) : (
                          <p className="text-[#888899] text-xs bg-[#0A0A0F] rounded-lg px-3 py-2 min-h-[32px]">
                            {(remarks as any)?.[String(tpl.id)] || "点击编辑添加备注..."}
                          </p>
                        )}
                      </div>
                      {tpl.status === 0 && (
                        <button
                          onClick={() => {
                            setTestTemplateId(String(tpl.id));
                            setActiveTab("send");
                          }}
                          className="mt-2 w-full flex items-center justify-center gap-1.5 bg-[#D32F2F]/10 border border-[#D32F2F]/30 rounded-lg py-2 text-[#D32F2F] text-xs hover:bg-[#D32F2F]/20 transition-colors"
                        >
                          <Send className="w-3.5 h-3.5" />
                          用此模板发送测试
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ===== 发送测试 Tab ===== */}
        {activeTab === "send" && (
          <>
            <div className="bg-[#0d0d1a] border border-[#1e1e35] rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 border-b border-[#1e1e35]">
                <p className="text-[#444466] text-xs font-medium">手动发送短信</p>
              </div>
              <div className="p-4 space-y-4">
                <div>
                  <label className="text-[#666680] text-xs block mb-1.5">接收手机号</label>
                  <input
                    type="tel"
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                    placeholder="如：13127919173"
                    className="w-full bg-[#0A0A0F] border border-[#1e1e35] rounded-lg px-3 py-2.5 text-white text-sm placeholder-[#333355] focus:outline-none focus:border-[#D32F2F]/50"
                  />
                </div>
                <div>
                  <label className="text-[#666680] text-xs block mb-1.5">模板 ID</label>
                  <input
                    type="text"
                    value={testTemplateId}
                    onChange={(e) => setTestTemplateId(e.target.value)}
                    placeholder="如：2623560"
                    className="w-full bg-[#0A0A0F] border border-[#1e1e35] rounded-lg px-3 py-2.5 text-white text-sm placeholder-[#333355] focus:outline-none focus:border-[#D32F2F]/50"
                  />
                </div>
                <button
                  onClick={handleSendTest}
                  disabled={sendTestMutation.isPending}
                  className="w-full flex items-center justify-center gap-2 bg-[#D32F2F] hover:bg-[#B71C1C] disabled:opacity-50 text-white rounded-xl py-3 text-sm font-medium transition-colors"
                >
                  {sendTestMutation.isPending ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  {sendTestMutation.isPending ? "发送中..." : "立即发送"}
                </button>
              </div>
            </div>

            {/* 快捷填入 */}
            <div className="bg-[#0d0d1a] border border-[#1e1e35] rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 border-b border-[#1e1e35]">
                <p className="text-[#444466] text-xs font-medium">快捷配置</p>
              </div>
              <button
                onClick={() => {
                  setTestPhone(config?.adminPhone || "13127919173");
                  setTestTemplateId(config?.templateId || "2623560");
                  toast.success("已填入管理员默认配置");
                }}
                className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-[#D32F2F]/5 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Zap className="w-4 h-4 text-[#D32F2F]" />
                  <div className="text-left">
                    <div className="text-white text-sm">填入管理员默认配置</div>
                    <div className="text-[#444466] text-[11px]">手机：{config?.adminPhone || "13127919173"} · 模板：{config?.templateId || "2623560"}</div>
                  </div>
                </div>
              </button>
            </div>

            <div className="bg-[#0d0d1a] border border-[#1e1e35] rounded-xl p-4">
              <p className="text-[#444466] text-xs leading-relaxed">
                注意：每次发送会消耗腾讯云短信额度（约0.045元/条）。请勿频繁测试，避免不必要的费用。
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
