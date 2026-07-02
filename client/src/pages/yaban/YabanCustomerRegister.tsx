/**
 * 牙伴齿科管理 - 客户登记表（美容院会员登记）
 * 蓝白风格，移动端优先。面向美容院到店会员办理的登记表单：
 * 会员卡号 / 姓名 / 手机 / 性别 / 生日 / 皮肤类型 / 来源 / 办卡意向 / 储值金额 / 备注。
 * 提交后写入会员库（后续接入 yabanCustomer.create）。
 * 注意：严禁使用 Emoji；图标统一用 lucide。
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { useSmartBack } from "@/hooks/useSmartBack";
import { ChevronLeft, ClipboardList, Check } from "lucide-react";
import { toast } from "sonner";

const SKY = "#2196C8";
const SKY_D = "#1E88D6";

const SKIN_TYPES = ["中性", "干性", "油性", "混合性", "敏感性"];
const SOURCES = ["到店", "转介绍", "美团/点评", "朋友圈广告", "电话邀约", "老会员推荐", "其他"];
const CARD_TYPES = ["体验卡", "次卡", "储值卡", "年卡", "暂不办卡"];

type RegForm = {
  cardNo: string;
  name: string;
  mobile: string;
  gender: "女" | "男";
  birthday: string;
  skin: string;
  source: string;
  cardType: string;
  storedAmount: string;
  remark: string;
};

const EMPTY: RegForm = {
  cardNo: "",
  name: "",
  mobile: "",
  gender: "女",
  birthday: "",
  skin: "中性",
  source: "到店",
  cardType: "体验卡",
  storedAmount: "",
  remark: "",
};

export default function YabanCustomerRegister() {
  const [, navigate] = useLocation();
  const goBack = useSmartBack("/yaban/features");
  const [form, setForm] = useState<RegForm>({ ...EMPTY });
  const [submitting, setSubmitting] = useState(false);

  const set = <K extends keyof RegForm>(k: K, v: RegForm[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = () => {
    if (!form.name.trim()) {
      toast.error("请填写会员姓名");
      return;
    }
    if (!/^1\d{10}$/.test(form.mobile.trim())) {
      toast.error("请填写正确的手机号");
      return;
    }
    setSubmitting(true);
    // 占位：后续接入 yabanCustomer.create 真正写库
    setTimeout(() => {
      setSubmitting(false);
      toast.success("会员登记成功");
      setForm({ ...EMPTY });
    }, 500);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 顶部导航栏 */}
      <div
        className="text-white"
        style={{ background: `linear-gradient(135deg, ${SKY} 0%, ${SKY_D} 100%)` }}
      >
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <button onClick={goBack} className="p-1" aria-label="返回">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div className="flex flex-col items-center leading-tight">
            <span className="text-base font-bold flex items-center gap-1.5">
              <ClipboardList className="w-4 h-4" />
              美容院会员登记
            </span>
            <span className="text-[10px] font-normal text-white/70">
              会員登録 / Member Registration
            </span>
          </div>
          <span className="w-6" />
        </div>
      </div>

      {/* 表单 */}
      <div className="flex-1 max-w-lg w-full mx-auto px-4 py-4 space-y-4">
        {/* 基础信息 */}
        <Section title="基础信息">
          <Row label="会员卡号">
            <input
              value={form.cardNo}
              onChange={(e) => set("cardNo", e.target.value)}
              placeholder="可留空，办卡后自动生成"
              className="reg-input"
            />
          </Row>
          <Row label="姓名" required>
            <input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="请输入会员姓名"
              className="reg-input"
            />
          </Row>
          <Row label="手机号" required>
            <input
              value={form.mobile}
              onChange={(e) => set("mobile", e.target.value.replace(/\D/g, "").slice(0, 11))}
              inputMode="numeric"
              placeholder="请输入手机号"
              className="reg-input"
            />
          </Row>
          <Row label="性别">
            <Pills
              options={["女", "男"]}
              value={form.gender}
              onChange={(v) => set("gender", v as RegForm["gender"])}
            />
          </Row>
          <Row label="生日" last>
            <input
              type="date"
              value={form.birthday}
              onChange={(e) => set("birthday", e.target.value)}
              className="reg-input"
            />
          </Row>
        </Section>

        {/* 美容档案 */}
        <Section title="美容档案">
          <Row label="皮肤类型">
            <Pills options={SKIN_TYPES} value={form.skin} onChange={(v) => set("skin", v)} />
          </Row>
          <Row label="来源" last>
            <select
              value={form.source}
              onChange={(e) => set("source", e.target.value)}
              className="reg-input"
            >
              {SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Row>
        </Section>

        {/* 办卡意向 */}
        <Section title="办卡意向">
          <Row label="卡种">
            <Pills options={CARD_TYPES} value={form.cardType} onChange={(v) => set("cardType", v)} />
          </Row>
          <Row label="储值金额（元）">
            <input
              value={form.storedAmount}
              onChange={(e) => set("storedAmount", e.target.value.replace(/[^\d.]/g, ""))}
              inputMode="decimal"
              placeholder="如 1000"
              className="reg-input"
              disabled={form.cardType === "暂不办卡"}
            />
          </Row>
          <Row label="备注" last>
            <textarea
              value={form.remark}
              onChange={(e) => set("remark", e.target.value)}
              placeholder="如肤质问题、护理诉求、过敏史等"
              rows={3}
              className="reg-input resize-none"
            />
          </Row>
        </Section>

        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full py-3 rounded-md text-white text-[16px] font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-60"
          style={{ background: `linear-gradient(135deg, ${SKY} 0%, ${SKY_D} 100%)` }}
        >
          <Check className="w-5 h-5" />
          {submitting ? "提交中…" : "提交登记"}
        </button>
      </div>


      <style>{`
        .reg-input {
          width: 100%;
          background: transparent;
          outline: none;
          font-size: 15px;
          color: #1f2937;
        }
        .reg-input::placeholder { color: #cbd5e1; }
      `}</style>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-md border border-gray-100 overflow-hidden">
      <div className="px-4 pt-3 pb-1 text-[13px] font-semibold" style={{ color: SKY }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({
  label,
  children,
  required,
  last,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  last?: boolean;
}) {
  return (
    <div className={`px-4 py-3 ${last ? "" : "border-b border-gray-100"}`}>
      <div className="text-[12px] text-gray-400 mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </div>
      {children}
    </div>
  );
}

function Pills({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className="px-3.5 py-1.5 rounded-md text-[14px] transition-colors"
          style={
            value === opt
              ? { background: SKY, color: "#fff" }
              : { background: "#F1F5F9", color: "#64748B" }
          }
        >
          {opt}
        </button>
      ))}
    </div>
  );
}
