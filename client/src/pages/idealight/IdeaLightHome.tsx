/**
 * IDEALIGHT 红颜派 - 商家主页
 * 路径: /idealight
 * 无需登录，公开访问
 */
import { useState, useRef, useCallback } from "react";
import { Share2, ShoppingBag, Activity, BookOpen, ChevronRight, Phone, MessageCircle, Camera, RotateCcw, Sparkles, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import BottomNav from "@/components/BottomNav";
import { trpc } from "@/lib/trpc";

const CDN = "https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb";
const ICON_URL = `${CDN}/idealight_icon_white_ca457943.png`;

const PRODUCT_PAGES = [
  `${CDN}/page01_hero_a4d6eb0c.png`,
  `${CDN}/page02_brand_78d64c06.png`,
  `${CDN}/page03_science_bf5079d4.png`,
  `${CDN}/page04_sofa_v2_5f4efe0a.png`,
  `${CDN}/page05_vanity_v2_5da85aed.png`,
  `${CDN}/page06_before_after_3d2b74d4.png`,
  `${CDN}/page07_specs_v4_f66b5771.png`,
  `${CDN}/page08_steps_v3_1512b675.png`,
  `${CDN}/page09_faq_v3_ec6c2f75.png`,
  `${CDN}/page10_ending_0f63160b.png`,
];

type TabType = "intro" | "shop" | "health";

// 皮肤检测结果类型
interface SkinItem {
  score: number;
  level: string;
  desc: string;
}
interface SkinResult {
  wrinkles: SkinItem;
  pores: SkinItem;
  acne: SkinItem;
  sensitivity: SkinItem;
  texture: SkinItem;
  overall: { score: number; summary: string };
  suggestions: string[];
}

// 评分颜色
function getScoreColor(score: number): string {
  if (score >= 80) return "#C9A96E";
  if (score >= 60) return "#E8B4B8";
  return "#E07B8A";
}

// 评分弧形进度条
function ScoreRing({ score, label }: { score: number; label: string }) {
  const r = 28;
  const circ = 2 * Math.PI * r;
  const pct = score / 100;
  const color = getScoreColor(score);
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="72" height="72" viewBox="0 0 72 72">
        <circle cx="36" cy="36" r={r} fill="none" stroke="#F5E6E8" strokeWidth="5" />
        <circle
          cx="36" cy="36" r={r} fill="none"
          stroke={color} strokeWidth="5"
          strokeDasharray={`${circ * pct} ${circ * (1 - pct)}`}
          strokeLinecap="round"
          transform="rotate(-90 36 36)"
          style={{ transition: "stroke-dasharray 0.8s ease" }}
        />
        <text x="36" y="40" textAnchor="middle" fontSize="16" fontWeight="700" fill={color}>{score}</text>
      </svg>
      <span className="text-xs text-[#8B6B6B] font-medium">{label}</span>
    </div>
  );
}

// 健康检测组件
function HealthTab() {
  const [phase, setPhase] = useState<"idle" | "camera" | "preview" | "analyzing" | "result">("idle");
  const [capturedImage, setCapturedImage] = useState<string | null>(null); // data URL
  const [result, setResult] = useState<SkinResult | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const analyzeMutation = trpc.analyzeSkin.useMutation({
    onSuccess: (data) => {
      if (data.success && data.result) {
        setResult(data.result as SkinResult);
        setPhase("result");
      } else {
        toast.error("分析失败，请重试");
        setPhase("preview");
      }
    },
    onError: (err) => {
      toast.error(err.message || "AI分析失败，请重试");
      setPhase("preview");
    },
  });

  // 开启摄像头
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 640 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setPhase("camera");
    } catch {
      toast.error("无法访问摄像头，请检查权限设置");
    }
  }, []);

  // 拍照
  const capture = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const size = Math.min(video.videoWidth, video.videoHeight);
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const offsetX = (video.videoWidth - size) / 2;
    const offsetY = (video.videoHeight - size) / 2;
    ctx.drawImage(video, offsetX, offsetY, size, size, 0, 0, size, size);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    setCapturedImage(dataUrl);
    // 停止摄像头
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setPhase("preview");
  }, []);

  // 分析
  const analyze = useCallback(() => {
    if (!capturedImage) return;
    setPhase("analyzing");
    // 去掉 data:image/jpeg;base64, 前缀
    const base64 = capturedImage.split(",")[1];
    analyzeMutation.mutate({ imageBase64: base64, mimeType: "image/jpeg" });
  }, [capturedImage, analyzeMutation]);

  // 重新检测
  const reset = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCapturedImage(null);
    setResult(null);
    setPhase("idle");
  }, []);

  // ---- 渲染 ----
  return (
    <div className="min-h-[70vh] bg-gradient-to-b from-[#FDF6F0] to-[#FFF0F3] px-4 pt-6 pb-8">
      {/* 标题区 */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center gap-2 bg-white/80 rounded-full px-4 py-1.5 shadow-sm mb-3">
          <Sparkles className="w-3.5 h-3.5 text-[#C9A96E]" />
          <span className="text-xs text-[#8B6B6B] tracking-wider font-medium">AI 皮肤检测</span>
        </div>
        <h2 className="text-[#5C3D3D] text-xl font-bold">专业皮肤健康分析</h2>
        <p className="text-[#A07878] text-xs mt-1.5 leading-relaxed">
          基于 AI 视觉技术，精准检测皱纹、毛孔、痘痘<br />敏感肌与粗糙度，生成个性化护肤方案
        </p>
      </div>

      {/* 隐藏 canvas */}
      <canvas ref={canvasRef} className="hidden" />

      {/* === 待机状态 === */}
      {phase === "idle" && (
        <div className="flex flex-col items-center">
          {/* 装饰圆 */}
          <div className="relative w-52 h-52 mb-8">
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-[#F9D5D8] to-[#F5C8A0] opacity-30 animate-pulse" />
            <div className="absolute inset-4 rounded-full bg-gradient-to-br from-[#F5E6E8] to-[#FAE8D4] flex items-center justify-center shadow-inner">
              <div className="text-center">
                <Camera className="w-14 h-14 text-[#C9A96E] mx-auto mb-2" />
                <span className="text-[#8B6B6B] text-xs">点击开始检测</span>
              </div>
            </div>
            {/* 装饰点 */}
            {[0, 60, 120, 180, 240, 300].map((deg) => (
              <div
                key={deg}
                className="absolute w-2 h-2 rounded-full bg-[#E8B4B8]/60"
                style={{
                  top: `${50 - 46 * Math.cos((deg * Math.PI) / 180)}%`,
                  left: `${50 + 46 * Math.sin((deg * Math.PI) / 180)}%`,
                  transform: "translate(-50%,-50%)",
                }}
              />
            ))}
          </div>

          {/* 检测项目 */}
          <div className="w-full grid grid-cols-5 gap-2 mb-8">
            {[
              { label: "皱纹", emoji: "〰️" },
              { label: "毛孔", emoji: "◎" },
              { label: "痘痘", emoji: "●" },
              { label: "敏感肌", emoji: "🌸" },
              { label: "粗糙度", emoji: "≈" },
            ].map((item) => (
              <div key={item.label} className="flex flex-col items-center bg-white/70 rounded-2xl py-3 shadow-sm">
                <span className="text-base mb-1">{item.emoji}</span>
                <span className="text-[10px] text-[#8B6B6B] font-medium">{item.label}</span>
              </div>
            ))}
          </div>

          <p className="text-[#B09090] text-xs text-center mb-6 leading-relaxed">
            照片仅用于本次 AI 分析，不会上传或存储
          </p>

          <button
            onClick={startCamera}
            className="w-full max-w-xs bg-gradient-to-r from-[#C9A96E] to-[#E8B4B8] text-white rounded-full py-4 text-base font-semibold shadow-lg active:scale-95 transition-transform flex items-center justify-center gap-2"
          >
            <Camera className="w-5 h-5" />
            开始皮肤检测
          </button>
        </div>
      )}

      {/* === 摄像头状态 === */}
      {phase === "camera" && (
        <div className="flex flex-col items-center">
          <div className="relative w-full max-w-sm aspect-square rounded-3xl overflow-hidden shadow-xl mb-6">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover scale-x-[-1]"
            />
            {/* 人脸引导框 */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-48 h-60 border-2 border-[#C9A96E]/80 rounded-[50%] shadow-[0_0_0_2000px_rgba(0,0,0,0.3)]" />
            </div>
            <div className="absolute bottom-4 left-0 right-0 text-center">
              <span className="text-white/90 text-xs bg-black/40 rounded-full px-3 py-1">将脸部对准椭圆框内</span>
            </div>
          </div>
          <div className="flex gap-4 w-full max-w-sm">
            <button
              onClick={reset}
              className="flex-1 bg-white/80 text-[#8B6B6B] rounded-full py-3.5 text-sm font-medium border border-[#E8D0D0] active:bg-white/60"
            >
              取消
            </button>
            <button
              onClick={capture}
              className="flex-2 flex-[2] bg-gradient-to-r from-[#C9A96E] to-[#E8B4B8] text-white rounded-full py-3.5 text-sm font-semibold shadow-md active:scale-95 transition-transform flex items-center justify-center gap-2"
            >
              <Camera className="w-4 h-4" />
              拍照
            </button>
          </div>
        </div>
      )}

      {/* === 预览状态 === */}
      {phase === "preview" && capturedImage && (
        <div className="flex flex-col items-center">
          <div className="relative w-full max-w-sm aspect-square rounded-3xl overflow-hidden shadow-xl mb-6">
            <img src={capturedImage} alt="预览" className="w-full h-full object-cover scale-x-[-1]" />
            <div className="absolute top-3 right-3 bg-[#C9A96E] text-white text-xs rounded-full px-2.5 py-1 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              已拍摄
            </div>
          </div>
          <div className="flex gap-4 w-full max-w-sm">
            <button
              onClick={reset}
              className="flex-1 bg-white/80 text-[#8B6B6B] rounded-full py-3.5 text-sm font-medium border border-[#E8D0D0] active:bg-white/60 flex items-center justify-center gap-1.5"
            >
              <RotateCcw className="w-4 h-4" />
              重拍
            </button>
            <button
              onClick={analyze}
              className="flex-[2] bg-gradient-to-r from-[#C9A96E] to-[#E8B4B8] text-white rounded-full py-3.5 text-sm font-semibold shadow-md active:scale-95 transition-transform flex items-center justify-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              开始 AI 分析
            </button>
          </div>
        </div>
      )}

      {/* === 分析中 === */}
      {phase === "analyzing" && (
        <div className="flex flex-col items-center py-12">
          <div className="relative w-32 h-32 mb-8">
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-[#F9D5D8] to-[#F5C8A0] animate-spin" style={{ animationDuration: "3s" }} />
            <div className="absolute inset-2 rounded-full bg-[#FDF6F0] flex items-center justify-center">
              <Loader2 className="w-10 h-10 text-[#C9A96E] animate-spin" />
            </div>
          </div>
          <h3 className="text-[#5C3D3D] text-lg font-semibold mb-2">AI 正在分析中</h3>
          <p className="text-[#A07878] text-sm text-center leading-relaxed">
            正在检测皱纹、毛孔、痘痘<br />敏感肌与皮肤粗糙度…
          </p>
          <div className="mt-6 flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-2 h-2 rounded-full bg-[#E8B4B8]"
                style={{ animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }}
              />
            ))}
          </div>
        </div>
      )}

      {/* === 结果展示 === */}
      {phase === "result" && result && (
        <div className="flex flex-col">
          {/* 照片缩略图 + 综合评分 */}
          <div className="flex items-center gap-4 bg-white/80 rounded-2xl p-4 shadow-sm mb-5">
            {capturedImage && (
              <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 border-2 border-[#E8D0D0]">
                <img src={capturedImage} alt="检测照片" className="w-full h-full object-cover scale-x-[-1]" />
              </div>
            )}
            <div className="flex-1">
              <div className="text-[#8B6B6B] text-xs mb-1">综合评分</div>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-bold" style={{ color: getScoreColor(result.overall.score) }}>
                  {result.overall.score}
                </span>
                <span className="text-[#A07878] text-sm">/ 100</span>
              </div>
              <p className="text-[#8B6B6B] text-xs mt-1 leading-relaxed">{result.overall.summary}</p>
            </div>
          </div>

          {/* 五项评分 */}
          <div className="bg-white/80 rounded-2xl p-5 shadow-sm mb-5">
            <h3 className="text-[#5C3D3D] text-sm font-semibold mb-4 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-[#C9A96E]" />
              各项检测结果
            </h3>
            <div className="grid grid-cols-5 gap-2 mb-5">
              <ScoreRing score={result.wrinkles.score} label="皱纹" />
              <ScoreRing score={result.pores.score} label="毛孔" />
              <ScoreRing score={result.acne.score} label="痘痘" />
              <ScoreRing score={result.sensitivity.score} label="敏感肌" />
              <ScoreRing score={result.texture.score} label="粗糙度" />
            </div>
            {/* 详细说明 */}
            <div className="space-y-2.5">
              {[
                { label: "皱纹", data: result.wrinkles },
                { label: "毛孔", data: result.pores },
                { label: "痘痘", data: result.acne },
                { label: "敏感肌", data: result.sensitivity },
                { label: "粗糙度", data: result.texture },
              ].map(({ label, data }) => (
                <div key={label} className="flex items-start gap-3 bg-[#FDF6F0] rounded-xl px-3 py-2.5">
                  <div className="flex-shrink-0 mt-0.5">
                    <span
                      className="inline-block text-xs font-semibold rounded-full px-2 py-0.5"
                      style={{
                        background: getScoreColor(data.score) + "22",
                        color: getScoreColor(data.score),
                      }}
                    >
                      {data.level}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[#5C3D3D] text-xs font-medium">{label}：</span>
                    <span className="text-[#8B6B6B] text-xs">{data.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 护肤建议 */}
          <div className="bg-gradient-to-br from-[#FDF0F5] to-[#FDF6E8] rounded-2xl p-5 shadow-sm mb-6">
            <h3 className="text-[#5C3D3D] text-sm font-semibold mb-3 flex items-center gap-1.5">
              <span className="text-base">💆‍♀️</span>
              个性化护肤建议
            </h3>
            <div className="space-y-2.5">
              {result.suggestions.map((s, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <div
                    className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-bold mt-0.5"
                    style={{ background: "linear-gradient(135deg, #C9A96E, #E8B4B8)" }}
                  >
                    {i + 1}
                  </div>
                  <p className="text-[#6B4B4B] text-sm leading-relaxed">{s}</p>
                </div>
              ))}
            </div>
          </div>

          {/* 重新检测 */}
          <button
            onClick={reset}
            className="w-full bg-gradient-to-r from-[#C9A96E] to-[#E8B4B8] text-white rounded-full py-4 text-base font-semibold shadow-lg active:scale-95 transition-transform flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            重新检测
          </button>

          {/* 免责声明 */}
          <p className="text-center text-[#C0A0A0] text-[10px] mt-4 leading-relaxed">
            本检测结果仅供参考，不构成医疗诊断建议<br />如有皮肤问题请咨询专业皮肤科医生
          </p>
        </div>
      )}
    </div>
  );
}

export default function IdeaLightHome() {
  const [activeTab, setActiveTab] = useState<TabType>("intro");

  const handleShare = () => {
    const shareUrl = `${window.location.origin}/idealight`;
    if (navigator.share) {
      navigator.share({
        title: "IDEALIGHT 红颜派 · 红光美容灯",
        text: "650nm 黄金波长，科学美容，在家享受专业护肤体验",
        url: shareUrl,
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(shareUrl).then(() => {
        toast.success("链接已复制，快去分享吧！");
      });
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* 顶部导航 */}
      <div className="sticky top-0 z-50 bg-black/90 backdrop-blur-md border-b border-white/10">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <img src={ICON_URL} alt="IDEALIGHT" className="w-7 h-7 object-contain" />
            <span className="text-white font-semibold tracking-widest text-sm">IDEALIGHT</span>
          </div>
          <button
            onClick={handleShare}
            className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 rounded-full px-3 py-1.5 text-xs text-white/80 transition-colors"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>分享</span>
          </button>
        </div>
        <div className="flex border-t border-white/10">
          {([
            { key: "intro" as TabType, label: "产品介绍" },
            { key: "shop" as TabType, label: "商城" },
            { key: "health" as TabType, label: "健康检测" },
          ] as const).map((tab) => (
            <button
              key={tab.key}
              onClick={() => {
                setActiveTab(tab.key);
                if (tab.key === "shop") toast("商城即将上线，敬请期待");
              }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? "text-[#E53935] border-b-2 border-[#E53935]"
                  : "text-white/50 hover:text-white/80"
              }`}
            >
              {tab.key === "intro" && <BookOpen className="w-4 h-4" />}
              {tab.key === "shop" && <ShoppingBag className="w-4 h-4" />}
              {tab.key === "health" && <Activity className="w-4 h-4" />}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 pb-24">
        {/* 产品介绍 */}
        {activeTab === "intro" && (
          <div className="w-full">
            {PRODUCT_PAGES.map((url, idx) => (
              <div key={idx} style={{ lineHeight: 0 }}>
                <img
                  src={url}
                  alt={`红颜派产品介绍 ${idx + 1}`}
                  className="w-full block"
                  loading={idx < 3 ? "eager" : "lazy"}
                />
              </div>
            ))}
            <div className="bg-[#0D0D0D] px-6 py-8 border-t border-white/10">
              <div className="flex items-center justify-center mb-6">
                <img src={ICON_URL} alt="IDEALIGHT" className="w-6 h-6 object-contain mr-2" />
                <span className="text-white/60 text-xs tracking-widest">IDEALIGHT</span>
              </div>
              <div className="space-y-3">
                <a
                  href="tel:13761550633"
                  className="flex items-center justify-between bg-white/5 rounded-xl px-4 py-3.5 active:bg-white/10"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-[#E53935]/20 flex items-center justify-center">
                      <Phone className="w-4 h-4 text-[#E53935]" />
                    </div>
                    <div>
                      <div className="text-white text-sm font-medium">电话咨询</div>
                      <div className="text-white/40 text-xs">137 6155 0633</div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-white/30" />
                </a>
                <div className="flex items-center justify-between bg-white/5 rounded-xl px-4 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-green-500/20 flex items-center justify-center">
                      <MessageCircle className="w-4 h-4 text-green-400" />
                    </div>
                    <div>
                      <div className="text-white text-sm font-medium">微信客服</div>
                      <div className="text-white/40 text-xs">13761550633</div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-white/30" />
                </div>
              </div>
              <p className="text-center text-white/20 text-xs mt-6">上海佰时特健康科技有限公司</p>
            </div>
          </div>
        )}

        {/* 商城 */}
        {activeTab === "shop" && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] px-8 text-center">
            <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-6">
              <ShoppingBag className="w-9 h-9 text-white/30" />
            </div>
            <h3 className="text-white text-lg font-medium mb-2">商城即将上线</h3>
            <p className="text-white/40 text-sm leading-relaxed">我们正在为您精心准备<br />敬请期待</p>
            <button
              onClick={handleShare}
              className="mt-8 flex items-center gap-2 bg-[#E53935] text-white rounded-full px-6 py-3 text-sm font-medium"
            >
              <Share2 className="w-4 h-4" />
              分享给朋友
            </button>
          </div>
        )}

        {/* 健康检测 */}
        {activeTab === "health" && <HealthTab />}
      </div>

      <BottomNav />
    </div>
  );
}
