/**
 * 食物识别独立模块
 * 功能：上传食物照片 → AI识别 → 显示热量、建议量、减肥评价
 * 无需填写其他字段，只需上传照片即可获得AI分析
 */
import { useState, useRef } from "react";
import { Camera, X, Loader2, AlertCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { autoCompressImage } from "@/utils/imageUtils";

interface FoodAnalysis {
  foodName: string;
  calories: number;
  caloriesRange: string;
  recommendedAmount: string;
  dietRating: "多吃" | "适量" | "少吃";
  dietRatingReason: string;
  nutrition: {
    protein: string;
    carbs: string;
    fat: string;
  };
  benefits: string[];
  warnings: string[];
}

export default function FoodRecognition() {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<FoodAnalysis | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const uploadImageMutation = trpc.ledger.uploadLedgerImage.useMutation();
  const analyzeFoodMutation = trpc.diet.analyzeFood.useMutation({
    onSuccess: (data) => {
      setAnalyzing(false);
      if (data.success && data.analysis) {
        setAnalysis(data.analysis);
        toast.success("分析完成");
      } else {
        toast.error("分析失败，请重试");
      }
    },
    onError: (err) => {
      setAnalyzing(false);
      toast.error("分析失败：" + err.message);
    },
  });

  // 图片上传
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
        setAnalysis(null); // 清除之前的分析
        toast.success("图片上传成功，开始分析...");
        
        // 自动开始分析
        setTimeout(() => handleAnalyze(result.imageUrl), 500);
      }
    } catch {
      toast.dismiss();
      toast.error("图片上传失败，请重试");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // AI分析食物
  const handleAnalyze = async (url: string) => {
    if (!url) return;
    try {
      setAnalyzing(true);
      toast.loading("AI分析中...");
      await analyzeFoodMutation.mutateAsync({ imageUrl: url });
      toast.dismiss();
    } catch {
      toast.dismiss();
      toast.error("分析失败，请重试");
      setAnalyzing(false);
    }
  };

  // 重新上传
  const handleReset = () => {
    setImageUrl(null);
    setAnalysis(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="space-y-3">
      {/* 上传区域 */}
      {!imageUrl ? (
        <div className="bg-white rounded-xl shadow-sm px-4 py-6">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="w-full flex flex-col items-center gap-3 py-6 rounded-xl border-2 border-dashed border-green-200 hover:border-green-300 transition-colors"
          >
            <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center">
              <Camera className="w-6 h-6 text-green-500" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-gray-700">
                {uploading ? "上传中..." : "上传食物照片"}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                拍摄或选择食物照片，AI将自动识别并分析
              </p>
            </div>
          </button>
        </div>
      ) : null}

      {/* 已上传的图片 */}
      {imageUrl && (
        <div className="bg-white rounded-xl shadow-sm px-4 py-3">
          <div className="relative w-full h-48 rounded-lg overflow-hidden mb-3">
            <img src={imageUrl} alt="食物照片" className="w-full h-full object-cover" />
            {!analyzing && (
              <button
                onClick={handleReset}
                className="absolute top-2 right-2 w-8 h-8 bg-gray-900/50 text-white rounded-full flex items-center justify-center hover:bg-gray-900/70"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* 分析中 */}
          {analyzing && (
            <div className="flex items-center justify-center py-8 gap-2 text-green-600">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">AI分析中，请稍候...</span>
            </div>
          )}

          {/* 分析结果 */}
          {analysis && !analyzing && (
            <div className="space-y-4">
              {/* 食物名称 */}
              <div className="pb-3 border-b border-gray-100">
                <h3 className="text-lg font-semibold text-gray-800">{analysis.foodName}</h3>
              </div>

              {/* 热量信息 */}
              <div className="bg-green-50 rounded-lg p-3">
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-3xl font-bold text-green-600">
                    {analysis.calories}
                  </span>
                  <span className="text-sm text-gray-600">kcal</span>
                </div>
                <p className="text-xs text-gray-500">
                  热量范围：{analysis.caloriesRange}
                </p>
              </div>

              {/* 建议食用量 */}
              <div className="bg-blue-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">建议食用量</p>
                <p className="text-sm font-medium text-gray-800">
                  {analysis.recommendedAmount}
                </p>
              </div>

              {/* 减肥评价 */}
              <div className={`rounded-lg p-3 ${
                analysis.dietRating === "多吃" ? "bg-green-50" :
                analysis.dietRating === "适量" ? "bg-yellow-50" :
                "bg-red-50"
              }`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-sm font-semibold ${
                    analysis.dietRating === "多吃" ? "text-green-600" :
                    analysis.dietRating === "适量" ? "text-yellow-600" :
                    "text-red-600"
                  }`}>
                    {analysis.dietRating}
                  </span>
                </div>
                <p className="text-xs text-gray-600">
                  {analysis.dietRatingReason}
                </p>
              </div>

              {/* 营养成分 */}
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-2 font-medium">营养成分</p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "蛋白质", value: analysis.nutrition.protein },
                    { label: "碳水化合物", value: analysis.nutrition.carbs },
                    { label: "脂肪", value: analysis.nutrition.fat },
                  ].map(({ label, value }) => (
                    <div key={label} className="text-center">
                      <p className="text-xs text-gray-500">{label}</p>
                      <p className="text-sm font-semibold text-gray-800">{value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* 健康提示 */}
              {analysis.benefits.length > 0 && (
                <div className="bg-green-50 rounded-lg p-3">
                  <p className="text-xs text-green-600 font-medium mb-1">✓ 健康优势</p>
                  <ul className="space-y-1">
                    {analysis.benefits.map((benefit, i) => (
                      <li key={i} className="text-xs text-green-700">
                        • {benefit}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 注意事项 */}
              {analysis.warnings.length > 0 && (
                <div className="bg-orange-50 rounded-lg p-3">
                  <div className="flex gap-2">
                    <AlertCircle className="w-4 h-4 text-orange-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs text-orange-600 font-medium mb-1">⚠ 注意事项</p>
                      <ul className="space-y-1">
                        {analysis.warnings.map((warning, i) => (
                          <li key={i} className="text-xs text-orange-700">
                            • {warning}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* 重新分析按钮 */}
              <button
                onClick={handleReset}
                className="w-full py-2.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                重新上传照片
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
