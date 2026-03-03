/**
 * 减肥打卡 - 统一录入页面
 * 风格与 AddTransaction.tsx 完全一致（红色顶栏 + 白色卡片 + 底部提交）
 * 分类：体重（斤/公斤）| 三围 | BMI指标 | 记录消耗
 * 支持照片上传
 */
import { useState, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { ChevronLeft, Scale, Ruler, BarChart2, Flame, Camera, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { autoCompressImage } from "@/utils/imageUtils";

type Category = "weight" | "measurement" | "bmi" | "calorie";

const CATEGORIES: { id: Category; label: string; icon: React.ReactNode; color: string; bg: string }[] = [
  { id: "weight",      label: "体重",    icon: <Scale className="w-5 h-5" />,    color: "text-rose-500",   bg: "bg-rose-50 border-rose-200" },
  { id: "measurement", label: "三围",    icon: <Ruler className="w-5 h-5" />,    color: "text-violet-500", bg: "bg-violet-50 border-violet-200" },
  { id: "bmi",         label: "BMI指标", icon: <BarChart2 className="w-5 h-5" />, color: "text-blue-500",   bg: "bg-blue-50 border-blue-200" },
  { id: "calorie",     label: "记录消耗", icon: <Flame className="w-5 h-5" />,   color: "text-orange-500", bg: "bg-orange-50 border-orange-200" },
];

const ACTIVITY_TYPES = ["跑步", "快走", "游泳", "骑车", "瑜伽", "健身操", "力量训练", "跳绳", "爬山", "其他"];

const ACCENT: Record<Category, string> = {
  weight:      "#E53935",
  measurement: "#7C3AED",
  bmi:         "#1D4ED8",
  calorie:     "#EA580C",
};

export default function DietCheckIn() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const ledgerId = Number(id);
  const today = new Date().toISOString().slice(0, 10);

  // ---- 通用状态 ----
  const [category, setCategory] = useState<Category>("weight");
  const [recordDate, setRecordDate] = useState(today);
  const [note, setNote] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // ---- 体重 ----
  const [weight, setWeight] = useState("");
  const [weightUnit, setWeightUnit] = useState<"jin" | "kg">("jin");

  // ---- 三围 ----
  const [chest, setChest] = useState("");
  const [waist, setWaist] = useState("");
  const [hip, setHip] = useState("");

  // ---- BMI ----
  const [bmiHeight, setBmiHeight] = useState("");
  const [bmiWeight, setBmiWeight] = useState("");
  const computedBmi = (() => {
    const h = parseFloat(bmiHeight);
    const w = parseFloat(bmiWeight);
    if (h > 0 && w > 0) {
      const hm = h / 100;
      return (w / (hm * hm)).toFixed(1);
    }
    return null;
  })();

  // ---- 卡路里 ----
  const [calories, setCalories] = useState("");
  const [activityType, setActivityType] = useState("跑步");

  // ---- mutations ----
  const addWeightMutation = trpc.diet.addWeight.useMutation({
    onSuccess: () => { toast.success("体重打卡成功！"); setTimeout(() => setLocation(`/ledger/${ledgerId}`), 800); },
    onError: (e) => toast.error("记录失败：" + e.message),
  });
  const addMeasurementMutation = trpc.diet.addMeasurement.useMutation({
    onSuccess: () => { toast.success("记录成功！"); setTimeout(() => setLocation(`/ledger/${ledgerId}`), 800); },
    onError: (e) => toast.error("记录失败：" + e.message),
  });
  const addCalorieMutation = trpc.diet.addCalorie.useMutation({
    onSuccess: () => { toast.success("消耗记录成功！"); setTimeout(() => setLocation(`/ledger/${ledgerId}`), 800); },
    onError: (e) => toast.error("记录失败：" + e.message),
  });
  const uploadImageMutation = trpc.ledger.uploadLedgerImage.useMutation();

  const isPending = addWeightMutation.isPending || addMeasurementMutation.isPending || addCalorieMutation.isPending;
  const accent = ACCENT[category];

  // ---- 图片上传 ----
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploading(true);
      toast.loading("上传中...");
      const { base64 } = await autoCompressImage(file, "normal");
      const result = await uploadImageMutation.mutateAsync({ imageData: base64 });
      toast.dismiss();
      if (result.success && result.imageUrl) {
        setImageUrl(result.imageUrl);
        toast.success("图片上传成功");
      }
    } catch {
      toast.dismiss();
      toast.error("图片上传失败，请重试");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // ---- 提交 ----
  const handleSubmit = () => {
    if (category === "weight") {
      const w = parseFloat(weight);
      if (!w || w <= 0) { toast.error("请输入有效体重"); return; }
      addWeightMutation.mutate({ ledgerId, weight: w, weightUnit, imageUrl: imageUrl ?? undefined, note: note || undefined, recordDate });
    } else if (category === "measurement") {
      const c = parseFloat(chest), wa = parseFloat(waist), h = parseFloat(hip);
      if ((!c || c <= 0) && (!wa || wa <= 0) && (!h || h <= 0)) { toast.error("请至少填写一项三围数据"); return; }
      addMeasurementMutation.mutate({ ledgerId, measureType: "measurement", chest: c || undefined, waist: wa || undefined, hip: h || undefined, imageUrl: imageUrl ?? undefined, note: note || undefined, recordDate });
    } else if (category === "bmi") {
      const hv = parseFloat(bmiHeight), wv = parseFloat(bmiWeight);
      if (!hv || hv <= 0 || !wv || wv <= 0) { toast.error("请填写身高和体重"); return; }
      const bmiVal = parseFloat(computedBmi!);
      addMeasurementMutation.mutate({ ledgerId, measureType: "bmi", height: hv, weight: wv, bmi: bmiVal, imageUrl: imageUrl ?? undefined, note: note || undefined, recordDate });
    } else {
      const c = parseFloat(calories);
      if (!c || c <= 0) { toast.error("请输入有效卡路里"); return; }
      addCalorieMutation.mutate({ ledgerId, calories: c, activityType, note: note || undefined, recordDate });
    }
  };

  return (
    <div className="h-screen flex flex-col bg-[#FAF3ED]">
      {/* 顶部红色导航栏 */}
      <div className="bg-[#D32F2F] text-white px-3 py-3 flex items-center justify-between flex-shrink-0">
        <button onClick={() => setLocation(`/ledger/${ledgerId}`)} className="p-1">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-base font-semibold">减肥打卡</h1>
        <div className="w-7" />
      </div>

      {/* 分类选择 */}
      <div className="px-4 pt-3 pb-2 flex-shrink-0">
        <div className="grid grid-cols-4 gap-2">
          {CATEGORIES.map((cat) => {
            const active = category === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setCategory(cat.id)}
                className={`flex flex-col items-center gap-1.5 py-2.5 rounded-xl border transition-all ${
                  active ? `${cat.bg} border-current ${cat.color} shadow-sm` : "bg-white border-gray-100 text-gray-400"
                }`}
              >
                <span className={active ? cat.color : "text-gray-400"}>{cat.icon}</span>
                <span className={`text-xs font-medium ${active ? cat.color : "text-gray-500"}`}>{cat.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 可滚动内容区 */}
      <div className="flex-1 overflow-y-auto px-4 pb-32 space-y-3 pt-1">

        {/* 日期 */}
        <div className="bg-white rounded-xl shadow-sm px-4 py-3 flex items-center justify-between">
          <span className="text-sm text-gray-500">记录日期</span>
          <input
            type="date"
            value={recordDate}
            onChange={(e) => setRecordDate(e.target.value)}
            className="text-sm text-gray-800 border-none outline-none bg-transparent text-right"
          />
        </div>

        {/* ===== 体重 ===== */}
        {category === "weight" && (
          <>
            {/* 单位切换 */}
            <div className="bg-white rounded-xl shadow-sm px-4 py-3">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-gray-700">体重单位</span>
                <div className="flex bg-gray-100 rounded-lg p-0.5">
                  {(["jin", "kg"] as const).map((u) => (
                    <button
                      key={u}
                      onClick={() => setWeightUnit(u)}
                      className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                        weightUnit === u ? "bg-white text-rose-600 shadow-sm" : "text-gray-500"
                      }`}
                    >
                      {u === "jin" ? "斤" : "公斤"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-end gap-2">
                <input
                  type="number"
                  inputMode="decimal"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  placeholder="0.0"
                  className="flex-1 text-5xl font-light text-[#222] bg-transparent border-none outline-none placeholder-gray-200 text-center"
                  style={{ caretColor: accent }}
                />
                <span className="text-base text-gray-400 mb-2">{weightUnit === "jin" ? "斤" : "kg"}</span>
              </div>
              <p className="text-xs text-gray-400 text-center mt-1">请填写今天称重的实际体重</p>
            </div>
          </>
        )}

        {/* ===== 三围 ===== */}
        {category === "measurement" && (
          <div className="bg-white rounded-xl shadow-sm px-4 py-3 space-y-4">
            <p className="text-xs text-gray-400">填写您的三围数据（单位：cm，可只填部分）</p>
            {[
              { label: "胸围", value: chest, set: setChest, placeholder: "如：88" },
              { label: "腰围", value: waist, set: setWaist, placeholder: "如：68" },
              { label: "臀围", value: hip,   set: setHip,   placeholder: "如：92" },
            ].map(({ label, value, set, placeholder }) => (
              <div key={label} className="flex items-center gap-3">
                <span className="w-10 text-sm font-medium text-gray-600 flex-shrink-0">{label}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={value}
                  onChange={(e) => set(e.target.value)}
                  placeholder={placeholder}
                  className="flex-1 text-2xl font-light text-[#222] border-b border-gray-200 pb-1 outline-none bg-transparent text-center placeholder-gray-200"
                  style={{ caretColor: accent }}
                />
                <span className="text-sm text-gray-400 flex-shrink-0">cm</span>
              </div>
            ))}
          </div>
        )}

        {/* ===== BMI ===== */}
        {category === "bmi" && (
          <div className="bg-white rounded-xl shadow-sm px-4 py-3 space-y-4">
            <p className="text-xs text-gray-400">输入身高和体重，自动计算 BMI 指数</p>
            {[
              { label: "身高", value: bmiHeight, set: setBmiHeight, unit: "cm", placeholder: "如：165" },
              { label: "体重", value: bmiWeight, set: setBmiWeight, unit: "kg", placeholder: "如：60" },
            ].map(({ label, value, set, unit, placeholder }) => (
              <div key={label} className="flex items-center gap-3">
                <span className="w-10 text-sm font-medium text-gray-600 flex-shrink-0">{label}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={value}
                  onChange={(e) => set(e.target.value)}
                  placeholder={placeholder}
                  className="flex-1 text-2xl font-light text-[#222] border-b border-gray-200 pb-1 outline-none bg-transparent text-center placeholder-gray-200"
                  style={{ caretColor: accent }}
                />
                <span className="text-sm text-gray-400 flex-shrink-0">{unit}</span>
              </div>
            ))}
            {/* BMI 结果展示 */}
            {computedBmi && (
              <div className="mt-2 rounded-xl py-3 text-center" style={{ backgroundColor: "#EFF6FF" }}>
                <p className="text-xs text-blue-400 mb-1">您的 BMI 指数</p>
                <p className="text-4xl font-bold text-blue-600">{computedBmi}</p>
                <p className="text-xs text-blue-400 mt-1">
                  {(() => {
                    const v = parseFloat(computedBmi);
                    if (v < 18.5) return "偏瘦";
                    if (v < 24) return "正常";
                    if (v < 28) return "超重";
                    return "肥胖";
                  })()}
                </p>
              </div>
            )}
          </div>
        )}

        {/* ===== 卡路里 ===== */}
        {category === "calorie" && (
          <>
            <div className="bg-white rounded-xl shadow-sm px-4 py-3">
              <div className="flex items-end gap-2 overflow-hidden">
                <div className="flex-1 min-w-0 overflow-hidden">
                  <input
                    type="number"
                    inputMode="decimal"
                    value={calories}
                    onChange={(e) => setCalories(e.target.value)}
                    placeholder="0"
                    className="w-full text-5xl font-light text-[#222] bg-transparent border-none outline-none placeholder-gray-200 text-right"
                    style={{ caretColor: accent }}
                  />
                </div>
                <span className="text-base text-gray-400 mb-2 flex-shrink-0">kcal</span>
              </div>
              <p className="text-xs text-gray-400 text-center mt-1">今日消耗的卡路里</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm px-4 py-3">
              <p className="text-xs text-gray-500 mb-2">运动类型</p>
              <div className="flex flex-wrap gap-2">
                {ACTIVITY_TYPES.map((t) => (
                  <button
                    key={t}
                    onClick={() => setActivityType(t)}
                    className={`px-3 py-1.5 rounded-full text-sm transition-all ${
                      activityType === t ? "text-white" : "bg-gray-100 text-gray-600"
                    }`}
                    style={activityType === t ? { backgroundColor: accent } : {}}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* 照片上传（体重/三围/BMI 显示） */}
        {category !== "calorie" && (
          <div className="bg-white rounded-xl shadow-sm px-4 py-3">
            <p className="text-xs text-gray-500 mb-2">上传照片（选填）</p>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
            {imageUrl ? (
              <div className="relative w-24 h-24">
                <img src={imageUrl} alt="打卡照片" className="w-full h-full object-cover rounded-xl" />
                <button
                  onClick={() => setImageUrl(null)}
                  className="absolute -top-2 -right-2 w-6 h-6 bg-gray-700 text-white rounded-full flex items-center justify-center"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-gray-300 text-gray-400 text-sm hover:border-gray-400 transition-colors"
              >
                <Camera className="w-4 h-4" />
                {uploading ? "上传中..." : "添加打卡照片"}
              </button>
            )}
          </div>
        )}

        {/* 备注 */}
        <div className="bg-white rounded-xl shadow-sm px-4 py-3">
          <p className="text-xs text-gray-500 mb-2">备注（选填）</p>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="今天的感受，或者运动详情..."
            rows={3}
            className="w-full border-none outline-none text-sm text-gray-700 resize-none placeholder-gray-300"
          />
        </div>
      </div>

      {/* 固定底部提交按钮 */}
      <div className="fixed bottom-0 left-0 right-0 px-4 pb-6 pt-3 bg-gradient-to-t from-[#FAF3ED] to-transparent">
        <button
          onClick={handleSubmit}
          disabled={isPending}
          className="w-full py-4 rounded-2xl text-white text-base font-semibold shadow-lg transition-all active:scale-95 disabled:opacity-60"
          style={{ backgroundColor: accent }}
        >
          {isPending ? "保存中..." : (() => {
            if (category === "weight") return "✓ 完成体重打卡";
            if (category === "measurement") return "✓ 记录三围数据";
            if (category === "bmi") return "✓ 记录 BMI 指标";
            return "✓ 记录卡路里消耗";
          })()}
        </button>
      </div>
    </div>
  );
}
