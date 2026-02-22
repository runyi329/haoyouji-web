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
      <p>此邮件由好友记系统自动发送，请勿回复。</p>
    </div>
  </div>
</body>
</html>
  `;
  
  const transporter = getTransporter();
  
  await transporter.sendMail({
    from: `"好友记" <${SMTP_CONFIG.auth.user}>`,
    to,
    subject: `【好友记】账本备份 - ${ledgerName} (${dateStr})`,
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
