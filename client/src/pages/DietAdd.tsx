/**
 * 减肥账本 - 添加记录页（体重打卡 / 卡路里消耗）
 */
import { useState } from "react";
import { useParams, useLocation, useSearch } from "wouter";
import { ChevronLeft, Scale, Flame, CheckCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const ACTIVITY_TYPES = [
  "跑步", "快走", "游泳", "骑车", "瑜伽", "健身操", "力量训练", "跳绳", "爬山", "其他"
];

export default function DietAdd() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const defaultType = params.get("type") === "calorie" ? "calorie" : "weight";

  const ledgerId = Number(id);
  const today = new Date().toISOString().slice(0, 10);

  const [recordType, setRecordType] = useState<"weight" | "calorie">(defaultType);
  const [weight, setWeight] = useState("");
  const [calories, setCalories] = useState("");
  const [activityType, setActivityType] = useState("跑步");
  const [note, setNote] = useState("");
  const [recordDate, setRecordDate] = useState(today);
  const [done, setDone] = useState(false);

  const addWeightMutation = trpc.diet.addWeight.useMutation({
    onSuccess: () => {
      setDone(true);
      setTimeout(() => setLocation(`/ledger/${ledgerId}`), 1200);
    },
    onError: (e) => toast.error("记录失败：" + e.message),
  });

  const addCalorieMutation = trpc.diet.addCalorie.useMutation({
    onSuccess: () => {
      setDone(true);
      setTimeout(() => setLocation(`/ledger/${ledgerId}`), 1200);
    },
    onError: (e) => toast.error("记录失败：" + e.message),
  });

  const handleSubmit = () => {
    if (recordType === "weight") {
      if (!weight || isNaN(Number(weight)) || Number(weight) <= 0) {
        toast.error("请输入有效的体重");
        return;
      }
      addWeightMutation.mutate({
        ledgerId,
        weight: Number(weight),
        note: note || undefined,
        recordDate,
      });
    } else {
      if (!calories || isNaN(Number(calories)) || Number(calories) <= 0) {
        toast.error("请输入有效的卡路里数值");
        return;
      }
      addCalorieMutation.mutate({
        ledgerId,
        calories: Number(calories),
        activityType,
        note: note || undefined,
        recordDate,
      });
    }
  };

  if (done) {
    return (
      <div className="min-h-screen bg-[#FFF5F5] flex flex-col items-center justify-center gap-4">
        <div className="w-16 h-16 bg-rose-100 rounded-full flex items-center justify-center">
          <CheckCircle className="w-9 h-9 text-rose-500" />
        </div>
        <p className="text-lg font-semibold text-gray-800">打卡成功！</p>
        <p className="text-sm text-gray-500">继续加油，你最棒！💪</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FFF5F5]">
      {/* 顶部导航 */}
      <div className="bg-gradient-to-r from-rose-500 to-pink-400 text-white px-3 py-3 flex items-center">
        <button onClick={() => setLocation(`/ledger/${ledgerId}`)} className="p-1 -ml-1">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="flex-1 text-center text-base font-semibold pr-6">记录数据</h1>
      </div>

      <div className="p-4 space-y-4">
        {/* 类型切换 */}
        <div className="bg-white rounded-2xl p-1 flex shadow-sm">
          <button
            onClick={() => setRecordType("weight")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all ${
              recordType === "weight"
                ? "bg-rose-500 text-white shadow-sm"
                : "text-gray-500"
            }`}
          >
            <Scale className="w-4 h-4" />
            体重打卡
          </button>
          <button
            onClick={() => setRecordType("calorie")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all ${
              recordType === "calorie"
                ? "bg-orange-500 text-white shadow-sm"
                : "text-gray-500"
            }`}
          >
            <Flame className="w-4 h-4" />
            记录消耗
          </button>
        </div>

        {/* 日期 */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <label className="block text-xs text-gray-500 mb-2">记录日期</label>
          <input
            type="date"
            value={recordDate}
            onChange={(e) => setRecordDate(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:border-rose-400"
          />
        </div>

        {/* 体重输入 */}
        {recordType === "weight" && (
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <label className="block text-xs text-gray-500 mb-2">当前体重</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="请输入体重"
                className="flex-1 border border-gray-200 rounded-xl px-3 py-3 text-2xl font-bold text-rose-500 focus:outline-none focus:border-rose-400 text-center"
              />
              <span className="text-base text-gray-500 font-medium">斤</span>
            </div>
            <p className="text-xs text-gray-400 mt-2 text-center">请填写今天称重的实际体重</p>
          </div>
        )}

        {/* 卡路里输入 */}
        {recordType === "calorie" && (
          <>
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <label className="block text-xs text-gray-500 mb-2">消耗卡路里</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={calories}
                  onChange={(e) => setCalories(e.target.value)}
                  placeholder="请输入卡路里"
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-3 text-2xl font-bold text-orange-500 focus:outline-none focus:border-orange-400 text-center"
                />
                <span className="text-base text-gray-500 font-medium">kcal</span>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <label className="block text-xs text-gray-500 mb-2">运动类型</label>
              <div className="flex flex-wrap gap-2">
                {ACTIVITY_TYPES.map((type) => (
                  <button
                    key={type}
                    onClick={() => setActivityType(type)}
                    className={`px-3 py-1.5 rounded-full text-sm transition-all ${
                      activityType === type
                        ? "bg-orange-500 text-white"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* 备注 */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <label className="block text-xs text-gray-500 mb-2">备注（选填）</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="今天的感受，或者运动详情..."
            rows={3}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:border-rose-400 resize-none"
          />
        </div>

        {/* 提交按钮 */}
        <button
          onClick={handleSubmit}
          disabled={addWeightMutation.isPending || addCalorieMutation.isPending}
          className={`w-full py-4 rounded-2xl text-white text-base font-semibold shadow-sm transition-all active:scale-95 ${
            recordType === "weight"
              ? "bg-gradient-to-r from-rose-500 to-pink-400"
              : "bg-gradient-to-r from-orange-500 to-amber-400"
          } disabled:opacity-60`}
        >
          {addWeightMutation.isPending || addCalorieMutation.isPending
            ? "保存中..."
            : recordType === "weight"
            ? "✓ 完成体重打卡"
            : "✓ 记录卡路里消耗"}
        </button>
      </div>
    </div>
  );
}
