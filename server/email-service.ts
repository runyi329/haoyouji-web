import nodemailer from 'nodemailer';

// SMTP 配置 - 使用 QQ 邮箱
const SMTP_CONFIG = {
  host: 'smtp.qq.com',
  port: 465,
  secure: true,
  auth: {
    user: 'tina_u@qq.com',
    pass: 'wqettalptfmebgdf',
  },
};

// 创建邮件传输器（延迟创建，避免启动时报错）
let _transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!_transporter) {
    _transporter = nodemailer.createTransport(SMTP_CONFIG);
  }
  return _transporter;
}

/**
 * 发送账本备份邮件（带 Excel 附件）
 */
export async function sendBackupEmail(options: {
  to: string;
  ledgerName: string;
  excelBuffer: Buffer;
  stats: {
    totalRecords: number;
    earliestDate: string;
    latestDate: string;
    totalIncome: number;
    totalExpense: number;
    balance: number;
  };
}): Promise<void> {
  const { to, ledgerName, excelBuffer, stats } = options;
  
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const filename = `${ledgerName}_账目备份_${dateStr}.xlsx`;
  
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #D32F2F; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background-color: #f9f9f9; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px; }
    .stats-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    .stats-table td { padding: 12px; border-bottom: 1px solid #e0e0e0; }
    .stats-table td:first-child { font-weight: bold; color: #666; width: 40%; }
    .stats-table td:last-child { text-align: right; }
    .income { color: #4CAF50; font-weight: bold; }
    .expense { color: #D32F2F; font-weight: bold; }
    .balance { color: #2196F3; font-weight: bold; font-size: 18px; }
    .footer { text-align: center; padding: 20px; color: #999; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>账本自动备份</h2>
    </div>
    <div class="content">
      <p>您好！</p>
      <p>这是您的账本「${ledgerName}」的定期自动备份，请查收附件中的 Excel 文件。</p>
      
      <h3>备份概览</h3>
      <table class="stats-table">
        <tr>
          <td>账本名称</td>
          <td>${ledgerName}</td>
        </tr>
        <tr>
          <td>备份时间</td>
          <td>${dateStr}</td>
        </tr>
        <tr>
          <td>记录总数</td>
          <td>${stats.totalRecords} 条</td>
        </tr>
        <tr>
          <td>时间范围</td>
          <td>${stats.earliestDate || '无'} 至 ${stats.latestDate || '无'}</td>
        </tr>
        <tr>
          <td>总收入</td>
          <td class="income">+${stats.totalIncome.toFixed(2)}</td>
        </tr>
        <tr>
          <td>总支出</td>
          <td class="expense">-${stats.totalExpense.toFixed(2)}</td>
        </tr>
        <tr>
          <td>结余</td>
          <td class="balance">${stats.balance.toFixed(2)}</td>
        </tr>
      </table>
    </div>
    <div class="footer">
      <p>此邮件由脉动共享账本系统自动发送，请勿回复。</p>
    </div>
  </div>
</body>
</html>
  `;
  
  const transporter = getTransporter();
  
  await transporter.sendMail({
    from: `"脉动共享账本备份" <${SMTP_CONFIG.auth.user}>`,
    to,
    subject: `【脉动共享账本备份】${ledgerName} (${dateStr})`,
    html: htmlContent,
    attachments: [
      {
        filename,
        content: excelBuffer,
      },
    ],
  });
  
  console.log(`[sendBackupEmail] 邮件已发送至 ${to}`);
}


// ============================================================
// AJ账本（76号）专用备份邮件
// ============================================================
export async function sendAJBackupEmail(options: {
  to: string;
  companyName: string;
  excelBuffer: Buffer;
  stats: {
    totalRecords: number;
    startDate: string;
    endDate: string;
    totalAmount: number;
    approvedCount: number;
    pendingCount: number;
    rejectedCount: number;
  };
}): Promise<void> {
  const { to, companyName, excelBuffer, stats } = options;

  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const filename = `${companyName}_报销申请单备份_${dateStr}.xlsx`;

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', Arial, sans-serif; background-color: #f0f2f5; color: #333; }
    .wrapper { max-width: 600px; margin: 0 auto; padding: 20px; }
    .card { background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(26,43,74,0.12); }
    .header { background: linear-gradient(135deg, #1A2B4A 0%, #243660 100%); padding: 28px 24px; text-align: center; }
    .header-badge { display: inline-block; background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.25); border-radius: 20px; padding: 4px 14px; font-size: 12px; color: rgba(255,255,255,0.8); margin-bottom: 12px; letter-spacing: 1px; }
    .header h1 { color: #fff; font-size: 22px; font-weight: 700; margin-bottom: 6px; letter-spacing: 1px; }
    .header p { color: rgba(255,255,255,0.7); font-size: 13px; }
    .company-banner { background: linear-gradient(135deg, #1A2B4A 0%, #2d4a8a 100%); padding: 16px 24px; display: flex; align-items: center; gap: 12px; }
    .company-icon { width: 40px; height: 40px; background: rgba(255,255,255,0.15); border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0; }
    .company-info { flex: 1; }
    .company-name { color: #fff; font-size: 15px; font-weight: 600; }
    .company-label { color: rgba(255,255,255,0.6); font-size: 11px; margin-top: 2px; }
    .body { padding: 24px; }
    .greeting { font-size: 14px; color: #555; line-height: 1.8; margin-bottom: 20px; }
    .section-title { font-size: 13px; font-weight: 600; color: #1A2B4A; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 2px solid #1A2B4A; }
    .stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; }
    .stat-card { background: #f8f9fc; border-radius: 12px; padding: 14px; border: 1px solid #e8ecf4; }
    .stat-label { font-size: 11px; color: #888; margin-bottom: 4px; }
    .stat-value { font-size: 18px; font-weight: 700; color: #1A2B4A; }
    .stat-card.full { grid-column: 1 / -1; }
    .stat-card.highlight { background: linear-gradient(135deg, #1A2B4A, #243660); border: none; }
    .stat-card.highlight .stat-label { color: rgba(255,255,255,0.7); }
    .stat-card.highlight .stat-value { color: #fff; font-size: 22px; }
    .status-row { display: flex; gap: 8px; margin-bottom: 20px; }
    .status-badge { flex: 1; text-align: center; padding: 10px 6px; border-radius: 10px; }
    .status-badge .badge-count { font-size: 20px; font-weight: 700; }
    .status-badge .badge-label { font-size: 11px; margin-top: 3px; }
    .status-pending { background: #fff8e6; }
    .status-pending .badge-count { color: #f59e0b; }
    .status-pending .badge-label { color: #92400e; }
    .status-approved { background: #e8f5e9; }
    .status-approved .badge-count { color: #22c55e; }
    .status-approved .badge-label { color: #166534; }
    .status-rejected { background: #fef2f2; }
    .status-rejected .badge-count { color: #ef4444; }
    .status-rejected .badge-label { color: #991b1b; }
    .info-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    .info-table td { padding: 11px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px; }
    .info-table td:first-child { color: #888; width: 35%; }
    .info-table td:last-child { color: #333; font-weight: 500; text-align: right; }
    .attachment-tip { background: #f0f4ff; border: 1px solid #c7d7ff; border-radius: 10px; padding: 14px 16px; display: flex; align-items: center; gap: 10px; margin-bottom: 20px; }
    .attachment-tip .tip-icon { font-size: 22px; }
    .attachment-tip .tip-text { font-size: 13px; color: #3b5bdb; line-height: 1.5; }
    .footer { background: #f8f9fc; padding: 16px 24px; text-align: center; border-top: 1px solid #eee; }
    .footer p { font-size: 11px; color: #aaa; line-height: 1.8; }
    .footer .brand { color: #1A2B4A; font-weight: 600; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <!-- 头部 -->
      <div class="header">
        <div class="header-badge">Ai-OA 报销系统</div>
        <h1>报销申请单备份</h1>
        <p>备份时间：${dateStr}</p>
      </div>

      <!-- 企业名称横幅 -->
      <div class="company-banner">
        <div class="company-icon">🏢</div>
        <div class="company-info">
          <div class="company-name">${companyName}</div>
          <div class="company-label">开票单位</div>
        </div>
      </div>

      <!-- 正文 -->
      <div class="body">
        <p class="greeting">您好，以下是 <strong>${companyName}</strong> 在 ${stats.startDate} 至 ${stats.endDate} 期间的报销申请单备份，详细数据请查收附件 Excel 文件。</p>

        <!-- 核心统计 -->
        <div class="section-title">备份概览</div>
        <div class="stats-grid">
          <div class="stat-card highlight full">
            <div class="stat-label">报销总金额</div>
            <div class="stat-value">¥${stats.totalAmount.toFixed(2)}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">申请单总数</div>
            <div class="stat-value">${stats.totalRecords} 笔</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">时间范围</div>
            <div class="stat-value" style="font-size:13px; padding-top:4px;">${stats.startDate}<br>至 ${stats.endDate}</div>
          </div>
        </div>

        <!-- 审批状态分布 -->
        <div class="section-title">审批状态分布</div>
        <div class="status-row">
          <div class="status-badge status-pending">
            <div class="badge-count">${stats.pendingCount}</div>
            <div class="badge-label">待审核</div>
          </div>
          <div class="status-badge status-approved">
            <div class="badge-count">${stats.approvedCount}</div>
            <div class="badge-label">已审批</div>
          </div>
          <div class="status-badge status-rejected">
            <div class="badge-count">${stats.rejectedCount}</div>
            <div class="badge-label">已驳回</div>
          </div>
        </div>

        <!-- 附件提示 -->
        <div class="attachment-tip">
          <div class="tip-icon">📎</div>
          <div class="tip-text">附件 <strong>${filename}</strong> 包含所有报销申请单的完整字段，包括开票单位、税号、报销金额、申请人、员工编号、报销事由、报销类目、会计科目及审批状态。</div>
        </div>
      </div>

      <!-- 底部 -->
      <div class="footer">
        <p>此邮件由 <span class="brand">Ai-OA 报销系统</span> 自动发送，请勿直接回复。</p>
        <p>如有疑问，请联系您的账本管理员。</p>
      </div>
    </div>
  </div>
</body>
</html>
  `;

  const transporter = getTransporter();

  await transporter.sendMail({
    from: `"Ai-OA 报销系统备份" <${SMTP_CONFIG.auth.user}>`,
    to,
    subject: `【报销备份】${companyName} ${stats.startDate} 至 ${stats.endDate}（共${stats.totalRecords}笔）`,
    html: htmlContent,
    attachments: [
      {
        filename,
        content: excelBuffer,
      },
    ],
  });

  console.log(`[sendAJBackupEmail] 邮件已发送至 ${to}`);
}
// ============================================================
// 预警邮件（支持自定义模板变量）
// ============================================================
export async function sendAlertEmail(options: {
  to: string;
  userName: string;
  coin: string;
  buyValue: number;
  collateralValue: number;
  accruedInterest: number;
  gapAmount: number;
  gapPct: number;
  templateVars?: Record<string, string>;
}): Promise<void> {
  const { to, userName, coin, buyValue, collateralValue, accruedInterest, gapAmount, gapPct, templateVars = {} } = options;

  const defaults = {
    senderName: '好友记 AI 通知',
    headerTitle: '🔔 担保缺口提醒',
    headerSubtitle: '来自好友记 · AI 智能通知',
    greeting: '您好，{userName}！',
    alertTitle: '担保缺口已超过 {gapPct}%',
    tipText: '当前担保缺口已达买入价值的 {gapPct}%，建议您尽快与对方沟通，协商补充担保物或安排付息，以保持良好的合作关系。\n\n此提醒仅发送一次，缺口在同一区间内波动不重复通知。缺口完全恢复或进一步扩大时，将再次发送提醒。',
    footerText: '此邮件由好友记 AI 智能通知系统自动发送，请勿直接回复。\n如需调整提醒设置，请在 App 内订单详情页操作。',
    subjectTemplate: '《好友记》{coin} 订单担保缺口提醒（已超过 {gapPct}%）',
  };

  const vars = { ...defaults, ...templateVars };
  const now = new Date();
  const dateStr = now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

  const replace = (s: string) =>
    s
      .replace(/{userName}/g, userName)
      .replace(/{coin}/g, coin)
      .replace(/{gapPct}/g, String(gapPct))
      .replace(/{dateStr}/g, dateStr);

  const tipHtml = replace(vars.tipText)
    .split('\n\n')
    .map((p) => `<p style="margin:0 0 8px">${p}</p>`)
    .join('');

  const subject = replace(vars.subjectTemplate);

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
body{font-family:-apple-system,BlinkMacSystemFont,'PingFang SC',Arial,sans-serif;background:#f5f5f5;margin:0;padding:20px}
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
  <div class="row"><span class="lbl">标的币种</span><span class="val">${coin}</span></div>
  <div class="row"><span class="lbl">买入价值</span><span class="val">${buyValue.toFixed(2)} U</span></div>
  <div class="row"><span class="lbl">担保物当前价值</span><span class="val">${collateralValue.toFixed(2)} U</span></div>
  <div class="row"><span class="lbl">待结利息</span><span class="val">${accruedInterest.toFixed(2)} U</span></div>
  <div class="row"><span class="lbl">担保缺口</span><span class="val red">-${gapAmount.toFixed(2)} U</span></div>
  <div class="row"><span class="lbl">缺口占比</span><span class="val orange">${gapPct}%</span></div>
</div>
<div class="tip"><strong>温馨提示：</strong>${tipHtml}</div>
<div style="text-align:center"><div class="badge">提醒时间：${dateStr}</div></div>
</div>
<div class="ft">${replace(vars.footerText).replace(/\n/g, '<br>')}</div>
</div></body></html>`;

  const transporter = getTransporter();
  await transporter.sendMail({
    from: `"${vars.senderName}" <${SMTP_CONFIG.auth.user}>`,
    to,
    subject,
    html,
  });
  console.log(`[sendAlertEmail] 邮件已发送至 ${to}`);
}

// ============================================================
// 备份测试邮件
// ============================================================
export async function sendBackupTestEmail(options: {
  to: string;
  templateVars?: Record<string, string>;
}): Promise<void> {
  const { to, templateVars = {} } = options;
  const defaults = {
    senderName: '脉动共享账本备份',
    headerTitle: '账本自动备份',
    headerSubtitle: '来自好友记 · 账本系统',
    greeting: '您好！',
    bodyText: '这是您的账本「{ledgerName}」的定期自动备份，请查收附件中的 Excel 文件。',
    footerText: '此邮件由脉动共享账本系统自动发送，请勿回复。',
    subjectTemplate: '《脉动共享账本备份》{ledgerName} ({date})',
  };
  const vars = { ...defaults, ...templateVars };
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const ledgerName = '测试账本';
  const replace = (s: string) =>
    s.replace(/{ledgerName}/g, ledgerName).replace(/{date}/g, dateStr);

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
body{font-family:Arial,sans-serif;line-height:1.6;color:#333;background:#f5f5f5;margin:0;padding:20px}
.container{max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)}
.header{background:#D32F2F;color:#fff;padding:20px;text-align:center}
.header h2{margin:0;font-size:20px}
.header p{margin:4px 0 0;font-size:13px;opacity:.85}
.content{background:#f9f9f9;padding:30px;border:1px solid #e0e0e0;border-top:none}
.footer{text-align:center;padding:20px;color:#999;font-size:12px}
</style></head>
<body><div class="container">
<div class="header"><h2>${replace(vars.headerTitle)}</h2><p>${replace(vars.headerSubtitle)}</p></div>
<div class="content">
<p>${replace(vars.greeting)}</p>
<p>${replace(vars.bodyText)}</p>
<p style="color:#888;font-size:13px">此为测试邮件，实际备份时将附带 Excel 文件。</p>
</div>
<div class="footer"><p>${replace(vars.footerText).replace(/\n/g, '<br>')}</p></div>
</div></body></html>`;

  const transporter = getTransporter();
  await transporter.sendMail({
    from: `"${vars.senderName}" <${SMTP_CONFIG.auth.user}>`,
    to,
    subject: replace(vars.subjectTemplate),
    html,
  });
  console.log(`[sendBackupTestEmail] 邮件已发送至 ${to}`);
}
