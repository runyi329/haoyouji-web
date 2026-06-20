/**
 * 奢贝美容院 - AI 减肥
 * 路径: /beauty/ai-diet
 * 接入天API BFR体脂率接口：https://apis.tianapi.com/bfrsum/index
 */
import { useState } from "react";
import { Link } from "wouter";
import { ChevronLeft, Brain, Loader2, Scale, Ruler, Activity, Target, Salad, Dumbbell, Percent, HeartPulse } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import BeautyTabBar from "./BeautyTabBar";
import BottomNav from "@/components/BottomNav";

const TIANAPI_KEY = "3878a89bed4728b65cc7d8dc0a644c07";

interface FormData {
  gender: "female" | "male";
  age: string;
  height: string;
  weight: string;
  targetWeight: string;
  activityLevel: "sedentary" | "light" | "moderate" | "active";
  goal: "lose" | "maintain" | "tone";
}

interface BfrResult {
  bfr: string;        // 体脂率，如 "17%"
  normbfr: string;    // 正常体脂率范围，如 "14%-20%"
  idealweight: number; // 理想体重 kg
  normweight: string; // 正常体重范围，如 "54~66"
  healthy?: string;   // 健康等级，如 "风险较低"
  tip?: string;       // 建议文字
}

interface DietPlan {
  bmi: number;
  bmiStatus: string;
  bmr: number;
  tdee: number;
  targetCalories: number;
  weightDiff: number;
  weeklyPlan: string[];
  dietTips: string[];
  exerciseTips: string[];
  beautyTips: string[];
  bfrResult: BfrResult | null;
  bfrError: string | null;
}

function calcLocalPlan(form: FormData, bfrResult: BfrResult | null, bfrError: string | null): DietPlan {
  const h = parseFloat(form.height) / 100;
  const w = parseFloat(form.weight);
  const tw = parseFloat(form.targetWeight);
  const age = parseInt(form.age);
  const bmi = w / (h * h);

  let bmiStatus = "正常";
  if (bmi < 18.5) bmiStatus = "偏瘦";
  else if (bmi < 24) bmiStatus = "正常";
  else if (bmi < 28) bmiStatus = "偏重";
  else bmiStatus = "肥胖";

  // Harris-Benedict 公式
  const bmr = form.gender === "female"
    ? 655 + 9.6 * w + 1.8 * parseFloat(form.height) - 4.7 * age
    : 66 + 13.7 * w + 5 * parseFloat(form.height) - 6.8 * age;

  const activityMap = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725 };
  const tdee = bmr * activityMap[form.activityLevel];

  let targetCalories = tdee;
  if (form.goal === "lose") targetCalories = tdee - 500;
  else if (form.goal === "tone") targetCalories = tdee - 200;

  const weightDiff = tw - w;

  const weeklyPlan = [
    `每日摄入热量目标：${Math.round(targetCalories)} 千卡`,
    `蛋白质：${Math.round(w * 1.6)}g（占总热量约 ${Math.round(w * 1.6 * 4 / targetCalories * 100)}%）`,
    `碳水化合物：${Math.round(targetCalories * 0.4 / 4)}g（占总热量约 40%）`,
    `健康脂肪：${Math.round(targetCalories * 0.25 / 9)}g（占总热量约 25%）`,
    `每日饮水量：${Math.round(w * 35)}ml（约 ${Math.round(w * 35 / 250)} 杯水）`,
  ];

  const dietTips = form.goal === "lose" ? [
    "早餐吃好：燕麦 + 鸡蛋 + 低脂牛奶，提供持久饱腹感",
    "午餐吃饱：优质蛋白（鸡胸肉/鱼）+ 大量蔬菜 + 适量主食",
    "晚餐吃少：以蔬菜和蛋白质为主，减少碳水摄入",
    "避免精制糖、油炸食品、含糖饮料",
    "两餐之间可以吃少量坚果或水果作为加餐",
  ] : [
    "均衡饮食：每餐保证蛋白质、蔬菜、优质碳水的搭配",
    "多吃深色蔬菜：富含抗氧化物，有助于皮肤健康",
    "选择优质蛋白：鱼、虾、鸡胸肉、豆腐、鸡蛋",
    "适量摄入健康脂肪：橄榄油、牛油果、坚果",
    "规律进餐，避免暴饮暴食",
  ];

  const exerciseTips = form.activityLevel === "sedentary" ? [
    "从每天 20 分钟快走开始，逐步增加运动量",
    "每周至少 3 次有氧运动（快走、游泳、骑车）",
    "加入简单的居家力量训练：深蹲、平板支撑",
    "减少久坐，每小时起身活动 5 分钟",
  ] : [
    "每周 4-5 次有氧运动，每次 45-60 分钟",
    "结合力量训练：增加肌肉量，提高基础代谢",
    "尝试 HIIT 间歇训练，燃脂效果更佳",
    "运动后注意拉伸，预防肌肉酸痛",
  ];

  const beautyTips = [
    "配合奢贝美容院的塑形护理，内外兼修效果更佳",
    "充足睡眠（7-8小时）有助于减少压力激素，促进脂肪分解",
    "定期做淋巴排毒按摩，改善水肿问题",
    "保持好心情，压力过大会导致皮质醇升高，阻碍减重",
  ];

  return {
    bmi,
    bmiStatus,
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    targetCalories: Math.round(targetCalories),
    weightDiff,
    weeklyPlan,
    dietTips,
    exerciseTips,
    beautyTips,
    bfrResult,
    bfrError,
  };
}

// 体脂率健康等级颜色
function getBfrColor(healthy?: string): string {
  if (!healthy) return "text-gray-600";
  if (healthy.includes("偏低") || healthy.includes("过低")) return "text-blue-500";
  if (healthy.includes("理想") || healthy.includes("较低") || healthy.includes("正常")) return "text-green-500";
  if (healthy.includes("偏高") || healthy.includes("较高")) return "text-amber-500";
  if (healthy.includes("肥胖") || healthy.includes("过高")) return "text-red-500";
  return "text-gray-600";
}

export default function BeautyAiDiet() {
  const [form, setForm] = useState<FormData>({
    gender: "female",
    age: "",
    height: "",
    weight: "",
    targetWeight: "",
    activityLevel: "light",
    goal: "lose",
  });
  const [plan, setPlan] = useState<DietPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Partial<FormData>>({});

  const validate = () => {
    const e: Partial<FormData> = {};
    if (!form.age || parseInt(form.age) < 10 || parseInt(form.age) > 100) e.age = "请输入有效年龄（10-100）";
    if (!form.height || parseFloat(form.height) < 100 || parseFloat(form.height) > 250) e.height = "请输入有效身高（100-250cm）";
    if (!form.weight || parseFloat(form.weight) < 30 || parseFloat(form.weight) > 300) e.weight = "请输入有效体重（30-300kg）";
    if (!form.targetWeight || parseFloat(form.targetWeight) < 30 || parseFloat(form.targetWeight) > 300) e.targetWeight = "请输入有效目标体重";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setLoading(true);

    // 调用天API BFR体脂率接口
    // sex: 1=男, 2=女
    const sex = form.gender === "male" ? 1 : 2;
    let bfrResult: BfrResult | null = null;
    let bfrError: string | null = null;

    try {
      const url = `https://apis.tianapi.com/bfrsum/index?key=${TIANAPI_KEY}&age=${form.age}&height=${form.height}&weight=${form.weight}&sex=${sex}`;
      const resp = await fetch(url);
      const data = await resp.json();
      if (data.code === 200 && data.result) {
        bfrResult = data.result as BfrResult;
      } else {
        bfrError = data.msg || "接口返回异常";
      }
    } catch (err) {
      bfrError = "网络请求失败，已使用本地计算";
    }

    setPlan(calcLocalPlan(form, bfrResult, bfrError));
    setLoading(false);
  };

  const bmiColor = plan ? (plan.bmi < 18.5 ? "text-blue-500" : plan.bmi < 24 ? "text-green-500" : plan.bmi < 28 ? "text-amber-500" : "text-red-500") : "";

  return (
    <div className="min-h-screen bg-gray-50 pb-28">
      {/* 顶部导航 */}
      <div className="sticky top-0 z-10">
        <div className="bg-white border-b border-gray-100">
          <div className="flex items-center px-4 py-3 gap-3">
            <Link href="/beauty">
              <button className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
                <ChevronLeft className="w-5 h-5 text-gray-600" />
              </button>
            </Link>
            <div className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-rose-500" />
              <h1 className="font-semibold text-gray-800">AI 减肥方案</h1>
            </div>
          </div>
        </div>
        <BeautyTabBar />
      </div>

      <div className="px-4 py-4 space-y-4 max-w-lg mx-auto">
        {/* 表单卡片 */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 space-y-4">
            <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Scale className="w-4 h-4 text-rose-400" /> 填写你的基本信息
            </h2>

            {/* 性别 */}
            <div>
              <label className="text-xs text-gray-500 mb-1.5 block">性别</label>
              <div className="grid grid-cols-2 gap-2">
                {(["female", "male"] as const).map(g => (
                  <button
                    key={g}
                    onClick={() => setForm(f => ({ ...f, gender: g }))}
                    className={`py-2 rounded-xl text-sm font-medium transition-colors ${form.gender === g ? "bg-rose-500 text-white" : "bg-gray-100 text-gray-600"}`}
                  >
                    {g === "female" ? "女" : "男"}
                  </button>
                ))}
              </div>
            </div>

            {/* 年龄 / 身高 / 体重 / 目标体重 */}
            {[
              { key: "age", label: "年龄", unit: "岁", icon: <Activity className="w-4 h-4 text-rose-300" /> },
              { key: "height", label: "身高", unit: "cm", icon: <Ruler className="w-4 h-4 text-rose-300" /> },
              { key: "weight", label: "当前体重", unit: "kg", icon: <Scale className="w-4 h-4 text-rose-300" /> },
              { key: "targetWeight", label: "目标体重", unit: "kg", icon: <Target className="w-4 h-4 text-rose-300" /> },
            ].map(({ key, label, unit, icon }) => (
              <div key={key}>
                <label className="text-xs text-gray-500 mb-1.5 flex items-center gap-1">
                  {icon} {label}
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={form[key as keyof FormData]}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    placeholder={`请输入${label}`}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm pr-10 focus:outline-none focus:border-rose-300 focus:ring-1 focus:ring-rose-200"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">{unit}</span>
                </div>
                {errors[key as keyof FormData] && (
                  <p className="text-xs text-red-400 mt-1">{errors[key as keyof FormData]}</p>
                )}
              </div>
            ))}

            {/* 活动水平 */}
            <div>
              <label className="text-xs text-gray-500 mb-1.5 block">日常活动水平</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: "sedentary", label: "久坐少动" },
                  { value: "light", label: "轻度活动" },
                  { value: "moderate", label: "中度活动" },
                  { value: "active", label: "高度活跃" },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setForm(f => ({ ...f, activityLevel: opt.value as FormData["activityLevel"] }))}
                    className={`py-2 rounded-xl text-xs font-medium transition-colors ${form.activityLevel === opt.value ? "bg-rose-500 text-white" : "bg-gray-100 text-gray-600"}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 目标 */}
            <div>
              <label className="text-xs text-gray-500 mb-1.5 block">减肥目标</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: "lose", label: "快速减重" },
                  { value: "tone", label: "塑形紧致" },
                  { value: "maintain", label: "维持体重" },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setForm(f => ({ ...f, goal: opt.value as FormData["goal"] }))}
                    className={`py-2 rounded-xl text-xs font-medium transition-colors ${form.goal === opt.value ? "bg-rose-500 text-white" : "bg-gray-100 text-gray-600"}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <Button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full bg-rose-500 hover:bg-rose-600 text-white rounded-xl py-3 font-semibold"
            >
              {loading ? (
                <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> AI 分析中...</span>
              ) : (
                <span className="flex items-center gap-2"><Brain className="w-4 h-4" /> 生成我的专属方案</span>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* 结果展示 */}
        {plan && (
          <>
            {/* ★ BFR 体脂率卡片（天API真实数据） */}
            {plan.bfrResult ? (
              <Card className="border-0 shadow-sm bg-gradient-to-br from-pink-50 to-rose-50">
                <CardContent className="p-4">
                  <h3 className="text-sm font-semibold text-rose-600 mb-3 flex items-center gap-2">
                    <Percent className="w-4 h-4" /> 体脂率检测结果
                    <span className="ml-auto text-[10px] text-rose-300 font-normal">由天API提供</span>
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    {/* 当前体脂率 */}
                    <div className="bg-white rounded-xl p-3 text-center shadow-sm">
                      <p className="text-xs text-gray-400 mb-1">当前体脂率</p>
                      <p className={`text-2xl font-bold ${getBfrColor(plan.bfrResult.healthy)}`}>
                        {plan.bfrResult.bfr}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">正常：{plan.bfrResult.normbfr}</p>
                    </div>
                    {/* 理想体重 */}
                    <div className="bg-white rounded-xl p-3 text-center shadow-sm">
                      <p className="text-xs text-gray-400 mb-1">理想体重</p>
                      <p className="text-2xl font-bold text-rose-500">
                        {plan.bfrResult.idealweight}<span className="text-sm font-normal text-gray-400">kg</span>
                      </p>
                      <p className="text-xs text-gray-400 mt-1">正常范围：{plan.bfrResult.normweight}kg</p>
                    </div>
                  </div>
                  {/* 健康等级 */}
                  {plan.bfrResult.healthy && (
                    <div className={`mt-3 flex items-center gap-2 px-3 py-2 rounded-xl bg-white shadow-sm`}>
                      <HeartPulse className={`w-4 h-4 flex-shrink-0 ${getBfrColor(plan.bfrResult.healthy)}`} />
                      <div>
                        <span className={`text-sm font-semibold ${getBfrColor(plan.bfrResult.healthy)}`}>
                          健康等级：{plan.bfrResult.healthy}
                        </span>
                        {plan.bfrResult.tip && (
                          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{plan.bfrResult.tip}</p>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : plan.bfrError ? (
              <Card className="border-0 shadow-sm border border-amber-100">
                <CardContent className="p-3">
                  <p className="text-xs text-amber-600 flex items-center gap-1">
                    <span>⚠</span> 体脂率接口：{plan.bfrError}
                  </p>
                </CardContent>
              </Card>
            ) : null}

            {/* BMI + 基础代谢卡片 */}
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">身体数据分析</h3>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-xs text-gray-400">BMI</p>
                    <p className={`text-xl font-bold mt-1 ${bmiColor}`}>{plan.bmi.toFixed(1)}</p>
                    <p className={`text-xs mt-0.5 ${bmiColor}`}>{plan.bmiStatus}</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-xs text-gray-400">基础代谢</p>
                    <p className="text-xl font-bold mt-1 text-gray-700">{plan.bmr}</p>
                    <p className="text-xs text-gray-400 mt-0.5">千卡/天</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-xs text-gray-400">目标差值</p>
                    <p className={`text-xl font-bold mt-1 ${plan.weightDiff < 0 ? "text-rose-500" : "text-green-500"}`}>
                      {plan.weightDiff > 0 ? "+" : ""}{plan.weightDiff.toFixed(1)}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">kg</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 每日热量方案 */}
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <Target className="w-4 h-4 text-rose-400" /> 每日营养目标
                </h3>
                <div className="space-y-2">
                  {plan.weeklyPlan.map((tip, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <div className="w-5 h-5 rounded-full bg-rose-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-rose-500 text-xs font-bold">{i + 1}</span>
                      </div>
                      <p className="text-xs text-gray-600 leading-relaxed">{tip}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* 饮食建议 */}
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <Salad className="w-4 h-4 text-green-400" /> 饮食建议
                </h3>
                <div className="space-y-2">
                  {plan.dietTips.map((tip, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-green-400 text-sm mt-0.5">✓</span>
                      <p className="text-xs text-gray-600 leading-relaxed">{tip}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* 运动建议 */}
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <Dumbbell className="w-4 h-4 text-blue-400" /> 运动建议
                </h3>
                <div className="space-y-2">
                  {plan.exerciseTips.map((tip, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-blue-400 text-sm mt-0.5">▸</span>
                      <p className="text-xs text-gray-600 leading-relaxed">{tip}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* 美容院配合建议 */}
            <Card className="border-0 shadow-sm bg-gradient-to-br from-rose-50 to-pink-50">
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold text-rose-600 mb-3 flex items-center gap-2">
                  ✨ 奢贝专属美容建议
                </h3>
                <div className="space-y-2">
                  {plan.beautyTips.map((tip, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-rose-400 text-sm mt-0.5">♥</span>
                      <p className="text-xs text-rose-700 leading-relaxed">{tip}</p>
                    </div>
                  ))}
                </div>
                <Link href="/beauty/booking">
                  <button className="mt-4 w-full bg-rose-500 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-rose-600 transition-colors">
                    立即预约塑形护理 →
                  </button>
                </Link>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
