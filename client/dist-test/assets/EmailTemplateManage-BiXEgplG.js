import{u as P,r as d,t as f,i as g,j as e,P as I,C as V,R as T,E as B}from"./index-CmrjsFiC.js";import{B as M}from"./button-BZhx2i-o.js";import{I as w}from"./input-BBln-owa.js";import{T as O}from"./textarea-Ds9TlFjJ.js";import{M as R}from"./mail-CKxJh3-Y.js";import{S as U}from"./save-DlL9DFQJ.js";import{S as H}from"./send-D_PBKWbp.js";import"./dialog-HZwsOiKu.js";import"./index-cJ1WAts2.js";import"./index-DBqlXRPL.js";import"./index-R_y1bWZT.js";import"./index-d2f1Ayoa.js";import"./tslib.es6-Rd0XlZNF.js";import"./useComposition-aXS1Fgcq.js";const v={senderName:"好友记 AI 通知",headerTitle:"🔔 担保缺口提醒",headerSubtitle:"来自好友记 · AI 智能通知",greeting:"您好，{userName}！",alertTitle:"担保缺口已超过 {gapPct}%",tipText:`当前担保缺口已达买入价值的 {gapPct}%，建议您尽快与对方沟通，协商补充担保物或安排付息，以保持良好的合作关系。

此提醒仅发送一次，缺口在同一区间内波动不重复通知。缺口完全恢复或进一步扩大时，将再次发送提醒。`,footerText:`此邮件由好友记 AI 智能通知系统自动发送，请勿直接回复。
如需调整提醒设置，请在 App 内订单详情页操作。`,subjectTemplate:"【好友记】{coin} 订单担保缺口提醒（已超过 {gapPct}%）"},E={senderName:"脉动共享账本备份",headerTitle:"账本自动备份",headerSubtitle:"来自好友记 · 账本系统",greeting:"您好！",bodyText:"这是您的账本「{ledgerName}」的定期自动备份，请查收附件中的 Excel 文件。",footerText:"此邮件由脉动共享账本系统自动发送，请勿回复。",subjectTemplate:"【脉动共享账本备份】{ledgerName} ({date})"};function J(l,o=!0){const t={userName:"Yunting",coin:"ETH",buyValue:"50,000.00",collateralValue:"35,000.00",accruedInterest:"2,500.00",gapAmount:"15,000.00",gapPct:"30",dateStr:new Date().toLocaleString("zh-CN",{timeZone:"Asia/Shanghai"})},s=c=>c.replace(/{userName}/g,t.userName).replace(/{coin}/g,t.coin).replace(/{gapPct}/g,t.gapPct).replace(/{buyValue}/g,t.buyValue).replace(/{gapAmount}/g,t.gapAmount).replace(/{dateStr}/g,t.dateStr),n=s(l.tipText).split(`

`).map(c=>`<p style="margin:0 0 8px">${c}</p>`).join("");return`<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
body{font-family:-apple-system,BlinkMacSystemFont,'PingFang SC',Arial,sans-serif;background:#f5f5f5;margin:0;padding:${o?"0":"20px"}}
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
<div class="h"><h1>${s(l.headerTitle)}</h1><p>${s(l.headerSubtitle)}</p></div>
<div class="b">
<p class="g">${s(l.greeting)}</p>
<div class="ac">
  <div class="at"><span class="dot"></span>&nbsp;${s(l.alertTitle)}</div>
  <div class="row"><span class="lbl">标的币种</span><span class="val">${t.coin}</span></div>
  <div class="row"><span class="lbl">买入价值</span><span class="val">${t.buyValue} U</span></div>
  <div class="row"><span class="lbl">担保物当前价值</span><span class="val">${t.collateralValue} U</span></div>
  <div class="row"><span class="lbl">待结利息</span><span class="val">${t.accruedInterest} U</span></div>
  <div class="row"><span class="lbl">担保缺口</span><span class="val red">-${t.gapAmount} U</span></div>
  <div class="row"><span class="lbl">缺口占比</span><span class="val orange">${t.gapPct}%</span></div>
</div>
<div class="tip"><strong>温馨提示：</strong>${n}</div>
<div style="text-align:center"><div class="badge">提醒时间：${t.dateStr}</div></div>
</div>
<div class="ft">${s(l.footerText).replace(/\n/g,"<br>")}</div>
</div></body></html>`}function L(l,o=!0){const t={ledgerName:"好友记账本",date:new Date().toISOString().slice(0,10),totalRecords:"128",earliestDate:"2024-01-01",latestDate:new Date().toISOString().slice(0,10),totalIncome:"88,000.00",totalExpense:"32,000.00",balance:"56,000.00"},s=n=>n.replace(/{ledgerName}/g,t.ledgerName).replace(/{date}/g,t.date);return`<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
body{font-family:Arial,sans-serif;line-height:1.6;color:#333;background:#f5f5f5;margin:0;padding:${o?"0":"20px"}}
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
<div class="header"><h2>${s(l.headerTitle)}</h2><p>${s(l.headerSubtitle)}</p></div>
<div class="content">
<p class="greeting">${s(l.greeting)}</p>
<p class="body-text">${s(l.bodyText)}</p>
<h3 style="font-size:15px;margin-bottom:12px">备份概览</h3>
<table class="stats-table">
  <tr><td>账本名称</td><td>${t.ledgerName}</td></tr>
  <tr><td>备份时间</td><td>${t.date}</td></tr>
  <tr><td>记录总数</td><td>${t.totalRecords} 条</td></tr>
  <tr><td>时间范围</td><td>${t.earliestDate} 至 ${t.latestDate}</td></tr>
  <tr><td>总收入</td><td class="income">+${t.totalIncome}</td></tr>
  <tr><td>总支出</td><td class="expense">-${t.totalExpense}</td></tr>
  <tr><td>结余</td><td class="balance">${t.balance}</td></tr>
</table>
</div>
<div class="footer"><p>${s(l.footerText).replace(/\n/g,"<br>")}</p></div>
</div></body></html>`}function r({label:l,value:o,onChange:t,multiline:s=!1,hint:n}){return e.jsxs("div",{"data-loc":"client/src/pages/EmailTemplateManage.tsx:186",className:"mb-4",children:[e.jsxs("label",{"data-loc":"client/src/pages/EmailTemplateManage.tsx:187",className:"block text-xs font-medium text-gray-500 mb-1",children:[l,n&&e.jsx("span",{"data-loc":"client/src/pages/EmailTemplateManage.tsx:189",className:"ml-1 text-gray-400 font-normal",children:n})]}),s?e.jsx(O,{"data-loc":"client/src/pages/EmailTemplateManage.tsx:192",value:o,onChange:c=>t(c.target.value),className:"text-sm resize-none min-h-[80px]",rows:3}):e.jsx(w,{"data-loc":"client/src/pages/EmailTemplateManage.tsx:199",value:o,onChange:c=>t(c.target.value),className:"text-sm h-8"})]})}function ie(){P();const[l,o]=d.useState("alert"),[t,s]=d.useState(v),[n,c]=d.useState(E),[y,x]=d.useState(!1),[j,b]=d.useState(!1),[m,S]=d.useState(""),[k,h]=d.useState(!1),{data:p,refetch:_}=f.ledger.getEmailTemplates.useQuery(void 0);d.useEffect(()=>{if(p){if(p.alert)try{s({...v,...JSON.parse(p.alert)})}catch{}if(p.backup)try{c({...E,...JSON.parse(p.backup)})}catch{}}},[p]);const F=f.ledger.saveEmailTemplates.useMutation({onSuccess:()=>{g.success("模板已保存"),x(!1),setTimeout(()=>window.history.back(),800)},onError:a=>{g.error(a.message||"保存失败"),x(!1)}}),C=f.ledger.sendTestEmail.useMutation({onSuccess:()=>{g.success(`测试邮件已发送至 ${m}`),b(!1),h(!1)},onError:a=>{g.error(a.message||"发送失败"),b(!1)}}),A=()=>{x(!0),F.mutate({alert:JSON.stringify(t),backup:JSON.stringify(n)})},$=()=>{if(!m.trim()){g.error("请输入收件邮箱");return}b(!0),C.mutate({type:l,toEmail:m.trim(),alertVars:JSON.stringify(t),backupVars:JSON.stringify(n)})},z=()=>{l==="alert"?s(v):c(E),g.success("已恢复默认")},D=l==="alert"?J(t,!0):L(n,!0),i=(a,N)=>{l==="alert"?s(u=>({...u,[a]:N})):c(u=>({...u,[a]:N}))};return e.jsxs("div",{"data-loc":"client/src/pages/EmailTemplateManage.tsx:309",className:"min-h-screen bg-gray-50 flex flex-col",children:[e.jsx(I,{"data-loc":"client/src/pages/EmailTemplateManage.tsx:310",code:"P089"}),e.jsxs("div",{"data-loc":"client/src/pages/EmailTemplateManage.tsx:312",className:"bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 sticky top-0 z-10",children:[e.jsx("button",{"data-loc":"client/src/pages/EmailTemplateManage.tsx:313",onClick:()=>window.history.back(),className:"p-1 -ml-1 text-gray-500",children:e.jsx(V,{"data-loc":"client/src/pages/EmailTemplateManage.tsx:317",className:"w-5 h-5"})}),e.jsxs("div",{"data-loc":"client/src/pages/EmailTemplateManage.tsx:319",className:"flex items-center gap-2 flex-1",children:[e.jsx(R,{"data-loc":"client/src/pages/EmailTemplateManage.tsx:320",className:"w-4 h-4 text-blue-500"}),e.jsx("span",{"data-loc":"client/src/pages/EmailTemplateManage.tsx:321",className:"font-semibold text-gray-800",children:"邮件模板管理"})]}),e.jsxs("button",{"data-loc":"client/src/pages/EmailTemplateManage.tsx:323",onClick:z,className:"text-xs text-gray-400 flex items-center gap-1",children:[e.jsx(T,{"data-loc":"client/src/pages/EmailTemplateManage.tsx:327",className:"w-3 h-3"}),"恢复默认"]}),e.jsxs(M,{"data-loc":"client/src/pages/EmailTemplateManage.tsx:330",size:"sm",onClick:A,disabled:y,className:"h-7 px-3 text-xs",children:[y?e.jsx(T,{"data-loc":"client/src/pages/EmailTemplateManage.tsx:337",className:"w-3 h-3 animate-spin mr-1"}):e.jsx(U,{"data-loc":"client/src/pages/EmailTemplateManage.tsx:339",className:"w-3 h-3 mr-1"}),"保存"]})]}),e.jsx("div",{"data-loc":"client/src/pages/EmailTemplateManage.tsx:346",className:"bg-white border-b border-gray-100 px-4",children:e.jsx("div",{"data-loc":"client/src/pages/EmailTemplateManage.tsx:347",className:"flex gap-0",children:[{key:"alert",label:"预警通知邮件"},{key:"backup",label:"账本备份邮件"}].map(a=>e.jsx("button",{"data-loc":"client/src/pages/EmailTemplateManage.tsx:354",onClick:()=>o(a.key),className:`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${l===a.key?"border-blue-500 text-blue-600":"border-transparent text-gray-500"}`,children:a.label},a.key))})}),e.jsxs("div",{"data-loc":"client/src/pages/EmailTemplateManage.tsx:370",className:"flex-1 flex flex-col lg:flex-row gap-0 lg:gap-4 lg:p-4 overflow-hidden",children:[e.jsx("div",{"data-loc":"client/src/pages/EmailTemplateManage.tsx:372",className:"lg:w-[380px] lg:flex-shrink-0 bg-white lg:rounded-xl lg:shadow-sm overflow-y-auto",children:e.jsxs("div",{"data-loc":"client/src/pages/EmailTemplateManage.tsx:373",className:"p-4",children:[e.jsx("div",{"data-loc":"client/src/pages/EmailTemplateManage.tsx:374",className:"text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4",children:"编辑内容"}),l==="alert"?e.jsxs(e.Fragment,{children:[e.jsx(r,{"data-loc":"client/src/pages/EmailTemplateManage.tsx:380",label:"邮件主题",hint:"（支持 {coin} {gapPct}）",value:t.subjectTemplate,onChange:a=>i("subjectTemplate",a)}),e.jsx(r,{"data-loc":"client/src/pages/EmailTemplateManage.tsx:386",label:"发件人名称",value:t.senderName,onChange:a=>i("senderName",a)}),e.jsx(r,{"data-loc":"client/src/pages/EmailTemplateManage.tsx:391",label:"顶部标题",hint:"（支持 emoji）",value:t.headerTitle,onChange:a=>i("headerTitle",a)}),e.jsx(r,{"data-loc":"client/src/pages/EmailTemplateManage.tsx:397",label:"顶部副标题",value:t.headerSubtitle,onChange:a=>i("headerSubtitle",a)}),e.jsx(r,{"data-loc":"client/src/pages/EmailTemplateManage.tsx:402",label:"称呼语",hint:"（{userName} = 收件人姓名）",value:t.greeting,onChange:a=>i("greeting",a)}),e.jsx(r,{"data-loc":"client/src/pages/EmailTemplateManage.tsx:408",label:"预警卡片标题",hint:"（{gapPct} = 缺口百分比）",value:t.alertTitle,onChange:a=>i("alertTitle",a)}),e.jsx(r,{"data-loc":"client/src/pages/EmailTemplateManage.tsx:414",label:"温馨提示内容",hint:"（空行分段，支持 {gapPct}）",value:t.tipText,onChange:a=>i("tipText",a),multiline:!0}),e.jsx(r,{"data-loc":"client/src/pages/EmailTemplateManage.tsx:421",label:"底部说明",hint:"（换行用回车）",value:t.footerText,onChange:a=>i("footerText",a),multiline:!0})]}):e.jsxs(e.Fragment,{children:[e.jsx(r,{"data-loc":"client/src/pages/EmailTemplateManage.tsx:431",label:"邮件主题",hint:"（{ledgerName} {date}）",value:n.subjectTemplate,onChange:a=>i("subjectTemplate",a)}),e.jsx(r,{"data-loc":"client/src/pages/EmailTemplateManage.tsx:437",label:"发件人名称",value:n.senderName,onChange:a=>i("senderName",a)}),e.jsx(r,{"data-loc":"client/src/pages/EmailTemplateManage.tsx:442",label:"顶部标题",value:n.headerTitle,onChange:a=>i("headerTitle",a)}),e.jsx(r,{"data-loc":"client/src/pages/EmailTemplateManage.tsx:447",label:"顶部副标题",value:n.headerSubtitle,onChange:a=>i("headerSubtitle",a)}),e.jsx(r,{"data-loc":"client/src/pages/EmailTemplateManage.tsx:452",label:"称呼语",value:n.greeting,onChange:a=>i("greeting",a)}),e.jsx(r,{"data-loc":"client/src/pages/EmailTemplateManage.tsx:457",label:"正文说明",hint:"（{ledgerName} = 账本名）",value:n.bodyText,onChange:a=>i("bodyText",a),multiline:!0}),e.jsx(r,{"data-loc":"client/src/pages/EmailTemplateManage.tsx:464",label:"底部说明",value:n.footerText,onChange:a=>i("footerText",a),multiline:!0})]}),e.jsx("div",{"data-loc":"client/src/pages/EmailTemplateManage.tsx:474",className:"mt-2 pt-4 border-t border-gray-100",children:k?e.jsxs("div",{"data-loc":"client/src/pages/EmailTemplateManage.tsx:484",className:"space-y-2",children:[e.jsx("div",{"data-loc":"client/src/pages/EmailTemplateManage.tsx:485",className:"text-xs text-gray-500",children:"收件邮箱"}),e.jsxs("div",{"data-loc":"client/src/pages/EmailTemplateManage.tsx:486",className:"flex gap-2",children:[e.jsx(w,{"data-loc":"client/src/pages/EmailTemplateManage.tsx:487",value:m,onChange:a=>S(a.target.value),placeholder:"输入邮箱地址",className:"text-sm h-8 flex-1"}),e.jsx(M,{"data-loc":"client/src/pages/EmailTemplateManage.tsx:493",size:"sm",onClick:$,disabled:j,className:"h-8 px-3 text-xs",children:j?e.jsx(T,{"data-loc":"client/src/pages/EmailTemplateManage.tsx:500",className:"w-3 h-3 animate-spin"}):"发送"}),e.jsx("button",{"data-loc":"client/src/pages/EmailTemplateManage.tsx:505",onClick:()=>h(!1),className:"text-xs text-gray-400",children:"取消"})]})]}):e.jsxs("button",{"data-loc":"client/src/pages/EmailTemplateManage.tsx:476",onClick:()=>h(!0),className:"flex items-center gap-2 text-sm text-blue-500 font-medium",children:[e.jsx(H,{"data-loc":"client/src/pages/EmailTemplateManage.tsx:480",className:"w-4 h-4"}),"发送测试邮件"]})})]})}),e.jsx("div",{"data-loc":"client/src/pages/EmailTemplateManage.tsx:519",className:"flex-1 flex flex-col min-h-0",children:e.jsxs("div",{"data-loc":"client/src/pages/EmailTemplateManage.tsx:520",className:"bg-white lg:rounded-xl lg:shadow-sm flex-1 flex flex-col overflow-hidden",children:[e.jsxs("div",{"data-loc":"client/src/pages/EmailTemplateManage.tsx:521",className:"px-4 py-3 border-b border-gray-100 flex items-center gap-2",children:[e.jsx(B,{"data-loc":"client/src/pages/EmailTemplateManage.tsx:522",className:"w-4 h-4 text-gray-400"}),e.jsx("span",{"data-loc":"client/src/pages/EmailTemplateManage.tsx:523",className:"text-sm font-medium text-gray-600",children:"实时预览"}),e.jsx("span",{"data-loc":"client/src/pages/EmailTemplateManage.tsx:524",className:"text-xs text-gray-400 ml-1",children:"（使用示例数据渲染）"})]}),e.jsx("div",{"data-loc":"client/src/pages/EmailTemplateManage.tsx:526",className:"flex-1 overflow-auto bg-gray-100 p-2 lg:p-4",children:e.jsx("iframe",{"data-loc":"client/src/pages/EmailTemplateManage.tsx:527",srcDoc:D,className:"w-full rounded-lg border border-gray-200 bg-white",style:{minHeight:"600px",height:"100%"},sandbox:"allow-same-origin",title:"邮件预览"})})]})})]})]})}export{ie as default};
