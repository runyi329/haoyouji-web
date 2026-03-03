/**
 * 减肥账本 - 初始配置页（设置初始体重、目标体重）
 */
import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { ChevronLeft, Target } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function DietConfig() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const ledgerId = Number(id);

  const { data: existingConfig } = trpc.diet.getConfig.useQuery({ ledgerId });

  const [initialWeight, setInitialWeight] = useState("");
  const [targetWeight, setTargetWeight] = useState("");
  const [height, setHeight] = useState("");
  const [gender, setGender] = useState<"female" | "male">("female");

  useEffect(() => {
    if (existingConfig) {
      setInitialWeight(String(existingConfig.initialWeight ?? ""));
      setTargetWeight(String(existingConfig.targetWeight ?? ""));
      setHeight(String(existingConfig.height ?? ""));
      setGender(existingConfig.gender ?? "female");
    }
  }, [existingConfig]);

  const saveMutation = trpc.diet.saveConfig.useMutation({
    onSuccess: () => {
      toast.success("目标设置成功！");
      setLocation(`/ledger/${ledgerId}`);
    },
    onError: (e) => toast.error("保存失败：" + e.message),
  });

  const handleSave = () => {
    const iw = Number(initialWeight);
    const tw = Number(targetWeight);
    const h = Number(height);
    if (!iw || iw <= 0) { toast.error("请输入有效的初始体重"); return; }
    if (!tw || tw <= 0) { toast.error("请输入有效的目标体重"); return; }
    if (tw >= iw) { toast.error("目标体重应小于初始体重"); return; }
    saveMutation.mutate({
      ledgerId,
      initialWeight: iw,
      targetWeight: tw,
      currentWeight: iw,
      height: h > 0 ? h : undefined,
      gender,
    });
  };

  return (
    <div className="min-h-screen bg-[#FFF5F5]">
      {/* 顶部导航 */}
      <div className="bg-gradient-to-r from-rose-500 to-pink-400 text-white px-3 py-3 flex items-center">
        <button onClick={() => setLocation(`/ledger/${ledgerId}`)} className="p-1 -ml-1">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="flex-1 text-center text-base font-semibold pr-6">设置减肥目标</h1>
      </div>

      <div className="p-4 space-y-4">
        {/* 提示 */}
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-start gap-3">
          <Target className="w-5 h-5 text-rose-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-rose-700">设置你的初始体重和目标体重，系统将为你生成专属减肥进度追踪</p>
        </div>

        {/* 性别 */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <label className="block text-xs text-gray-500 mb-2">性别</label>
          <div className="flex gap-3">
            <button
              onClick={() => setGender("female")}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all ${
                gender === "female" ? "bg-rose-500 text-white" : "bg-gray-100 text-gray-600"
              }`}
            >
              女
            </button>
            <button
              onClick={() => setGender("male")}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all ${
                gender === "male" ? "bg-rose-500 text-white" : "bg-gray-100 text-gray-600"
              }`}
            >
              男
            </button>
          </div>
        </div>

        {/* 身高（选填） */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <label className="block text-xs text-gray-500 mb-2">身高（选填）</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              placeholder="请输入身高"
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-lg font-bold text-gray-800 focus:outline-none focus:border-rose-400 text-center"
            />
            <span className="text-sm text-gray-500">cm</span>
          </div>
        </div>

        {/* 初始体重 */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <label className="block text-xs text-gray-500 mb-2">初始体重（开始减肥时的体重）</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={initialWeight}
              onChange={(e) => setInitialWeight(e.target.value)}
              placeholder="请输入初始体重"
              className="flex-1 border border-gray-200 rounded-xl px-3 py-3 text-2xl font-bold text-gray-800 focus:outline-none focus:border-rose-400 text-center"
            />
            <span className="text-base text-gray-500">斤</span>
          </div>
        </div>

        {/* 目标体重 */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <label className="block text-xs text-gray-500 mb-2">目标体重（你想减到多少斤）</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={targetWeight}
              onChange={(e) => setTargetWeight(e.target.value)}
              placeholder="请输入目标体重"
              className="flex-1 border border-gray-200 rounded-xl px-3 py-3 text-2xl font-bold text-rose-500 focus:outline-none focus:border-rose-400 text-center"
            />
            <span className="text-base text-gray-500">斤</span>
          </div>
          {initialWeight && targetWeight && Number(targetWeight) < Number(initialWeight) && (
            <p className="text-xs text-rose-500 mt-2 text-center">
              目标减重 {(Number(initialWeight) - Number(targetWeight)).toFixed(1)} 斤，加油！
            </p>
          )}
        </div>

        {/* 保存按钮 */}
        <button
          onClick={handleSave}
          disabled={saveMutation.isPending}
          className="w-full py-4 rounded-2xl bg-gradient-to-r from-rose-500 to-pink-400 text-white text-base font-semibold shadow-sm active:scale-95 transition-all disabled:opacity-60"
        >
          {saveMutation.isPending ? "保存中..." : "确认设置目标"}
        </button>
      </div>
    </div>
  );
}
