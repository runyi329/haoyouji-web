// @ts-nocheck
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { mtrpc } from "./mibanTrpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Link } from "wouter";
import { Sparkles, User, ChevronRight, ChevronLeft, Loader2 } from "lucide-react";
import { Streamdown } from "streamdown";
import { toast } from "sonner";

type HealthForm = {
  age?: number; gender?: "male" | "female" | "other";
  weight?: number; height?: number;
  bloodSugar?: "normal" | "prediabetes" | "diabetes";
  bloodPressure?: "normal" | "high" | "low";
  dietGoal?: "lose_weight" | "gain_muscle" | "maintain" | "health";
};

const STEP_OPTIONS = {
  gender: [{ value: "male", label: "男" }, { value: "female", label: "女" }, { value: "other", label: "其他" }],
  bloodSugar: [{ value: "normal", label: "正常" }, { value: "prediabetes", label: "糖前期" }, { value: "diabetes", label: "糖尿病" }],
  bloodPressure: [{ value: "normal", label: "正常" }, { value: "high", label: "高血压" }, { value: "low", label: "低血压" }],
  dietGoal: [{ value: "lose_weight", label: "减脂瘦身" }, { value: "gain_muscle", label: "增肌健身" }, { value: "maintain", label: "维持健康" }, { value: "health", label: "改善健康" }],
};

const steps = [
  { title: "基本信息" },
  { title: "健康状况" },
  { title: "饮食目标" },
];

export default function AiHealth() {
  const { isAuthenticated } = useAuth();
  const [step, setStep] = useState(0);
  const [formData, setFormData] = useState<HealthForm>({});
  const [aiResult, setAiResult] = useState("");
  const [generating, setGenerating] = useState(false);

  const generateMutation = mtrpc.health.generateAiProfile.useMutation({
    onSuccess: (data) => { setAiResult(data.aiProfile); setGenerating(false); },
    onError: (e) => { toast.error("生成失败：" + e.message); setGenerating(false); },
  });

  const handleGenerate = () => {
    setGenerating(true);
    setStep(steps.length);
    generateMutation.mutate(formData as any);
  };

  if (!isAuthenticated) {
    return (
      <div className="bg-white min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-black flex items-center justify-center mb-5">
          <Sparkles className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-[22px] font-bold text-black mb-2">AI 健康建档</h1>
        <p className="text-[13px] text-gray-400 mb-8 leading-relaxed">
          登录后，AI 将根据您的健康状况<br />生成专属米种配方推荐
        </p>
        <button
          onClick={() => window.location.href = "/login"}
          className="flex items-center gap-2 px-8 py-3 rounded-xl text-[14px] font-semibold text-white active:scale-95 transition-transform"
          style={{ background: "#FF6900" }}
        >
          <User className="w-4 h-4" />
          登录后开始
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white min-h-screen">

      {/* ─── 进度条 ───────────────────────────────────────────────────────── */}
      {step < steps.length && (
        <div className="px-4 pt-4 pb-3">
          <div className="flex items-center gap-2 mb-3">
            {steps.map((s, i) => (
              <div key={i} className="flex items-center gap-2 flex-1">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 transition-colors ${
                    i <= step ? "bg-black text-white" : "bg-gray-100 text-gray-400"
                  }`}
                >
                  {i + 1}
                </div>
                <span className={`text-[11px] whitespace-nowrap ${i === step ? "text-black font-medium" : "text-gray-400"}`}>
                  {s.title}
                </span>
                {i < steps.length - 1 && (
                  <div className={`flex-1 h-0.5 rounded-full ${i < step ? "bg-black" : "bg-gray-100"}`} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Step 0: 基本信息 ─────────────────────────────────────────────── */}
      {step === 0 && (
        <div className="px-4 pb-4">
          <h2 className="text-[16px] font-bold text-black mb-4">基本信息</h2>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-gray-400 mb-1.5 block">年龄</label>
                <input
                  type="number"
                  placeholder="如：35"
                  value={formData.age ?? ""}
                  onChange={(e) => setFormData(p => ({ ...p, age: Number(e.target.value) || undefined }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-[13px] text-black outline-none focus:border-black/30"
                />
              </div>
              <div>
                <label className="text-[11px] text-gray-400 mb-1.5 block">体重 (kg)</label>
                <input
                  type="number"
                  placeholder="如：65"
                  value={formData.weight ?? ""}
                  onChange={(e) => setFormData(p => ({ ...p, weight: Number(e.target.value) || undefined }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-[13px] text-black outline-none focus:border-black/30"
                />
              </div>
              <div>
                <label className="text-[11px] text-gray-400 mb-1.5 block">身高 (cm)</label>
                <input
                  type="number"
                  placeholder="如：170"
                  value={formData.height ?? ""}
                  onChange={(e) => setFormData(p => ({ ...p, height: Number(e.target.value) || undefined }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-[13px] text-black outline-none focus:border-black/30"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] text-gray-400 mb-1.5 block">性别</label>
              <div className="flex gap-2">
                {STEP_OPTIONS.gender.map(o => (
                  <button
                    key={o.value}
                    onClick={() => setFormData(p => ({ ...p, gender: o.value as any }))}
                    className={`flex-1 py-2.5 rounded-xl text-[13px] font-medium border transition-colors active:scale-95 ${
                      formData.gender === o.value
                        ? "bg-black text-white border-black"
                        : "border-gray-200 text-gray-500"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button
            onClick={() => setStep(1)}
            className="w-full mt-6 py-3.5 rounded-xl text-[14px] font-semibold text-white flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
            style={{ background: "#FF6900" }}
          >
            下一步
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ─── Step 1: 健康状况 ─────────────────────────────────────────────── */}
      {step === 1 && (
        <div className="px-4 pb-4">
          <h2 className="text-[16px] font-bold text-black mb-4">健康状况</h2>

          <div className="space-y-5">
            <div>
              <label className="text-[13px] font-medium text-black mb-2 block">血糖状况</label>
              <div className="flex gap-2">
                {STEP_OPTIONS.bloodSugar.map(o => (
                  <button
                    key={o.value}
                    onClick={() => setFormData(p => ({ ...p, bloodSugar: o.value as any }))}
                    className={`flex-1 py-3 rounded-xl text-[12px] font-medium border transition-colors active:scale-95 ${
                      formData.bloodSugar === o.value
                        ? "bg-black text-white border-black"
                        : "border-gray-200 text-gray-500"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[13px] font-medium text-black mb-2 block">血压状况</label>
              <div className="flex gap-2">
                {STEP_OPTIONS.bloodPressure.map(o => (
                  <button
                    key={o.value}
                    onClick={() => setFormData(p => ({ ...p, bloodPressure: o.value as any }))}
                    className={`flex-1 py-3 rounded-xl text-[12px] font-medium border transition-colors active:scale-95 ${
                      formData.bloodPressure === o.value
                        ? "bg-black text-white border-black"
                        : "border-gray-200 text-gray-500"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <button
              onClick={() => setStep(0)}
              className="flex-1 py-3.5 rounded-xl border border-gray-200 text-[13px] font-medium text-black flex items-center justify-center gap-1 active:bg-gray-50"
            >
              <ChevronLeft className="w-4 h-4" />
              上一步
            </button>
            <button
              onClick={() => setStep(2)}
              className="flex-1 py-3.5 rounded-xl text-[14px] font-semibold text-white flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
              style={{ background: "#FF6900" }}
            >
              下一步
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ─── Step 2: 饮食目标 ─────────────────────────────────────────────── */}
      {step === 2 && (
        <div className="px-4 pb-4">
          <h2 className="text-[16px] font-bold text-black mb-4">饮食目标</h2>

          <div className="grid grid-cols-2 gap-3">
            {STEP_OPTIONS.dietGoal.map(o => (
              <button
                key={o.value}
                onClick={() => setFormData(p => ({ ...p, dietGoal: o.value as any }))}
                className={`py-5 rounded-2xl text-[14px] font-medium border transition-colors active:scale-95 ${
                  formData.dietGoal === o.value
                    ? "bg-black text-white border-black"
                    : "border-gray-200 text-gray-600"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>

          <div className="flex gap-3 mt-6">
            <button
              onClick={() => setStep(1)}
              className="flex-1 py-3.5 rounded-xl border border-gray-200 text-[13px] font-medium text-black flex items-center justify-center gap-1 active:bg-gray-50"
            >
              <ChevronLeft className="w-4 h-4" />
              上一步
            </button>
            <button
              onClick={handleGenerate}
              className="flex-1 py-3.5 rounded-xl text-[14px] font-semibold text-white flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
              style={{ background: "#FF6900" }}
            >
              <Sparkles className="w-4 h-4" />
              生成档案
            </button>
          </div>
        </div>
      )}

      {/* ─── AI 结果 ──────────────────────────────────────────────────────── */}
      {step >= steps.length && (
        <div className="px-4 pb-4">
          {generating ? (
            <div className="flex flex-col items-center py-16 gap-4">
              <Loader2 className="w-8 h-8 animate-spin text-black" />
              <p className="text-[13px] text-gray-400">AI 正在分析您的健康状况...</p>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="w-5 h-5 text-black" />
                <h2 className="text-[16px] font-bold text-black">您的专属健康档案</h2>
              </div>
              <div className="prose prose-sm max-w-none text-black text-[13px] leading-relaxed">
                <Streamdown>{aiResult}</Streamdown>
              </div>
              <div className="flex gap-3 mt-6 pt-4 border-t border-gray-100">
                <button
                  onClick={() => { setStep(0); setAiResult(""); }}
                  className="flex-1 py-3 rounded-xl border border-gray-200 text-[13px] font-medium text-black active:bg-gray-50"
                >
                  重新填写
                </button>
                <Link href="/p/proj_hzxm2t/diy" className="flex-1">
                  <button
                    className="w-full py-3 rounded-xl text-[13px] font-semibold text-white active:scale-95 transition-transform"
                    style={{ background: "#FF6900" }}
                  >
                    去 DIY 配米
                  </button>
                </Link>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
