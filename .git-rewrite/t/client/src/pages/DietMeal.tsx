/**
 * 减肥账本 - AI营养师页
 * 用户上传三餐照片，AI分析营养成分并给出建议
 */
import { useState, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { ChevronLeft, Camera, Brain, Loader2, CheckCircle, AlertCircle, Star, ChevronDown, ChevronUp } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

type MealType = "breakfast" | "lunch" | "dinner" | "snack";

const MEAL_LABELS: Record<MealType, { label: string; color: string }> = {
  breakfast: { label: "早餐", color: "bg-amber-100 text-amber-600 border-amber-200" },
  lunch: { label: "午餐", color: "bg-orange-100 text-orange-600 border-orange-200" },
  dinner: { label: "晚餐", color: "bg-purple-100 text-purple-600 border-purple-200" },
  snack: { label: "加餐", color: "bg-green-100 text-green-600 border-green-200" },
};

interface MealAnalysis {
  foods: string[];
  totalCalories: number;
  nutrition: { carbs: number; protein: number; fat: number };
  issues: string[];
  suggestions: string[];
  score: number;
  summary: string;
}

interface MealRecord {
  id: number;
  mealType: MealType;
  imageUrl: string;
  aiAnalysis: MealAnalysis | null;
  recordDate: string;
}

function NutritionBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500 w-10">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-2">
        <div className={`${color} rounded-full h-2 transition-all`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs text-gray-600 w-8 text-right">{value}%</span>
    </div>
  );
}

function MealCard({ meal, expanded, onToggle }: { meal: MealRecord; expanded: boolean; onToggle: () => void }) {
  const meta = MEAL_LABELS[meal.mealType];
  const ai = meal.aiAnalysis;

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      {/* 照片 + 基本信息 */}
      <div className="flex gap-3 p-3">
        <img
          src={meal.imageUrl}
          alt={meta.label}
          className="w-20 h-20 rounded-xl object-cover flex-shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs px-2 py-0.5 rounded-full border ${meta.color}`}>
              {meta.label}
            </span>
            {ai && (
              <span className="text-xs text-gray-400">{meal.recordDate.slice(5)}</span>
            )}
          </div>
          {ai ? (
            <>
              <p className="text-sm text-gray-800 font-medium truncate">{ai.foods.slice(0, 3).join("、")}{ai.foods.length > 3 ? "..." : ""}</p>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-base font-bold text-orange-500">{ai.totalCalories} <span className="text-xs font-normal text-gray-400">kcal</span></span>
                <div className="flex items-center gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className={`w-3 h-3 ${i < Math.round(ai.score / 20) ? "text-amber-400 fill-amber-400" : "text-gray-200 fill-gray-200"}`} />
                  ))}
                  <span className="text-xs text-gray-400 ml-1">{ai.score}分</span>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{ai.summary}</p>
            </>
          ) : (
            <div className="flex items-center gap-2 mt-2">
              <Loader2 className="w-4 h-4 text-rose-400 animate-spin" />
              <span className="text-xs text-gray-400">AI分析中...</span>
            </div>
          )}
        </div>
        {ai && (
          <button onClick={onToggle} className="flex-shrink-0 self-center p-1">
            {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </button>
        )}
      </div>

      {/* 展开详情 */}
      {expanded && ai && (
        <div className="border-t border-gray-100 px-4 py-3 space-y-3">
          {/* 营养结构 */}
          <div>
            <p className="text-xs font-medium text-gray-700 mb-2">营养结构</p>
            <div className="space-y-1.5">
              <NutritionBar label="碳水" value={ai.nutrition.carbs} color="bg-amber-400" />
              <NutritionBar label="蛋白质" value={ai.nutrition.protein} color="bg-rose-400" />
              <NutritionBar label="脂肪" value={ai.nutrition.fat} color="bg-orange-400" />
            </div>
          </div>

          {/* 食物清单 */}
          <div>
            <p className="text-xs font-medium text-gray-700 mb-1.5">识别食物</p>
            <div className="flex flex-wrap gap-1.5">
              {ai.foods.map((f, i) => (
                <span key={i} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{f}</span>
              ))}
            </div>
          </div>

          {/* 问题 */}
          {ai.issues.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-700 mb-1.5">营养问题</p>
              <div className="space-y-1">
                {ai.issues.map((issue, i) => (
                  <div key={i} className="flex items-start gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                    <span className="text-xs text-gray-600">{issue}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 建议 */}
          {ai.suggestions.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-700 mb-1.5">改善建议</p>
              <div className="space-y-1">
                {ai.suggestions.map((s, i) => (
                  <div key={i} className="flex items-start gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" />
                    <span className="text-xs text-gray-600">{s}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function DietMeal() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const ledgerId = Number(id);
  const today = new Date().toISOString().slice(0, 10);

  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedMealType, setSelectedMealType] = useState<MealType>("breakfast");
  const [uploading, setUploading] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: meals = [], refetch } = trpc.diet.getMeals.useQuery({
    ledgerId,
    date: selectedDate,
  });

  const analyzeMutation = trpc.diet.analyzeMeal.useMutation({
    onSuccess: () => {
      toast.success("AI分析完成！");
      refetch();
      setUploading(false);
    },
    onError: (e) => {
      toast.error("分析失败：" + e.message);
      setUploading(false);
    },
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 压缩图片到base64
    setUploading(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target?.result as string;
      analyzeMutation.mutate({
        ledgerId,
        mealType: selectedMealType,
        imageBase64: base64,
        imageFilename: `${selectedMealType}_${Date.now()}.jpg`,
        recordDate: selectedDate,
      });
    };
    reader.readAsDataURL(file);
    // 重置input以允许重复选择同一文件
    e.target.value = "";
  };

  // 今日总卡路里摄入
  const totalIntakeCalories = (meals as MealRecord[])
    .filter((m) => m.aiAnalysis)
    .reduce((sum, m) => sum + (m.aiAnalysis?.totalCalories ?? 0), 0);

  return (
    <div className="min-h-screen bg-[#FFF5F5] pb-8">
      {/* 顶部导航 */}
      <div className="bg-gradient-to-r from-purple-500 to-pink-400 text-white px-3 py-3 flex items-center">
        <button onClick={() => setLocation(`/ledger/${ledgerId}`)} className="p-1 -ml-1">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="flex-1 text-center text-base font-semibold pr-6">AI 营养师</h1>
      </div>

      {/* 日期选择 */}
      <div className="mx-4 mt-4 bg-white rounded-2xl p-3 shadow-sm flex items-center gap-3">
        <Brain className="w-5 h-5 text-purple-500 flex-shrink-0" />
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="flex-1 text-sm text-gray-800 focus:outline-none"
        />
        {totalIntakeCalories > 0 && (
          <span className="text-sm font-bold text-orange-500">
            今日摄入 {totalIntakeCalories} kcal
          </span>
        )}
      </div>

      {/* 餐次选择 + 上传按钮 */}
      <div className="mx-4 mt-3 bg-white rounded-2xl p-4 shadow-sm">
        <p className="text-xs text-gray-500 mb-2">选择餐次，拍照上传</p>
        <div className="grid grid-cols-4 gap-2 mb-3">
          {(Object.entries(MEAL_LABELS) as [MealType, typeof MEAL_LABELS[MealType]][]).map(([type, meta]) => (
            <button
              key={type}
              onClick={() => setSelectedMealType(type)}
              className={`py-2.5 rounded-xl text-xs font-medium border transition-all ${
                selectedMealType === type
                  ? meta.color + " border-current"
                  : "bg-gray-50 text-gray-500 border-gray-100"
              }`}
            >
              {meta.label}
            </button>
          ))}
        </div>

        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="w-full py-3.5 rounded-xl bg-gradient-to-r from-purple-500 to-pink-400 text-white text-sm font-semibold flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-60"
        >
          {uploading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              AI分析中，请稍候...
            </>
          ) : (
            <>
              <Camera className="w-4 h-4" />
              拍照上传 {MEAL_LABELS[selectedMealType].label}
            </>
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          className="hidden"
        />
        <p className="text-xs text-gray-400 text-center mt-2">
          上传后AI将自动识别食物，分析热量和营养成分
        </p>
      </div>

      {/* 记录列表 */}
      <div className="mx-4 mt-3 space-y-3">
        {(meals as MealRecord[]).length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-gray-100 flex items-center justify-center">
              <svg className="w-6 h-6 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 11l19-9-9 19-2-8-8-2z" />
              </svg>
            </div>
            <p className="text-sm text-gray-400">今天还没有上传餐食照片</p>
            <p className="text-xs text-gray-300 mt-1">拍照上传你的三餐，AI帮你分析营养</p>
          </div>
        ) : (
          (meals as MealRecord[]).map((meal) => (
            <MealCard
              key={meal.id}
              meal={meal}
              expanded={expandedId === meal.id}
              onToggle={() => setExpandedId(expandedId === meal.id ? null : meal.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
