export type LoanServiceContact = {
  provider: string;
  businessLabel: string;
  primaryPhone?: string;
  phoneLabel?: string;
  serviceHours: string;
  humanGuide: string;
  sourceUrl?: string;
  sourceTitle?: string;
  note?: string;
};

const normalizeBankName = (name: string) => name
  .trim()
  .replace(/銀/g, "银")
  .replace(/購/g, "购")
  .replace(/廣/g, "广");

const creditCardContacts: Record<string, LoanServiceContact> = {
  "工商银行": { provider: "中国工商银行", businessLabel: "信用卡客服", primaryPhone: "95588", phoneLabel: "贵宾专线：400-66-95588；境外：+86-10-95588", serviceHours: "7×24 小时", humanGuide: "信用卡服务可按 9 后按 2；如语音菜单调整，请按语音提示转人工。", sourceUrl: "https://icbc.com.cn/page/721852476184887344.html", sourceTitle: "中国工商银行信用卡电话银行服务介绍" },
  "建设银行": { provider: "中国建设银行", businessLabel: "信用卡客服", primaryPhone: "400-820-0588", phoneLabel: "非 400 服务区：021-38690588；境外：+86-21-3869-0588", serviceHours: "7×24 小时", humanGuide: "官方未公开固定转人工按键，请进入信用卡语音服务后按提示办理或转人工。", sourceUrl: "https://www2.ccb.com/chn/2023-03/20/article_2023032012022060117.shtml", sourceTitle: "建设银行信用卡电话联系" },
  "中国银行": { provider: "中国银行", businessLabel: "信用卡客服", primaryPhone: "4006695566", phoneLabel: "境外：+86-10-66085566", serviceHours: "7×24 小时", humanGuide: "官方未公开固定转人工按键，请按信用卡语音提示操作。", sourceUrl: "https://www.boc.cn/custserv/cs1/200812/t20081212_257687.html", sourceTitle: "中国银行联系我们" },
  "农业银行": { provider: "中国农业银行", businessLabel: "信用卡客服", primaryPhone: "4006695599", phoneLabel: "白金贵宾：4006195599；境外：+86-21-61195599", serviceHours: "7×24 小时", humanGuide: "官方未公开固定转人工按键，请按信用卡语音提示操作。", sourceUrl: "https://www.abchina.com/cn/aboutabc/contactus/", sourceTitle: "中国农业银行联系我们" },
  "交通银行": { provider: "交通银行", businessLabel: "信用卡客服", primaryPhone: "400-800-9888", phoneLabel: "境外：+86-21-28283888", serviceHours: "7×24 小时", humanGuide: "官方未公开固定转人工按键，请按信用卡语音提示操作。", sourceUrl: "https://creditcard.bankcomm.com/content/index.html?device=pc", sourceTitle: "交通银行信用卡官网" },
  "邮储银行": { provider: "中国邮政储蓄银行", businessLabel: "信用卡客服", primaryPhone: "40088-95580", phoneLabel: "也可拨打：95580", serviceHours: "7×24 小时", humanGuide: "进入语音服务后可按 0 进入人工服务与投诉建议。", sourceUrl: "https://www.psbc.com/cn/common/xfzqybhzl/khtszn/", sourceTitle: "邮储银行客户投诉指南" },
  "招商银行": { provider: "招商银行", businessLabel: "信用卡客服", primaryPhone: "400-820-5555", phoneLabel: "境外：+86-4008205555 或 +86-21-38784800", serviceHours: "7×24 小时", humanGuide: "官方未公开固定转人工按键，请按信用卡语音提示操作。", sourceUrl: "https://cc.cmbchina.com/content/cusservice/131.htm", sourceTitle: "招商银行信用卡境外拨打服务热线" },
  "平安银行": { provider: "平安银行", businessLabel: "信用卡客服", primaryPhone: "95511", phoneLabel: "信用卡服务请转 2；贵宾专线：4008895511；海外：+86-755-29595511", serviceHours: "7×24 小时", humanGuide: "拨打 95511 后按 2 进入信用卡服务；如需人工可按语音提示继续操作。", sourceUrl: "http://creditcard.pingan.com/yongkazhinan/qudao.shtml", sourceTitle: "平安银行信用卡电话和短信营业厅" },
  "兴业银行": { provider: "兴业银行", businessLabel: "信用卡客服", primaryPhone: "95561", phoneLabel: "贵宾专线：400-8895-561；境外：+86-21-38769999", serviceHours: "7×24 小时", humanGuide: "拨通后选择信用卡服务并按语音提示转人工。", sourceUrl: "https://creditcard.cib.com.cn/guide/customers/services.html", sourceTitle: "兴业银行信用卡客户服务" },
  "中信银行": { provider: "中信银行", businessLabel: "信用卡客服", primaryPhone: "40088-95558", phoneLabel: "白金专线：4006095558；境外/固话：0755-82380730", serviceHours: "7×24 小时", humanGuide: "常见路径为按 1 后按 0；菜单可能更新，请以语音提示为准。", sourceUrl: "https://creditcard.ecitic.com/lianxiwomen.shtml", sourceTitle: "中信银行信用卡联系我们" },
  "浦发银行": { provider: "浦发银行", businessLabel: "信用卡客服", primaryPhone: "400-820-8788", phoneLabel: "手机、港澳台及境外：021-38784988 / +86-21-38784988", serviceHours: "7×24 小时", humanGuide: "官方未公开固定转人工按键，请按信用卡语音提示操作。", sourceUrl: "https://ccc.spdb.com.cn/service/zsxt_918/dcfw/", sourceTitle: "浦发银行信用卡多重服务" },
  "民生银行": { provider: "中国民生银行", businessLabel: "信用卡客服", primaryPhone: "400-66-95568", phoneLabel: "境外：+86-10-63767198", serviceHours: "7×24 小时", humanGuide: "官方未公开固定转人工按键，请按信用卡语音提示操作。", sourceUrl: "https://creditcard.cmbc.com.cn/active/web/wonderful/active/tuzxPC/index.html", sourceTitle: "民生信用卡咨询服务与投诉渠道" },
  "光大银行": { provider: "中国光大银行", businessLabel: "信用卡客服", primaryPhone: "95595", phoneLabel: "信用卡请转 8；境外：4008-1-95595 加拨 86", serviceHours: "7×24 小时", humanGuide: "拨打 95595 后转 8 进入信用卡服务，再按语音提示转人工。", sourceUrl: "https://www.cebbank.com/site/gryw/cgjr/634500/29480938/index.html", sourceTitle: "光大银行阳光国际信用卡" },
  "华夏银行": { provider: "华夏银行", businessLabel: "信用卡客服", primaryPhone: "400-66-95577", phoneLabel: "海外：+86-10-66209577", serviceHours: "7×24 小时", humanGuide: "官方未公开固定转人工按键，请按信用卡语音提示操作。", sourceUrl: "https://creditcard.hxb.com.cn/card/cn/xyksy/kfrx/2017/02/3459.shtml", sourceTitle: "华夏银行信用卡客服热线" },
  "广发银行": { provider: "广发银行", businessLabel: "信用卡客服", primaryPhone: "95508", phoneLabel: "境外：0086-20-87310029", serviceHours: "7×24 小时", humanGuide: "官方未公开固定转人工按键，请按信用卡语音提示操作。", sourceUrl: "https://www.cgbchina.com.cn/Info/13356934", sourceTitle: "广发银行 95508 服务公告" },
  "浙商银行": { provider: "浙商银行", businessLabel: "信用卡客服", primaryPhone: "95527", phoneLabel: "境外：+86-10-95527、+86-571-95527", serviceHours: "7×24 小时", humanGuide: "官方未公开固定转人工按键，请按信用卡语音提示操作。", sourceUrl: "http://www.czbank.com/cn/pub_info/contactus/", sourceTitle: "浙商银行联系我们" },
  "上海银行": { provider: "上海银行", businessLabel: "信用卡客服", primaryPhone: "95594", phoneLabel: "境外：+86-21-66614500", serviceHours: "7×24 小时", humanGuide: "请按信用卡语音提示转人工。", note: "号码已核验，具体人工按键请以最新语音菜单为准。" },
  "北京银行": { provider: "北京银行", businessLabel: "信用卡客服", primaryPhone: "400-660-1169", phoneLabel: "海外：+86-10-66226789", serviceHours: "7×24 小时", humanGuide: "官方未公开固定转人工按键，请按信用卡语音提示操作。", sourceUrl: "https://www.bankofbeijing.com.cn/creditcard", sourceTitle: "北京银行信用卡官网" },
  "宁波银行": { provider: "宁波银行", businessLabel: "信用卡客服", primaryPhone: "4000095574", phoneLabel: "境外：+86-574-95574", serviceHours: "7×24 小时；全业务 8:00–22:00，紧急业务为其余时段", humanGuide: "官方未公开固定转人工按键，请按信用卡语音提示操作。", sourceUrl: "https://www.nbcb.com.cn/creditcard/client_service/service_hotline/", sourceTitle: "宁波银行信用卡服务热线" },
  "南京银行": { provider: "南京银行", businessLabel: "信用卡客服", primaryPhone: "95302", phoneLabel: "境外：+86-25-95302", serviceHours: "全年 7×24 小时", humanGuide: "官方未公开固定转人工按键，请按信用卡语音提示操作。", sourceUrl: "https://www.njcb.com.cn/njcb/grjr/_301371/ylkcpjs/xyxyk/index.html", sourceTitle: "南京银行信用卡" },
  "江苏银行": { provider: "江苏银行", businessLabel: "信用卡客服", primaryPhone: "95319", serviceHours: "官方未单列公开人工服务时间", humanGuide: "官方未公开固定转人工按键，请按信用卡语音提示操作。", sourceUrl: "https://www.jsbchina.cn/cms/CN/zygg/6787.html", sourceTitle: "江苏银行启用 95319 客服号码公告" },
  "广州银行": { provider: "广州银行", businessLabel: "信用卡客服", primaryPhone: "400-83-96699", phoneLabel: "广东：96699；境外：+86-20-96699", serviceHours: "7×24 小时", humanGuide: "官方未公开固定转人工按键，请按信用卡语音提示操作。", sourceUrl: "http://www.gzcb.com.cn/sy/lxwm/", sourceTitle: "广州银行联系我们" },
  "长沙银行": { provider: "长沙银行", businessLabel: "信用卡客服", primaryPhone: "40067-96511", phoneLabel: "境外：+86-731-96511", serviceHours: "7×24 小时", humanGuide: "官方未公开固定转人工按键，请按信用卡语音提示操作。", sourceUrl: "https://www.cscb.cn/site/col4/index.html", sourceTitle: "长沙银行信用卡" },
  "成都银行": { provider: "成都银行", businessLabel: "信用卡客服", primaryPhone: "400-07-95507", phoneLabel: "全国统一：95507", serviceHours: "7×24 小时", humanGuide: "官方未公开固定转人工按键，请按信用卡语音提示操作。", note: "请通过银行官网或卡背信息核对最新服务范围。" },
  "汉口银行": { provider: "汉口银行", businessLabel: "信用卡客服", primaryPhone: "4006096558", phoneLabel: "武汉：96558", serviceHours: "7×24 小时", humanGuide: "官方未公开固定转人工按键，请按信用卡语音提示操作。", sourceUrl: "http://www.96558.com/portal/zh_CN/home/zxgg/32532.html", sourceTitle: "汉口银行客服公告" },
  "中原银行": { provider: "中原银行", businessLabel: "信用卡客服", primaryPhone: "95186", phoneLabel: "异地或境外：0371-95186", serviceHours: "7×24 小时", humanGuide: "官方未公开固定转人工按键，请按信用卡语音提示操作。", sourceUrl: "https://www.zybank.com.cn/zybank/xyk3/index.html", sourceTitle: "中原银行信用卡" },
  "汇丰银行": { provider: "汇丰银行（中国）", businessLabel: "信用卡客服", primaryPhone: "95366", phoneLabel: "备用：021-20534333", serviceHours: "7×24 小时", humanGuide: "官方未公开固定转人工按键，请按信用卡语音提示操作。", sourceUrl: "https://www.hsbc.com.cn/help/contact/", sourceTitle: "联系汇丰" },
  "微众银行": { provider: "微众银行", businessLabel: "客户服务", primaryPhone: "95384", serviceHours: "官方未公开", humanGuide: "微众银行未设立独立信用卡业务；请按语音提示办理银行服务。", sourceUrl: "https://www.webank.com/news/zygg/2801", sourceTitle: "微众银行严正声明" },
  "渐丰银行": { provider: "渐丰银行", businessLabel: "信用卡客服", serviceHours: "未收录", humanGuide: "未识别到该名称对应的大陆持牌银行，请核对机构名称后再查询。" },
  "花旗银行": { provider: "花旗银行（中国）", businessLabel: "信用卡客服", serviceHours: "原个人信用卡业务已停止", humanGuide: "花旗中国个人信用卡专属热线已停止服务，请根据转让承接机构的正式通知办理。", sourceUrl: "https://www.hsbc.com.cn/banking/move-to-hsbc/faq/", sourceTitle: "花旗转让客户常见问题" },
};

const policyLoanContacts: Record<string, LoanServiceContact> = {
  "中国人寿": { provider: "中国人寿", businessLabel: "保单贷款服务", primaryPhone: "95519", serviceHours: "每日 8:00–22:00（节假日不休息）", humanGuide: "官方未公开固定保单贷款按键，请按语音提示选择保单服务或转人工。", sourceUrl: "https://www.chinalife.com.cn/chinalife/more-services/contact-us/236675/", sourceTitle: "中国人寿电话服务指南" },
  "平安人寿": { provider: "平安人寿", businessLabel: "保单贷款服务", primaryPhone: "95511", phoneLabel: "寿险服务请转 1", serviceHours: "每日 8:00–22:00", humanGuide: "拨打 95511 后转 1 进入寿险服务，再按语音提示办理保单贷款咨询。", sourceUrl: "https://www.pingan.com/homepage/contact.shtml", sourceTitle: "平安官方客服" },
  "太平洋人寿": { provider: "太平洋人寿", businessLabel: "保单贷款服务", primaryPhone: "95500", serviceHours: "7×24 小时", humanGuide: "拨打后按 2 进入人寿险服务，再按语音提示或转人工。", sourceUrl: "https://www.cpic.com.cn/life/cn/lxwm/index.shtml?hit=ShouyeGywmLxwm", sourceTitle: "太平洋保险客户服务电话" },
  "新华保险": { provider: "新华保险", businessLabel: "保单贷款服务", primaryPhone: "95567", serviceHours: "7×24 小时", humanGuide: "官方未公开固定保单贷款按键，请按语音提示选择保单服务或转人工。", sourceUrl: "https://www.newchinalife.com/m/spage/serviceCenterColligationService/4744.html", sourceTitle: "新华保险综合服务" },
  "泰康人寿": { provider: "泰康人寿", businessLabel: "保单贷款服务", primaryPhone: "95522", phoneLabel: "境外：+86-10-4009995522 或 +86-10-56639388", serviceHours: "7×24 小时", humanGuide: "官方未公开固定保单贷款按键，请按语音提示选择保单服务或转人工。", sourceUrl: "https://www.taikanglife.com/service/customerservice/life_protectService.html", sourceTitle: "泰康人寿保全服务指南" },
  "友邦保险": { provider: "友邦人寿", businessLabel: "保单贷款服务", primaryPhone: "400 820 3588", phoneLabel: "固话免费：800 820 3588；海外：(86 21) 2409 9009", serviceHours: "工作日 9:00–19:00；周末 9:00–17:30；法定节假日人工暂停", humanGuide: "官方未公开固定保单贷款按键，请按语音提示选择保单服务或转人工。", sourceUrl: "https://www.aia.com.cn/zh-cn/kefudianhua", sourceTitle: "友邦人寿客服电话" },
  "香港保险公司": { provider: "香港保险公司", businessLabel: "保单贷款服务", serviceHours: "需按具体承保公司确认", humanGuide: "该分类包含多家独立保险公司，没有统一客服电话；请先选择或补充具体承保机构。" },
  "其他保险公司": { provider: "其他保险公司", businessLabel: "保单贷款服务", serviceHours: "需按具体承保公司确认", humanGuide: "该分类没有统一客服电话；请先选择或补充具体承保机构。" },
};

export const huabeiServiceContact: LoanServiceContact = {
  provider: "支付宝花呗",
  businessLabel: "花呗客服",
  primaryPhone: "95188",
  phoneLabel: "花呗、借呗专线请转 2；海外：+86 571 95188",
  serviceHours: "每日 8:00–24:00",
  humanGuide: "拨打 95188 后按 2 进入花呗、借呗服务；需要人工时按语音提示转接。",
  sourceUrl: "https://help.alipay.com/",
  sourceTitle: "支付宝服务大厅",
};

const fallbackContact = (provider: string, businessLabel: string): LoanServiceContact => ({
  provider,
  businessLabel,
  serviceHours: "未收录",
  humanGuide: "暂未收录该机构的官方客服电话。请优先查看卡背、保单合同或机构官方 App 内的客服入口。",
});

export function getCreditCardServiceContact(bankName?: string | null) {
  const key = normalizeBankName(bankName || "");
  return creditCardContacts[key] || fallbackContact(key || "发卡机构", "信用卡客服");
}

export function getPolicyLoanServiceContact(insurer?: string | null) {
  const key = (insurer || "").trim();
  return policyLoanContacts[key] || fallbackContact(key || "承保机构", "保单贷款服务");
}

export function getHuabeiServiceContact() {
  return huabeiServiceContact;
}
