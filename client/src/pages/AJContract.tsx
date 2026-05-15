import { useState, useCallback } from "react";
import { useLocation, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useCenterToast } from "@/components/ui/center-toast";
import SignaturePad from "@/components/SignaturePad";

// ── 合同正文（纯文本渲染） ──
const CONTRACT_SECTIONS = [
  {
    title: "第一条　合作背景与目的",
    content: `甲方系依法注册成立的企业管理咨询服务平台，旗下设有业务推广服务网络，负责统筹协调各会员单位（以下简称"会员单位"）的业务拓展需求，并向具备相应能力的个人推广人员派发推广任务。乙方系经甲方审核认可、具备独立开展业务推广能力的自然人。双方合作旨在通过甲方平台资源与乙方个人资源的有效结合，共同为会员单位拓展业务、创造价值。`,
  },
  {
    title: "第二条　合作内容",
    content: `2.1　甲方根据会员单位的实际需求，通过平台向乙方下达业务推广任务（以下简称"推广任务"）。推广任务的形式宽泛，不限于以下范围：市场调研与信息摸排、潜在客户开发与接触、商业信息收集与分析、异地市场开拓前期工作、当地物价及行业动态调研、客户关系维护与跟进、商务洽谈辅助及会议安排、品牌宣传与推广活动执行，以及其他甲方认为有助于会员单位业务发展的工作事项。

2.2　甲方通过以下任意一种或多种方式向乙方下达推广任务：电话通知、短信、电子邮件、平台消息、腾讯会议或其他即时通讯工具。乙方收到任务通知后，应及时予以确认；乙方开始执行任务，视为对该任务的接受。

2.3　推广任务的具体内容、目标范围及工作要求，以甲方每次下达任务时的通知为准。任务形式灵活，甲方不设强制性量化考核指标，双方以诚信合作为基础，共同推动业务目标的实现。

2.4　乙方应以独立个人身份开展推广活动，不得以甲方或会员单位名义对外作出任何具有法律约束力的承诺或签署任何协议，除非经甲方书面授权。

2.5　乙方在执行推广任务过程中，应遵守国家法律法规及甲方的业务规范要求，不得从事任何违法违规行为。`,
  },
  {
    title: "第三条　费用报销",
    content: `3.1　乙方在执行甲方下达的推广任务过程中，因业务需要实际发生的合理费用，由甲方予以实报实销。可报销费用范围包括但不限于：交通费（市内交通、跨城差旅）、住宿费、餐饮费（工作餐及商务接待）、通讯费、办公用品费、资料印刷费、市场调研费、会议费、停车过路费、快递邮寄费、税费，以及经甲方事先确认的其他合理业务费用。

3.2　乙方申请报销时，须提供真实、合法、有效的原始凭证（增值税发票、正规收据等）。发票抬头须开具为乙方实际提供服务的会员单位全称，由甲方在任务下达时一并告知乙方。无合法凭证的费用，甲方有权拒绝报销。

3.3　乙方应在费用发生后30个自然日内向甲方提交报销申请，逾期提交的，甲方有权不予受理。

3.4　甲方在收到乙方完整报销资料后，根据相关业务的实际推进情况及会员单位的审核进度，适时完成费用审核与支付，具体时间以双方协商为准。

3.5　乙方不得虚开、伪造发票或凭证，一经发现，甲方有权立即解除本协议，并要求乙方退还全部已报销款项；情节严重的，甲方保留追究乙方法律责任的权利。`,
  },
  {
    title: "第四条　业务提成",
    content: `4.1　乙方在前期合作阶段不享有固定劳务报酬，甲方仅依据第三条约定向乙方报销实际发生的合理业务费用。

4.2　乙方为甲方会员单位成功促成业务合作（以会员单位与客户正式签署合同或完成交易为准）后，甲方应向乙方支付一次性业务提成。

4.3　业务提成计算方式：业务提成 = 该笔业务实际利润 × 约定提成比例（25%～30%）。具体提成比例由甲乙双方就每笔业务在任务确认书中另行约定；若任务确认书未明确约定，则按25%执行。

4.4　"业务实际利润"系指会员单位就该笔业务取得的实际收入，扣除直接成本（含税费、乙方本次任务报销费用等）后的净利润，由甲方提供核算依据，乙方有权要求甲方提供相关财务凭证进行核实。

4.5　甲方应在业务利润核算完成后30个工作日内向乙方支付业务提成，并出具书面结算单。

4.6　若因客户违约、合同撤销或其他非乙方原因导致业务未能最终完成，已支付的业务提成无需退还；若因乙方原因导致业务失败，甲方有权不予支付或要求退还已预付的提成。`,
  },
  {
    title: "第五条　双方权利与义务",
    content: `5.1　甲方权利与义务：
（一）甲方有权根据会员单位需求向乙方下达推广任务，并对乙方的推广活动进行监督和管理；
（二）甲方应及时向乙方提供执行推广任务所必要的资料、信息及支持，并告知发票开具的会员单位抬头；
（三）甲方应按本协议约定及时足额支付乙方的报销费用及业务提成；
（四）甲方应为乙方保密其在合作中获取的业务信息，不得将乙方个人信息用于本协议以外的用途。

5.2　乙方权利与义务：
（一）乙方有权按本协议约定获取报销费用及业务提成；
（二）乙方应积极、诚信地执行甲方下达的推广任务，不得消极怠工或无故拒绝合理任务；
（三）乙方应妥善保管甲方提供的业务资料及客户信息，不得泄露给任何第三方；
（四）乙方不得在合作期间及协议终止后2年内，利用本协议获取的甲方或会员单位的客户资源，绕开甲方直接与会员单位或其客户开展同类业务合作；
（五）乙方应依法履行个人所得税申报义务，因乙方税务问题引发的法律责任由乙方自行承担。`,
  },
  {
    title: "第六条　保密条款",
    content: `6.1　双方均应对在合作过程中知悉的对方商业秘密、客户信息、业务数据、技术资料等保密信息承担保密义务，未经对方书面同意，不得向任何第三方披露、使用或允许他人使用。

6.2　保密义务在本协议终止后继续有效，期限为3年。

6.3　违反保密义务的一方，应赔偿对方因此遭受的全部损失，包括但不限于直接损失、间接损失及合理的维权费用（含律师费）。`,
  },
  {
    title: "第七条　协议期限",
    content: `7.1　本协议自双方签署之日起生效，有效期为1年。

7.2　协议期满前30日内，双方均未提出书面异议的，协议自动续签一年，以此类推。

7.3　协议期内，任何一方如需提前终止合作，应提前30日以书面形式通知对方。提前终止不影响已产生的报销申请及业务提成的结算。`,
  },
  {
    title: "第八条　违约责任",
    content: `8.1　任何一方违反本协议约定，给对方造成损失的，违约方应承担赔偿责任。

8.2　甲方无故拖延支付业务提成超过约定期限15个工作日的，应按逾期金额的0.05%/日向乙方支付违约金。`,
  },
  {
    title: "第九条　争议解决",
    content: `9.1　本协议的订立、效力、履行、变更及终止，均适用中华人民共和国法律。

9.2　双方因履行本协议发生争议，应首先通过友好协商解决；协商不成的，任何一方均可向甲方所在地有管辖权的人民法院提起诉讼。`,
  },
  {
    title: "第十条　其他条款",
    content: `10.1　本协议未尽事宜，双方可另行签署补充协议，补充协议与本协议具有同等法律效力。

10.2　本协议一式两份，甲乙双方各执一份，均具有同等法律效力。自双方签字（盖章）之日起生效。

10.3　本协议中的任何条款被认定为无效或不可执行，不影响其他条款的效力。`,
  },
];

export default function AJContract() {
  const params = useParams<{ ledgerId: string }>();
  const ledgerId = Number(params.ledgerId);
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  const toast = useCenterToast();
  const [agreed, setAgreed] = useState(false);
  const [realName, setRealName] = useState("");
  const [idCard, setIdCard] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [signedAt, setSignedAt] = useState<string>("");

  // 检查是否已签约
  const { data: contractData, isLoading } = trpc.ajContract.getMyContract.useQuery(
    { ledgerId },
    { enabled: !!user }
  );

  const signMutation = trpc.ajContract.sign.useMutation({
    onSuccess: (data) => {
      setSubmitted(true);
      setSignedAt(new Date(data.signedAt).toLocaleString("zh-CN"));
      toast.success("签约成功！");
    },
    onError: (err) => {
      toast.error(err.message || "签约失败，请重试");
    },
  });

  const handleSignatureChange = useCallback((dataUrl: string | null) => {
    setSignatureDataUrl(dataUrl);
  }, []);

  const handleSign = () => {
    if (!realName.trim()) { toast.error("请填写真实姓名"); return; }
    if (!idCard.trim()) { toast.error("请填写身份证号码"); return; }
    if (!bankAccount.trim()) { toast.error("请填写银行账号"); return; }
    if (!signatureDataUrl) { toast.error("请手写签名"); return; }
    if (!agreed) { toast.error("请勾选同意协议"); return; }
    signMutation.mutate({
      ledgerId,
      realName: realName.trim(),
      idCard: idCard.trim(),
      bankName: bankName.trim(),
      bankAccount: bankAccount.trim(),
      signatureImage: signatureDataUrl,
    });
  };

  const alreadySigned = contractData?.signed;
  const existingInfo = contractData?.contract;

  return (
    <div style={{ minHeight: "100vh", background: "#F5F6F8", display: "flex", flexDirection: "column" }}>
      {/* 顶部导航 */}
      <div style={{
        background: "#1A2B4A",
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexShrink: 0,
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}>
        <button
          onClick={() => setLocation(`/ledger/${ledgerId}`)}
          style={{ background: "none", border: "none", cursor: "pointer", padding: "4px", display: "flex", alignItems: "center" }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <span style={{ fontSize: 16, fontWeight: 700, color: "#fff", flex: 1 }}>业务推广合作协议</span>
        {alreadySigned && (
          <span style={{ fontSize: 11, color: "#C9A84C", background: "rgba(201,168,76,0.15)", padding: "3px 8px", borderRadius: 10, border: "1px solid rgba(201,168,76,0.4)" }}>
            已签约
          </span>
        )}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "0 0 40px 0" }}>
        {/* 合同头部 */}
        <div style={{ background: "#fff", margin: "12px 12px 0", borderRadius: 12, padding: "20px 16px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <h1 style={{ textAlign: "center", fontSize: 18, fontWeight: 800, color: "#1A2B4A", marginBottom: 16, letterSpacing: 2 }}>
            业务推广合作协议
          </h1>
          {/* 甲乙方信息 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
            <div style={{ background: "#F0F4FF", borderRadius: 8, padding: "10px 12px" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#1A2B4A", marginBottom: 6 }}>甲方（委托方）</div>
              <div style={{ fontSize: 11, color: "#444", lineHeight: 1.8 }}>
                <div>上海煦水驰企业管理咨询有限公司</div>
                <div>法定代表人：胡先生</div>
                <div>地址：上海市</div>
              </div>
            </div>
            <div style={{ background: "#FFF8E7", borderRadius: 8, padding: "10px 12px" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#8B6914", marginBottom: 6 }}>乙方（推广方）</div>
              {alreadySigned && existingInfo ? (
                <div style={{ fontSize: 11, color: "#444", lineHeight: 1.8 }}>
                  <div>姓名：{existingInfo.realName}</div>
                  <div>身份证：{existingInfo.idCard.replace(/^(.{4})(.+)(.{4})$/, "$1****$3")}</div>
                  <div>签约时间：{new Date(existingInfo.signedAt).toLocaleDateString("zh-CN")}</div>
                </div>
              ) : (
                <div style={{ fontSize: 11, color: "#999", lineHeight: 1.8 }}>
                  <div>姓名：待填写</div>
                  <div>身份证：待填写</div>
                  <div>银行账号：待填写</div>
                </div>
              )}
            </div>
          </div>
          <p style={{ fontSize: 12, color: "#555", lineHeight: 1.8, textAlign: "justify" }}>
            甲乙双方本着平等自愿、诚实信用、互利共赢的原则，就甲方委托乙方开展业务推广合作事宜，经协商一致，订立本协议，共同遵守。
          </p>
        </div>

        {/* 合同正文各条款 */}
        {CONTRACT_SECTIONS.map((section, idx) => (
          <div key={idx} style={{ background: "#fff", margin: "8px 12px 0", borderRadius: 12, padding: "16px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#1A2B4A", marginBottom: 8, paddingBottom: 6, borderBottom: "1px solid #EEF2FF" }}>
              {section.title}
            </div>
            <div style={{ fontSize: 12, color: "#444", lineHeight: 2, whiteSpace: "pre-line", textAlign: "justify" }}>
              {section.content}
            </div>
          </div>
        ))}

        {/* 签约区域 */}
        {isLoading ? (
          <div style={{ textAlign: "center", padding: "32px 0", color: "#999", fontSize: 13 }}>加载中...</div>
        ) : alreadySigned && existingInfo ? (
          /* 已签约状态 */
          <div style={{ background: "#fff", margin: "8px 12px 0", borderRadius: 12, padding: "20px 16px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: "linear-gradient(135deg, #C9A84C, #F5E27A)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#1A2B4A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#1A2B4A", marginBottom: 4 }}>协议已签署</div>
              <div style={{ fontSize: 12, color: "#888" }}>签约时间：{new Date(existingInfo.signedAt).toLocaleString("zh-CN")}</div>
            </div>
            <div style={{ marginTop: 16, background: "#F8F9FA", borderRadius: 8, padding: "12px 14px" }}>
              <div style={{ fontSize: 11, color: "#666", lineHeight: 2 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#999" }}>签约人</span>
                  <span style={{ fontWeight: 600, color: "#333" }}>{existingInfo.realName}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#999" }}>身份证</span>
                  <span style={{ fontWeight: 600, color: "#333" }}>{existingInfo.idCard.replace(/^(.{4})(.+)(.{4})$/, "$1****$3")}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#999" }}>开户行</span>
                  <span style={{ fontWeight: 600, color: "#333" }}>{existingInfo.bankName || "—"}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#999" }}>银行账号</span>
                  <span style={{ fontWeight: 600, color: "#333" }}>{existingInfo.bankAccount.replace(/^(.{4})(.+)(.{4})$/, "$1****$3")}</span>
                </div>
              </div>
            </div>
            {/* 已签约时显示签名图片 */}
            {existingInfo.signatureUrl && (
              <div style={{ marginTop: 16, textAlign: "center" }}>
                <div style={{ fontSize: 12, color: "#999", marginBottom: 8 }}>乙方签名</div>
                <div style={{ border: "1px solid #E2E8F0", borderRadius: 8, padding: 8, background: "#FAFAFA", display: "inline-block" }}>
                  <img src={existingInfo.signatureUrl} alt="签名" style={{ maxWidth: "100%", height: 80, objectFit: "contain" }} />
                </div>
              </div>
            )}
          </div>
        ) : submitted ? (
          /* 刚签约成功 */
          <div style={{ background: "#fff", margin: "8px 12px 0", borderRadius: 12, padding: "20px 16px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: "linear-gradient(135deg, #C9A84C, #F5E27A)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#1A2B4A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#1A2B4A", marginBottom: 4 }}>签约成功！</div>
              <div style={{ fontSize: 12, color: "#888" }}>签约时间：{signedAt}</div>
            </div>
          </div>
        ) : (
          /* 签约表单 */
          <div style={{ background: "#fff", margin: "8px 12px 0", borderRadius: 12, padding: "16px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#1A2B4A", marginBottom: 14, paddingBottom: 6, borderBottom: "1px solid #EEF2FF" }}>
              乙方签约信息
            </div>
            {/* 表单字段 */}
            {[
              { label: "真实姓名", value: realName, setter: setRealName, placeholder: "请输入真实姓名", type: "text" },
              { label: "身份证号码", value: idCard, setter: setIdCard, placeholder: "请输入18位身份证号码", type: "text" },
              { label: "开户行", value: bankName, setter: setBankName, placeholder: "如：中国工商银行上海分行", type: "text" },
              { label: "银行账号", value: bankAccount, setter: setBankAccount, placeholder: "请输入银行卡号", type: "text" },
            ].map(({ label, value, setter, placeholder, type }) => (
              <div key={label} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>
                  {label}
                  {label !== "开户行" && <span style={{ color: "#E53E3E", marginLeft: 2 }}>*</span>}
                </div>
                <input
                  type={type}
                  value={value}
                  onChange={e => setter(e.target.value)}
                  placeholder={placeholder}
                  style={{
                    width: "100%",
                    height: 40,
                    border: "1px solid #E2E8F0",
                    borderRadius: 8,
                    padding: "0 12px",
                    fontSize: 13,
                    color: "#333",
                    background: "#FAFAFA",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>
            ))}

            {/* 手写签名区域 */}
            <div style={{ marginTop: 16, marginBottom: 16 }}>
              <SignaturePad onSignatureChange={handleSignatureChange} height={150} />
            </div>

            {/* 同意条款 */}
            <div
              style={{ display: "flex", alignItems: "flex-start", gap: 10, marginTop: 16, cursor: "pointer" }}
              onClick={() => setAgreed(!agreed)}
            >
              <div style={{
                width: 20, height: 20, borderRadius: 4, flexShrink: 0, marginTop: 1,
                background: agreed ? "#1A2B4A" : "#fff",
                border: `2px solid ${agreed ? "#1A2B4A" : "#CBD5E0"}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.2s",
              }}>
                {agreed && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </div>
              <span style={{ fontSize: 12, color: "#555", lineHeight: 1.6 }}>
                本人已认真阅读上述《业务推广合作协议》全部条款，充分理解并自愿接受协议内容，同意以本次电子签约方式与甲方上海煦水驰企业管理咨询有限公司建立合作关系，本次签约具有与书面签署同等的法律效力。
              </span>
            </div>

            {/* 签约按钮 */}
            <button
              onClick={handleSign}
              disabled={signMutation.isPending}
              style={{
                width: "100%",
                height: 48,
                marginTop: 20,
                borderRadius: 12,
                border: "none",
                background: agreed && signatureDataUrl ? "linear-gradient(135deg, #1A2B4A 0%, #2D4A7A 100%)" : "#CBD5E0",
                color: agreed && signatureDataUrl ? "#C9A84C" : "#fff",
                fontSize: 15,
                fontWeight: 700,
                cursor: agreed && signatureDataUrl ? "pointer" : "not-allowed",
                letterSpacing: 2,
                transition: "all 0.2s",
              }}
            >
              {signMutation.isPending ? "签约中..." : "确认签约"}
            </button>
            <p style={{ fontSize: 11, color: "#999", textAlign: "center", marginTop: 8 }}>
              签约时间将自动记录，签约后不可撤销
            </p>
          </div>
        )}

        {/* 底部间距 */}
        <div style={{ height: 32 }} />
      </div>
    </div>
  );
}
