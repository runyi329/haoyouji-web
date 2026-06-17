/**
 * 牙办齿科商城 - 后台医院支付设置（多租户多商户）
 * 路由：/yaban/shop/admin/merchant-config
 * 说明：
 *   - 每家医院(tenant)配置各自的微信/支付宝商户参数，钱进各自商户号
 *   - 密钥字段（API密钥/私钥/公钥）由后端 AES-256-GCM 加密存库，读取时仅脱敏显示是否已配置
 *   - 密钥输入框留空 = 不修改原值；填写则覆盖
 *   - 模式开关：sandbox 模拟（跑通流程）/ live 正式收款
 *   - 风格沿用牙办蓝白、移动端优先、无表情图标
 */
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ChevronLeft, Loader2, ShieldCheck, Save } from "lucide-react";
import { PageTag } from "@/components/PageTag";
import { useYabanClinic } from "./useYabanClinic";

export default function YabanShopAdminMerchantConfig() {
  const [, navigate] = useLocation();
  const { current } = useYabanClinic();
  const clinicName = current?.name?.trim() || current?.shortName?.trim() || "";
  const cfgQuery = trpc.yabanPayment.adminGetMerchantConfig.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const save = trpc.yabanPayment.adminSaveMerchantConfig.useMutation();

  const [merchantName, setMerchantName] = useState("");
  const [mode, setMode] = useState<"sandbox" | "live">("sandbox");

  const [wxEnabled, setWxEnabled] = useState(false);
  const [wxAppid, setWxAppid] = useState("");
  const [wxMchId, setWxMchId] = useState("");
  const [wxApiKey, setWxApiKey] = useState("");
  const [wxCertSerial, setWxCertSerial] = useState("");
  const [wxPrivateKey, setWxPrivateKey] = useState("");

  const [aliEnabled, setAliEnabled] = useState(false);
  const [aliAppid, setAliAppid] = useState("");
  const [aliPrivateKey, setAliPrivateKey] = useState("");
  const [aliPublicKey, setAliPublicKey] = useState("");

  // 已配置标记（脱敏）
  const [wxApiKeySet, setWxApiKeySet] = useState(false);
  const [wxPrivateKeySet, setWxPrivateKeySet] = useState(false);
  const [aliPrivateKeySet, setAliPrivateKeySet] = useState(false);
  const [aliPublicKeySet, setAliPublicKeySet] = useState(false);

  useEffect(() => {
    const d = cfgQuery.data;
    if (!d) return;
    setMerchantName(d.merchantName || "");
    setMode((d.mode as "sandbox" | "live") || "sandbox");
    setWxEnabled(!!d.wxEnabled);
    setWxAppid(d.wxAppid || "");
    setWxMchId(d.wxMchId || "");
    setWxCertSerial(d.wxCertSerial || "");
    setAliEnabled(!!d.aliEnabled);
    setAliAppid(d.aliAppid || "");
    setWxApiKeySet(!!d.wxApiKeySet);
    setWxPrivateKeySet(!!d.wxPrivateKeySet);
    setAliPrivateKeySet(!!d.aliPrivateKeySet);
    setAliPublicKeySet(!!d.aliPublicKeySet);
  }, [cfgQuery.data]);

  const handleSave = async () => {
    if (save.isPending) return;
    try {
      await save.mutateAsync({
        merchantName: merchantName.trim() || undefined,
        mode,
        wxEnabled,
        wxAppid: wxAppid.trim() || undefined,
        wxMchId: wxMchId.trim() || undefined,
        wxApiKey: wxApiKey.trim() || undefined,
        wxCertSerial: wxCertSerial.trim() || undefined,
        wxPrivateKey: wxPrivateKey.trim() || undefined,
        aliEnabled,
        aliAppid: aliAppid.trim() || undefined,
        aliPrivateKey: aliPrivateKey.trim() || undefined,
        aliPublicKey: aliPublicKey.trim() || undefined,
      });
      toast.success("已保存");
      // 清空密钥输入框（避免重复提交），重新拉取脱敏状态
      setWxApiKey("");
      setWxPrivateKey("");
      setAliPrivateKey("");
      setAliPublicKey("");
      cfgQuery.refetch();
    } catch (e: any) {
      toast.error(e?.message || "保存失败，请重试");
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F7FA] pb-24">
      <PageTag code="P308" />

      {/* 顶部栏 */}
      <div className="bg-gradient-to-r from-[#2196C8] to-[#3BA9E0] text-white sticky top-0 z-40">
        <div className="max-w-lg mx-auto px-3 py-3 flex items-center justify-between">
          <button onClick={() => navigate("/yaban/shop")} aria-label="返回">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div className="flex flex-col items-center">
            <span className="text-base font-bold leading-tight">支付设置</span>
            {clinicName && <span className="text-[11px] font-normal text-white/80 leading-tight mt-0.5">所属：{clinicName}</span>}
          </div>
          <span className="w-6" />
        </div>
      </div>

      {cfgQuery.isLoading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> 加载中
        </div>
      ) : (
        <div className="max-w-lg mx-auto px-3 pt-3 space-y-3">
          {/* 说明 */}
          <div className="bg-gradient-to-r from-[#E8F4FD] to-[#D6EEFB] rounded-xl px-3 py-2.5 flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-[#1A6E96] mt-0.5 shrink-0" />
            <p className="text-[12px] text-[#1A6E96] leading-relaxed">
              本店收款资金直接进入下方配置的微信/支付宝商户号，平台不经手资金。密钥提交后将加密存储，页面不会回显明文。密钥框留空表示不修改原值。
            </p>
          </div>

          {/* 基础 */}
          <Section title="基础设置">
            <Field label="商户名称（门店收款主体）">
              <input
                value={merchantName}
                onChange={(e) => setMerchantName(e.target.value)}
                placeholder="如：好友记口腔门诊部"
                className="form-input"
              />
            </Field>
            <Field label="支付模式">
              <div className="flex gap-2">
                <ModeBtn active={mode === "sandbox"} onClick={() => setMode("sandbox")}>
                  模拟（测试）
                </ModeBtn>
                <ModeBtn active={mode === "live"} onClick={() => setMode("live")}>
                  正式收款
                </ModeBtn>
              </div>
              {mode === "live" && (
                <p className="text-[11px] text-[#FF8A4C] mt-2 leading-relaxed">
                  正式模式需完整填写已启用渠道的商户参数与密钥，否则该渠道无法发起支付。
                </p>
              )}
            </Field>
          </Section>

          {/* 微信支付 */}
          <Section title="微信支付">
            <SwitchRow label="启用微信支付" checked={wxEnabled} onChange={setWxEnabled} />
            <Field label="公众号/小程序 AppID">
              <input value={wxAppid} onChange={(e) => setWxAppid(e.target.value)} placeholder="wx 开头" className="form-input" />
            </Field>
            <Field label="商户号 mch_id">
              <input value={wxMchId} onChange={(e) => setWxMchId(e.target.value)} placeholder="微信支付商户号" className="form-input" />
            </Field>
            <Field label={`APIv3 密钥${wxApiKeySet ? "（已配置，留空不改）" : ""}`}>
              <input
                type="password"
                value={wxApiKey}
                onChange={(e) => setWxApiKey(e.target.value)}
                placeholder={wxApiKeySet ? "已加密保存，如需更换请输入新值" : "请输入 APIv3 密钥"}
                className="form-input"
              />
            </Field>
            <Field label="商户证书序列号">
              <input value={wxCertSerial} onChange={(e) => setWxCertSerial(e.target.value)} placeholder="证书序列号" className="form-input" />
            </Field>
            <Field label={`商户私钥${wxPrivateKeySet ? "（已配置，留空不改）" : ""}`}>
              <textarea
                value={wxPrivateKey}
                onChange={(e) => setWxPrivateKey(e.target.value)}
                placeholder={wxPrivateKeySet ? "已加密保存，如需更换请粘贴新私钥" : "粘贴 apiclient_key.pem 内容"}
                rows={3}
                className="form-input resize-none"
              />
            </Field>
          </Section>

          {/* 支付宝 */}
          <Section title="支付宝">
            <SwitchRow label="启用支付宝" checked={aliEnabled} onChange={setAliEnabled} />
            <Field label="应用 AppID">
              <input value={aliAppid} onChange={(e) => setAliAppid(e.target.value)} placeholder="支付宝应用 AppID" className="form-input" />
            </Field>
            <Field label={`应用私钥${aliPrivateKeySet ? "（已配置，留空不改）" : ""}`}>
              <textarea
                value={aliPrivateKey}
                onChange={(e) => setAliPrivateKey(e.target.value)}
                placeholder={aliPrivateKeySet ? "已加密保存，如需更换请粘贴新私钥" : "粘贴应用私钥"}
                rows={3}
                className="form-input resize-none"
              />
            </Field>
            <Field label={`支付宝公钥${aliPublicKeySet ? "（已配置，留空不改）" : ""}`}>
              <textarea
                value={aliPublicKey}
                onChange={(e) => setAliPublicKey(e.target.value)}
                placeholder={aliPublicKeySet ? "已加密保存，如需更换请粘贴新公钥" : "粘贴支付宝公钥"}
                rows={3}
                className="form-input resize-none"
              />
            </Field>
          </Section>
        </div>
      )}

      {/* 底部保存 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 z-40">
        <div className="max-w-lg mx-auto px-4 py-3">
          <button
            onClick={handleSave}
            disabled={save.isPending}
            className="w-full py-3 rounded-full bg-gradient-to-r from-[#2196C8] to-[#3BA9E0] text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {save.isPending ? "保存中" : "保存设置"}
          </button>
        </div>
      </div>

      <style>{`
        .form-input {
          width: 100%;
          background: #F5F7FA;
          border-radius: 0.5rem;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          color: #374151;
          outline: none;
          border: 1px solid transparent;
        }
        .form-input:focus { border-color: #2196C8; background: #fff; }
        .form-input::placeholder { color: #9CA3AF; }
      `}</style>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl px-3 py-3 space-y-3">
      <p className="text-sm font-bold text-gray-800">{title}</p>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[12px] text-gray-500 mb-1.5">{label}</p>
      {children}
    </div>
  );
}

function ModeBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-2 rounded-lg text-sm font-medium border ${
        active
          ? "bg-[#2196C8] border-[#2196C8] text-white"
          : "bg-white border-gray-200 text-gray-500"
      }`}
    >
      {children}
    </button>
  );
}

function SwitchRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-700">{label}</span>
      <button
        onClick={() => onChange(!checked)}
        className={`w-11 h-6 rounded-full relative transition-colors ${
          checked ? "bg-[#2196C8]" : "bg-gray-300"
        }`}
        aria-label={label}
      >
        <span
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${
            checked ? "left-[22px]" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}
