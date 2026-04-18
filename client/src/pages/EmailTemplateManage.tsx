import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { ChevronLeft, Mail, Eye, Save, RefreshCw, Send } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

// ============================================================
// 默认模板定义
// ============================================================

const DEFAULT_ALERT_VARS = {
  senderName: "好友记 AI 通知",
  headerTitle: "🔔 担保缺口提醒",
  headerSubtitle: "来自好友记 · AI 智能通知",
  greeting: "您好，{userName}！",
  alertTitle: "担保缺口已超过 {gapPct}%",
  tipText:
    "当前担保缺口已达买入价值的 {gapPct}%，建议您尽快与对方沟通，协商补充担保物或安排付息，以保持良好的合作关系。\n\n此提醒仅发送一次，缺口在同一区间内波动不重复通知。缺口完全恢复或进一步扩大时，将再次发送提醒。",
  footerText:
    "此邮件由好友记 AI 智能通知系统自动发送，请勿直接回复。\n如需调整提醒设置，请在 App 内订单详情页操作。",
  subjectTemplate: "【好友记】{coin} 订单担保缺口提醒（已超过 {gapPct}%）",
};

const DEFAULT_BACKUP_VARS = {
  senderName: "脉动共享账本备份",
  headerTitle: "账本自动备份",
  headerSubtitle: "来自好友记 · 账本系统",
  greeting: "您好！",
  bodyText:
    "这是您的账本「{ledgerName}」的定期自动备份，请查收附件中的 Excel 文件。",
  footerText: "此邮件由脉动共享账本系统自动发送，请勿回复。",
  subjectTemplate: "【脉动共享账本备份】{ledgerName} ({date})",
};

// ============================================================
// 渲染预警邮件 HTML
// ============================================================
function renderAlertHtml(vars: typeof DEFAULT_ALERT_VARS, preview = true) {
  const sample = {
    userName: "Yunting",
    coin: "ETH",
    buyValue: "50,000.00",
    collateralValue: "35,000.00",
    accruedInterest: "2,500.00",
    gapAmount: "15,000.00",
    gapPct: "30",
    dateStr: new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }),
  };

  const replace = (s: string) =>
    s
      .replace(/{userName}/g, sample.userName)
      .replace(/{coin}/g, sample.coin)
      .replace(/{gapPct}/g, sample.gapPct)
      .replace(/{buyValue}/g, sample.buyValue)
      .replace(/{gapAmount}/g, sample.gapAmount)
      .replace(/{dateStr}/g, sample.dateStr);

  const tipHtml = replace(vars.tipText)
    .split("\n\n")
    .map((p) => `<p style="margin:0 0 8px">${p}</p>`)
    .join("");

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
body{font-family:-apple-system,BlinkMacSystemFont,'PingFang SC',Arial,sans-serif;background:#f5f5f5;margin:0;padding:${preview ? "0" : "20px"}}
.c{max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)}
.h{background:linear-gradient(135deg,#1A56DB 0%,#3B82F6 100%);padding:28px 24px;text-align:center}
.h h1{color:#fff;font-size:20px;margin:0 0 6px;font-weight:600}
.h p{color:rgba(255,255,255,.85);font-size:13px;margin:0}
.b{padding:24px}
.g{font-size:15px;color:#1A2340;margin-bottom:16px}
.ac{background:#FFF7ED;border:1.5px solid #FED7AA;border-radius:12px;padding:16px;margin-bottom:20px}
.at{display:flex;align-items:center;gap:8px;font-size:15px;font-weight:600;color:#C2410C;margin-bottom:12px}
.dot{width:8px;height:8px;background:#F97316;border-radius:50%;display:inline-block;flex-shrink:0}
.row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #FDE8D0;font-size:13px}
.row:last-child{border-bottom:none}
.lbl{color:#6B7280}.val{font-weight:600;color:#1A2340}
.red{color:#EF4444}.orange{color:#F97316}
.tip{background:#F0F4FF;border-radius:10px;padding:14px 16px;font-size:13px;color:#374151;line-height:1.7;margin-bottom:20px}
.tip strong{color:#1A56DB}
.ft{text-align:center;padding:16px 24px;background:#F9FAFB;font-size:12px;color:#9CA3AF;border-top:1px solid #F3F4F6}
.badge{display:inline-block;background:#EFF6FF;color:#1A56DB;font-size:11px;padding:3px 10px;border-radius:20px;margin-top:4px}
</style></head>
<body><div class="c">
<div class="h"><h1>${replace(vars.headerTitle)}</h1><p>${replace(vars.headerSubtitle)}</p></div>
<div class="b">
<p class="g">${replace(vars.greeting)}</p>
<div class="ac">
  <div class="at"><span class="dot"></span>&nbsp;${replace(vars.alertTitle)}</div>
  <div class="row"><span class="lbl">标的币种</span><span class="val">${sample.coin}</span></div>
  <div class="row"><span class="lbl">买入价值</span><span class="val">${sample.buyValue} U</span></div>
  <div class="row"><span class="lbl">担保物当前价值</span><span class="val">${sample.collateralValue} U</span></div>
  <div class="row"><span class="lbl">待结利息</span><span class="val">${sample.accruedInterest} U</span></div>
  <div class="row"><span class="lbl">担保缺口</span><span class="val red">-${sample.gapAmount} U</span></div>
  <div class="row"><span class="lbl">缺口占比</span><span class="val orange">${sample.gapPct}%</span></div>
</div>
<div class="tip"><strong>温馨提示：</strong>${tipHtml}</div>
<div style="text-align:center"><div class="badge">提醒时间：${sample.dateStr}</div></div>
</div>
<div class="ft">${replace(vars.footerText).replace(/\n/g, "<br>")}</div>
</div></body></html>`;
}

// ============================================================
// 渲染备份邮件 HTML
// ============================================================
function renderBackupHtml(vars: typeof DEFAULT_BACKUP_VARS, preview = true) {
  const sample = {
    ledgerName: "好友记账本",
    date: new Date().toISOString().slice(0, 10),
    totalRecords: "128",
    earliestDate: "2024-01-01",
    latestDate: new Date().toISOString().slice(0, 10),
    totalIncome: "88,000.00",
    totalExpense: "32,000.00",
    balance: "56,000.00",
  };
  const replace = (s: string) =>
    s
      .replace(/{ledgerName}/g, sample.ledgerName)
      .replace(/{date}/g, sample.date);

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
body{font-family:Arial,sans-serif;line-height:1.6;color:#333;background:#f5f5f5;margin:0;padding:${preview ? "0" : "20px"}}
.container{max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)}
.header{background:#D32F2F;color:#fff;padding:20px;text-align:center}
.header h2{margin:0;font-size:20px}
.header p{margin:4px 0 0;font-size:13px;opacity:.85}
.content{background:#f9f9f9;padding:30px;border:1px solid #e0e0e0;border-top:none}
.greeting{font-size:15px;margin-bottom:12px}
.body-text{font-size:14px;color:#555;margin-bottom:20px}
.stats-table{width:100%;border-collapse:collapse;margin:0 0 20px}
.stats-table td{padding:12px;border-bottom:1px solid #e0e0e0;font-size:14px}
.stats-table td:first-child{font-weight:bold;color:#666;width:40%}
.stats-table td:last-child{text-align:right}
.income{color:#4CAF50;font-weight:bold}
.expense{color:#D32F2F;font-weight:bold}
.balance{color:#2196F3;font-weight:bold;font-size:18px}
.footer{text-align:center;padding:20px;color:#999;font-size:12px}
</style></head>
<body><div class="container">
<div class="header"><h2>${replace(vars.headerTitle)}</h2><p>${replace(vars.headerSubtitle)}</p></div>
<div class="content">
<p class="greeting">${replace(vars.greeting)}</p>
<p class="body-text">${replace(vars.bodyText)}</p>
<h3 style="font-size:15px;margin-bottom:12px">备份概览</h3>
<table class="stats-table">
  <tr><td>账本名称</td><td>${sample.ledgerName}</td></tr>
  <tr><td>备份时间</td><td>${sample.date}</td></tr>
  <tr><td>记录总数</td><td>${sample.totalRecords} 条</td></tr>
  <tr><td>时间范围</td><td>${sample.earliestDate} 至 ${sample.latestDate}</td></tr>
  <tr><td>总收入</td><td class="income">+${sample.totalIncome}</td></tr>
  <tr><td>总支出</td><td class="expense">-${sample.totalExpense}</td></tr>
  <tr><td>结余</td><td class="balance">${sample.balance}</td></tr>
</table>
</div>
<div class="footer"><p>${replace(vars.footerText).replace(/\n/g, "<br>")}</p></div>
</div></body></html>`;
}

// ============================================================
// 字段编辑组件
// ============================================================
function FieldRow({
  label,
  value,
  onChange,
  multiline = false,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  hint?: string;
}) {
  return (
    <div className="mb-4">
      <label className="block text-xs font-medium text-gray-500 mb-1">
        {label}
        {hint && <span className="ml-1 text-gray-400 font-normal">{hint}</span>}
      </label>
      {multiline ? (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="text-sm resize-none min-h-[80px]"
          rows={3}
        />
      ) : (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="text-sm h-8"
        />
      )}
    </div>
  );
}

// ============================================================
// 主页面
// ============================================================
export default function EmailTemplateManage() {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<"alert" | "backup">("alert");
  const [alertVars, setAlertVars] = useState(DEFAULT_ALERT_VARS);
  const [backupVars, setBackupVars] = useState(DEFAULT_BACKUP_VARS);
  const [isSaving, setIsSaving] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [showTestInput, setShowTestInput] = useState(false);

  // 从后端加载保存的模板
  const { data: savedTemplates, refetch } = trpc.ledger.getEmailTemplates.useQuery(undefined, {
    onSuccess: (data: any) => {
      if (data?.alert) {
        try {
          setAlertVars({ ...DEFAULT_ALERT_VARS, ...JSON.parse(data.alert) });
        } catch {}
      }
      if (data?.backup) {
        try {
          setBackupVars({ ...DEFAULT_BACKUP_VARS, ...JSON.parse(data.backup) });
        } catch {}
      }
    },
  } as any);

  const saveTemplatesMutation = trpc.ledger.saveEmailTemplates.useMutation({
    onSuccess: () => {
      toast.success("模板已保存");
      setIsSaving(false);
    },
    onError: (e: any) => {
      toast.error(e.message || "保存失败");
      setIsSaving(false);
    },
  });

  const sendTestMutation = trpc.ledger.sendTestEmail.useMutation({
    onSuccess: () => {
      toast.success(`测试邮件已发送至 ${testEmail}`);
      setIsSendingTest(false);
      setShowTestInput(false);
    },
    onError: (e: any) => {
      toast.error(e.message || "发送失败");
      setIsSendingTest(false);
    },
  });

  const handleSave = () => {
    setIsSaving(true);
    saveTemplatesMutation.mutate({
      alert: JSON.stringify(alertVars),
      backup: JSON.stringify(backupVars),
    });
  };

  const handleSendTest = () => {
    if (!testEmail.trim()) {
      toast.error("请输入收件邮箱");
      return;
    }
    setIsSendingTest(true);
    sendTestMutation.mutate({
      type: activeTab,
      toEmail: testEmail.trim(),
      alertVars: JSON.stringify(alertVars),
      backupVars: JSON.stringify(backupVars),
    });
  };

  const handleReset = () => {
    if (activeTab === "alert") setAlertVars(DEFAULT_ALERT_VARS);
    else setBackupVars(DEFAULT_BACKUP_VARS);
    toast.success("已恢复默认");
  };

  const previewHtml =
    activeTab === "alert"
      ? renderAlertHtml(alertVars, true)
      : renderBackupHtml(backupVars, true);

  const currentVars = activeTab === "alert" ? alertVars : backupVars;
  const setCurrentVar = (key: string, value: string) => {
    if (activeTab === "alert") {
      setAlertVars((prev) => ({ ...prev, [key]: value }));
    } else {
      setBackupVars((prev) => ({ ...prev, [key]: value }));
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 顶部导航 */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button
          onClick={() => setLocation(-1 as any)}
          className="p-1 -ml-1 text-gray-500"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 flex-1">
          <Mail className="w-4 h-4 text-blue-500" />
          <span className="font-semibold text-gray-800">邮件模板管理</span>
        </div>
        <button
          onClick={handleReset}
          className="text-xs text-gray-400 flex items-center gap-1"
        >
          <RefreshCw className="w-3 h-3" />
          恢复默认
        </button>
        <Button
          size="sm"
          onClick={handleSave}
          disabled={isSaving}
          className="h-7 px-3 text-xs"
        >
          {isSaving ? (
            <RefreshCw className="w-3 h-3 animate-spin mr-1" />
          ) : (
            <Save className="w-3 h-3 mr-1" />
          )}
          保存
        </Button>
      </div>

      {/* Tab 切换 */}
      <div className="bg-white border-b border-gray-100 px-4">
        <div className="flex gap-0">
          {(
            [
              { key: "alert", label: "预警通知邮件" },
              { key: "backup", label: "账本备份邮件" },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === t.key
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* 主体：手机端上下布局，桌面端左右布局 */}
      <div className="flex-1 flex flex-col lg:flex-row gap-0 lg:gap-4 lg:p-4 overflow-hidden">
        {/* 左侧：字段编辑 */}
        <div className="lg:w-[380px] lg:flex-shrink-0 bg-white lg:rounded-xl lg:shadow-sm overflow-y-auto">
          <div className="p-4">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
              编辑内容
            </div>

            {activeTab === "alert" ? (
              <>
                <FieldRow
                  label="邮件主题"
                  hint="（支持 {coin} {gapPct}）"
                  value={alertVars.subjectTemplate}
                  onChange={(v) => setCurrentVar("subjectTemplate", v)}
                />
                <FieldRow
                  label="发件人名称"
                  value={alertVars.senderName}
                  onChange={(v) => setCurrentVar("senderName", v)}
                />
                <FieldRow
                  label="顶部标题"
                  hint="（支持 emoji）"
                  value={alertVars.headerTitle}
                  onChange={(v) => setCurrentVar("headerTitle", v)}
                />
                <FieldRow
                  label="顶部副标题"
                  value={alertVars.headerSubtitle}
                  onChange={(v) => setCurrentVar("headerSubtitle", v)}
                />
                <FieldRow
                  label="称呼语"
                  hint="（{userName} = 收件人姓名）"
                  value={alertVars.greeting}
                  onChange={(v) => setCurrentVar("greeting", v)}
                />
                <FieldRow
                  label="预警卡片标题"
                  hint="（{gapPct} = 缺口百分比）"
                  value={alertVars.alertTitle}
                  onChange={(v) => setCurrentVar("alertTitle", v)}
                />
                <FieldRow
                  label="温馨提示内容"
                  hint="（空行分段，支持 {gapPct}）"
                  value={alertVars.tipText}
                  onChange={(v) => setCurrentVar("tipText", v)}
                  multiline
                />
                <FieldRow
                  label="底部说明"
                  hint="（换行用回车）"
                  value={alertVars.footerText}
                  onChange={(v) => setCurrentVar("footerText", v)}
                  multiline
                />
              </>
            ) : (
              <>
                <FieldRow
                  label="邮件主题"
                  hint="（{ledgerName} {date}）"
                  value={backupVars.subjectTemplate}
                  onChange={(v) => setCurrentVar("subjectTemplate", v)}
                />
                <FieldRow
                  label="发件人名称"
                  value={backupVars.senderName}
                  onChange={(v) => setCurrentVar("senderName", v)}
                />
                <FieldRow
                  label="顶部标题"
                  value={backupVars.headerTitle}
                  onChange={(v) => setCurrentVar("headerTitle", v)}
                />
                <FieldRow
                  label="顶部副标题"
                  value={backupVars.headerSubtitle}
                  onChange={(v) => setCurrentVar("headerSubtitle", v)}
                />
                <FieldRow
                  label="称呼语"
                  value={backupVars.greeting}
                  onChange={(v) => setCurrentVar("greeting", v)}
                />
                <FieldRow
                  label="正文说明"
                  hint="（{ledgerName} = 账本名）"
                  value={backupVars.bodyText}
                  onChange={(v) => setCurrentVar("bodyText", v)}
                  multiline
                />
                <FieldRow
                  label="底部说明"
                  value={backupVars.footerText}
                  onChange={(v) => setCurrentVar("footerText", v)}
                  multiline
                />
              </>
            )}

            {/* 发送测试邮件 */}
            <div className="mt-2 pt-4 border-t border-gray-100">
              {!showTestInput ? (
                <button
                  onClick={() => setShowTestInput(true)}
                  className="flex items-center gap-2 text-sm text-blue-500 font-medium"
                >
                  <Send className="w-4 h-4" />
                  发送测试邮件
                </button>
              ) : (
                <div className="space-y-2">
                  <div className="text-xs text-gray-500">收件邮箱</div>
                  <div className="flex gap-2">
                    <Input
                      value={testEmail}
                      onChange={(e) => setTestEmail(e.target.value)}
                      placeholder="输入邮箱地址"
                      className="text-sm h-8 flex-1"
                    />
                    <Button
                      size="sm"
                      onClick={handleSendTest}
                      disabled={isSendingTest}
                      className="h-8 px-3 text-xs"
                    >
                      {isSendingTest ? (
                        <RefreshCw className="w-3 h-3 animate-spin" />
                      ) : (
                        "发送"
                      )}
                    </Button>
                    <button
                      onClick={() => setShowTestInput(false)}
                      className="text-xs text-gray-400"
                    >
                      取消
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 右侧：实时预览 */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="bg-white lg:rounded-xl lg:shadow-sm flex-1 flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
              <Eye className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-600">实时预览</span>
              <span className="text-xs text-gray-400 ml-1">（使用示例数据渲染）</span>
            </div>
            <div className="flex-1 overflow-auto bg-gray-100 p-2 lg:p-4">
              <iframe
                srcDoc={previewHtml}
                className="w-full rounded-lg border border-gray-200 bg-white"
                style={{ minHeight: "600px", height: "100%" }}
                sandbox="allow-same-origin"
                title="邮件预览"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
