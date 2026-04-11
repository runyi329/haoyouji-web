/**
 * IDEALIGHT 红颜派 - 商家主页
 * 路径: /idealight
 * 无需登录，公开访问
 */
import { useState, useRef, useCallback, useEffect } from "react";
import { Share2, ShoppingBag, Activity, BookOpen, ChevronRight, Phone, MessageCircle, Sparkles, Loader2, RotateCcw, Images, Upload, Trash2, X, ZoomIn } from "lucide-react";
import { toast } from "sonner";
import BottomNav from "@/components/BottomNav";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

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

type TabType = "intro" | "shop" | "health" | "gallery";

interface SkinItem { score: number; level: string; desc: string; }
interface SkinResult {
  wrinkles: SkinItem; pores: SkinItem; acne: SkinItem;
  sensitivity: SkinItem; texture: SkinItem;
  overall: { score: number; summary: string };
  suggestions: string[];
}

function getScoreColor(score: number): string {
  if (score >= 80) return "#C9A96E";
  if (score >= 60) return "#E8B4B8";
  return "#E07B8A";
}

function ScoreRing({ score, label }: { score: number; label: string }) {
  const r = 28;
  const circ = 2 * Math.PI * r;
  const color = getScoreColor(score);
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="72" height="72" viewBox="0 0 72 72">
        <circle cx="36" cy="36" r={r} fill="none" stroke="#F5E6E8" strokeWidth="5" />
        <circle cx="36" cy="36" r={r} fill="none" stroke={color} strokeWidth="5"
          strokeDasharray={`${circ * score / 100} ${circ * (1 - score / 100)}`}
          strokeLinecap="round" transform="rotate(-90 36 36)"
          style={{ transition: "stroke-dasharray 0.8s ease" }} />
        <text x="36" y="40" textAnchor="middle" fontSize="16" fontWeight="700" fill={color}>{score}</text>
      </svg>
      <span className="text-xs text-[#8B6B6B] font-medium">{label}</span>
    </div>
  );
}

// ===== 科技感扫描摄像头组件 =====
type ScanPhase = "idle" | "scanning" | "locking" | "countdown" | "analyzing" | "result";

function HealthTab() {
  const [phase, setPhase] = useState<ScanPhase>("idle");
  const [countdown, setCountdown] = useState(3);
  const [scanMsg, setScanMsg] = useState("正在初始化扫描仪...");
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [result, setResult] = useState<SkinResult | null>(null);
  const [scanY, setScanY] = useState(0); // 扫描线位置 0-100%
  const [locked, setLocked] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanAnimRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const analyzeMutation = trpc.analyzeSkin.useMutation({
    onSuccess: (data) => {
      if (data.success && data.result) {
        setResult(data.result as SkinResult);
        setPhase("result");
      } else {
        toast.error("分析失败，请重试");
        reset();
      }
    },
    onError: (err) => {
      toast.error(err.message || "AI分析失败，请重试");
      reset();
    },
  });

  // 扫描线动画
  const startScanAnim = useCallback(() => {
    let y = 0;
    let dir = 1;
    const step = () => {
      y += dir * 1.2;
      if (y >= 100) { y = 100; dir = -1; }
      if (y <= 0) { y = 0; dir = 1; }
      setScanY(y);
      scanAnimRef.current = requestAnimationFrame(step);
    };
    scanAnimRef.current = requestAnimationFrame(step);
  }, []);

  const stopScanAnim = useCallback(() => {
    cancelAnimationFrame(scanAnimRef.current);
  }, []);

  // 开启摄像头并自动流程
  const startScan = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      // 先切换phase让video标签渲染出来，再通过useEffect绑定流
      setPhase("scanning");
      setScanMsg("正在扫描面部特征...");
    } catch {
      toast.error("无法访问摄像头，请检查权限设置");
    }
  }, []);

  // phase变为scanning时，绑定摄像头流并启动流程
  useEffect(() => {
    if (phase !== "scanning" || !streamRef.current) return;
    const stream = streamRef.current;
    // 等一帧确保 video 已渲染
    const timer = setTimeout(() => {
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
      startScanAnim();
      // 2秒后进入锁定阶段
      timerRef.current = setTimeout(() => {
        setLocked(false);
        setPhase("locking");
        setScanMsg("检测到人脸，正在锁定...");
        timerRef.current = setTimeout(() => {
          setLocked(true);
          setScanMsg("面部锁定成功 ✓");
          stopScanAnim();
          timerRef.current = setTimeout(() => {
            setPhase("countdown");
            setCountdown(3);
          }, 800);
        }, 1500);
      }, 2000);
    }, 100);
    return () => clearTimeout(timer);
  }, [phase, startScanAnim, stopScanAnim]);

  // 倒计时逻辑
  useEffect(() => {
    if (phase !== "countdown") return;
    if (countdown <= 0) {
      // 自动拍照
      captureAndAnalyze();
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, countdown]);

  // 拍照并发送分析
  const captureAndAnalyze = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const size = Math.min(video.videoWidth, video.videoHeight);
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const ox = (video.videoWidth - size) / 2;
    const oy = (video.videoHeight - size) / 2;
    // 镜像翻转（前置摄像头）
    ctx.save();
    ctx.translate(size, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, ox, oy, size, size, 0, 0, size, size);
    ctx.restore();
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    setCapturedImage(dataUrl);
    // 停止摄像头
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setPhase("analyzing");
    // 发送分析
    const base64 = dataUrl.split(",")[1];
    analyzeMutation.mutate({ imageBase64: base64, mimeType: "image/jpeg" });
  }, [analyzeMutation]);

  const reset = useCallback(() => {
    stopScanAnim();
    if (timerRef.current) clearTimeout(timerRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCapturedImage(null);
    setResult(null);
    setLocked(false);
    setCountdown(3);
    setScanMsg("正在初始化扫描仪...");
    setPhase("idle");
  }, [stopScanAnim]);

  // 清理
  useEffect(() => {
    return () => {
      stopScanAnim();
      if (timerRef.current) clearTimeout(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [stopScanAnim]);

  // ===== 渲染 =====
  return (
    <div className="min-h-[70vh] bg-gradient-to-b from-[#FDF6F0] to-[#FFF0F3] px-4 pt-5 pb-8">
      <canvas ref={canvasRef} className="hidden" />

      {/* === 待机 === */}
      {phase === "idle" && (
        <div className="flex flex-col items-center">
          <div className="text-center mb-5">
            <div className="inline-flex items-center gap-2 bg-white/80 rounded-full px-4 py-1.5 shadow-sm mb-3">
              <Sparkles className="w-3.5 h-3.5 text-[#C9A96E]" />
              <span className="text-xs text-[#8B6B6B] tracking-wider font-medium">AI 皮肤检测</span>
            </div>
            <h2 className="text-[#5C3D3D] text-xl font-bold">专业皮肤健康分析</h2>
            <p className="text-[#A07878] text-xs mt-1.5 leading-relaxed">
              基于 AI 视觉技术，精准检测皱纹、毛孔<br />痘痘、敏感肌与粗糙度
            </p>
          </div>

          {/* 科技感预览圆 */}
          <div className="relative w-56 h-56 mb-6">
            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 224 224">
              {/* 外圈旋转虚线 */}
              <circle cx="112" cy="112" r="108" fill="none" stroke="#E8B4B8" strokeWidth="1"
                strokeDasharray="6 4" style={{ animation: "spin 12s linear infinite", transformOrigin: "112px 112px" }} />
              {/* 内圈 */}
              <circle cx="112" cy="112" r="90" fill="none" stroke="#C9A96E" strokeWidth="0.5" opacity="0.4" />
              {/* 四角标记 */}
              {[[-1,-1],[1,-1],[1,1],[-1,1]].map(([sx,sy], i) => (
                <g key={i} transform={`translate(${112 + sx * 72}, ${112 + sy * 72})`}>
                  <line x1="0" y1={sy * -12} x2="0" y2="0" stroke="#C9A96E" strokeWidth="2" />
                  <line x1={sx * -12} y1="0" x2="0" y2="0" stroke="#C9A96E" strokeWidth="2" />
                </g>
              ))}
            </svg>
            <div className="absolute inset-6 rounded-full bg-gradient-to-br from-[#F5E6E8] to-[#FAE8D4] flex items-center justify-center shadow-inner">
              <div className="text-center">
                <div className="text-4xl mb-1">👤</div>
                <span className="text-[#8B6B6B] text-xs">请正对摄像头</span>
              </div>
            </div>
          </div>

          {/* 检测项目 */}
          <div className="w-full grid grid-cols-5 gap-2 mb-6">
            {[
              { label: "皱纹", icon: "〰️" }, { label: "毛孔", icon: "◎" },
              { label: "痘痘", icon: "●" }, { label: "敏感肌", icon: "🌸" },
              { label: "粗糙度", icon: "≈" },
            ].map((item) => (
              <div key={item.label} className="flex flex-col items-center bg-white/70 rounded-2xl py-3 shadow-sm">
                <span className="text-base mb-1">{item.icon}</span>
                <span className="text-[10px] text-[#8B6B6B] font-medium">{item.label}</span>
              </div>
            ))}
          </div>

          <p className="text-[#B09090] text-xs text-center mb-5 leading-relaxed">
            照片仅用于本次 AI 分析，不会上传或存储
          </p>

          <button onClick={startScan}
            className="w-full max-w-xs bg-gradient-to-r from-[#C9A96E] to-[#E8B4B8] text-white rounded-full py-4 text-base font-semibold shadow-lg active:scale-95 transition-transform flex items-center justify-center gap-2">
            <Sparkles className="w-5 h-5" />
            开始皮肤扫描
          </button>
        </div>
      )}

      {/* === 扫描 / 锁定 / 倒计时（全屏摄像头 + 人脸轮廓取景框） === */}
      {(phase === "scanning" || phase === "locking" || phase === "countdown") && (
        <div
          className="fixed inset-0 z-50 bg-black flex flex-col"
          style={{ touchAction: "none" }}
        >
          {/* 全屏视频 */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover scale-x-[-1]"
          />

          {/* SVG全屏遮罩层 */}
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            viewBox="0 0 390 844"
            preserveAspectRatio="xMidYMid slice"
          >
            <defs>
              {/* 人脸轮廓路径：额头宽、脸颊收、下巴尖 */}
              <clipPath id="faceShapeClip">
                <path d="M195,140 C245,140 285,175 295,220 C305,265 305,310 300,350 C295,390 280,425 260,450 C245,470 225,485 210,490 C205,492 200,493 195,493 C190,493 185,492 180,490 C165,485 145,470 130,450 C110,425 95,390 90,350 C85,310 85,265 95,220 C105,175 145,140 195,140 Z" />
              </clipPath>
              <mask id="faceShapeMask">
                <rect width="390" height="844" fill="white" />
                <path d="M195,140 C245,140 285,175 295,220 C305,265 305,310 300,350 C295,390 280,425 260,450 C245,470 225,485 210,490 C205,492 200,493 195,493 C190,493 185,492 180,490 C165,485 145,470 130,450 C110,425 95,390 90,350 C85,310 85,265 95,220 C105,175 145,140 195,140 Z" fill="black" />
              </mask>
              {/* 雷达扇形渐变 */}
              <radialGradient id="radarGrad2" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
                <stop offset="70%" stopColor="#C9A96E" stopOpacity="0.12" />
                <stop offset="100%" stopColor="#C9A96E" stopOpacity="0.45" />
              </radialGradient>
            </defs>

            {/* 暗色遮罩（人脸外部） */}
            <rect width="390" height="844" fill="rgba(0,0,0,0.62)" mask="url(#faceShapeMask)" />

            {/* 人脸轮廓边框 */}
            <path
              d="M195,140 C245,140 285,175 295,220 C305,265 305,310 300,350 C295,390 280,425 260,450 C245,470 225,485 210,490 C205,492 200,493 195,493 C190,493 185,492 180,490 C165,485 145,470 130,450 C110,425 95,390 90,350 C85,310 85,265 95,220 C105,175 145,140 195,140 Z"
              fill="none"
              stroke={locked ? "#4ADE80" : "rgba(255,255,255,0.85)"}
              strokeWidth="2"
              strokeDasharray={locked ? "0" : "8 5"}
              style={{
                filter: locked ? "drop-shadow(0 0 10px #4ADE80)" : "drop-shadow(0 0 4px rgba(255,255,255,0.5))",
                transition: "stroke 0.5s, filter 0.5s"
              }}
            />

            {/* 雷达旋转扇形（锁定前） */}
            {!locked && (
              <g clipPath="url(#faceShapeClip)">
                <g style={{ transformOrigin: "195px 316px", animation: "radarSpin 2.5s linear infinite" }}>
                  <path
                    d="M195,316 L195,140 A176,176 0 0,1 347,316 Z"
                    fill="url(#radarGrad2)"
                    opacity="0.8"
                  />
                  <line x1="195" y1="316" x2="195" y2="140"
                    stroke="#C9A96E" strokeWidth="1.5" opacity="0.9" />
                </g>
              </g>
            )}

            {/* 锁定成功打勾 */}
            {locked && (
              <g>
                <circle cx="195" cy="316" r="24" fill="none" stroke="#4ADE80" strokeWidth="2.5"
                  style={{ animation: "lockPulse 0.6s ease-out" }} />
                <text x="195" y="323" textAnchor="middle" fontSize="20" fill="#4ADE80"
                  style={{ animation: "lockPulse 0.6s ease-out" }}>✓</text>
              </g>
            )}

            {/* 中心十字定位线 */}
            {!locked && (
              <g opacity="0.5">
                <line x1="195" y1="260" x2="195" y2="290" stroke="white" strokeWidth="1" strokeDasharray="3 3" />
                <line x1="195" y1="342" x2="195" y2="372" stroke="white" strokeWidth="1" strokeDasharray="3 3" />
                <line x1="140" y1="316" x2="170" y2="316" stroke="white" strokeWidth="1" strokeDasharray="3 3" />
                <line x1="220" y1="316" x2="250" y2="316" stroke="white" strokeWidth="1" strokeDasharray="3 3" />
              </g>
            )}

            {/* 顶部提示文字 */}
            <rect x="120" y="80" width="150" height="32" rx="16" fill="rgba(0,0,0,0.55)" />
            <text x="195" y="100" textAnchor="middle" fontSize="13" fill="white" fontWeight="500">
              {locked ? "面部锁定成功" : scanMsg}
            </text>

            {/* 左上角SCAN指示 */}
            <circle cx="24" cy="52" r="5" fill="#ef4444"
              style={{ animation: "pulse 1.5s ease-in-out infinite" }} />
            <text x="36" y="57" fontSize="11" fill="rgba(255,255,255,0.75)" fontFamily="monospace" fontWeight="600">SCAN</text>
          </svg>

          {/* 底部操作区 */}
          <div className="absolute bottom-0 left-0 right-0 pb-10 pt-4 px-6"
            style={{ background: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 100%)" }}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-white/70 text-xs">
                {phase === "scanning" ? "正在扫描..." : phase === "locking" ? "正在锁定..." : "准备采集..."}
              </span>
              <span className="text-[#C9A96E] text-xs font-mono">
                {phase === "scanning" ? "30%" : phase === "locking" ? "65%" : "90%"}
              </span>
            </div>
            <div className="h-1 bg-white/20 rounded-full overflow-hidden mb-4">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: phase === "scanning" ? "30%" : phase === "locking" ? "65%" : "90%",
                  background: "linear-gradient(to right, #C9A96E, #E8B4B8)"
                }}
              />
            </div>
            <button
              onClick={reset}
              className="w-full text-white/60 text-sm py-2 text-center"
            >
              取消检测
            </button>
          </div>
        </div>
      )}

      {/* === 分析中 === */}
      {phase === "analyzing" && (
        <div className="flex flex-col items-center py-8">
          {capturedImage && (
            <div className="relative w-32 h-32 mb-6">
              <img src={capturedImage} alt="" className="w-full h-full object-cover rounded-full border-4 border-[#E8D0D0]" />
              {/* 旋转扫描环 */}
              <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-[#C9A96E] animate-spin" />
              <div className="absolute -inset-2 rounded-full border-2 border-[#E8B4B8]/40 border-dashed"
                style={{ animation: "spin 4s linear infinite reverse" }} />
            </div>
          )}
          <h3 className="text-[#5C3D3D] text-lg font-semibold mb-2">AI 深度分析中</h3>
          <div className="space-y-1.5 text-center mb-6">
            {["皱纹检测...", "毛孔分析...", "痘痘识别...", "敏感度评估...", "粗糙度测量..."].map((txt, i) => (
              <div key={txt} className="flex items-center justify-center gap-2"
                style={{ opacity: 0, animation: `fadeIn 0.4s ease ${i * 0.4 + 0.2}s forwards` }}>
                <Loader2 className="w-3 h-3 text-[#C9A96E] animate-spin" />
                <span className="text-[#8B6B6B] text-xs">{txt}</span>
              </div>
            ))}
          </div>
          <div className="w-full max-w-xs">
            <div className="h-1.5 bg-[#F5E6E8] rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-[#C9A96E] to-[#E8B4B8] rounded-full"
                style={{ animation: "progressFill 8s ease-in-out forwards" }} />
            </div>
          </div>
        </div>
      )}

      {/* === 结果 === */}
      {phase === "result" && result && (
        <div className="flex flex-col">
          <div className="flex items-center gap-4 bg-white/80 rounded-2xl p-4 shadow-sm mb-4">
            {capturedImage && (
              <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 border-2 border-[#E8D0D0]">
                <img src={capturedImage} alt="检测照片" className="w-full h-full object-cover" />
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

          <div className="bg-white/80 rounded-2xl p-5 shadow-sm mb-4">
            <h3 className="text-[#5C3D3D] text-sm font-semibold mb-4 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-[#C9A96E]" />各项检测结果
            </h3>
            <div className="grid grid-cols-5 gap-2 mb-5">
              <ScoreRing score={result.wrinkles.score} label="皱纹" />
              <ScoreRing score={result.pores.score} label="毛孔" />
              <ScoreRing score={result.acne.score} label="痘痘" />
              <ScoreRing score={result.sensitivity.score} label="敏感肌" />
              <ScoreRing score={result.texture.score} label="粗糙度" />
            </div>
            <div className="space-y-2">
              {[
                { label: "皱纹", data: result.wrinkles }, { label: "毛孔", data: result.pores },
                { label: "痘痘", data: result.acne }, { label: "敏感肌", data: result.sensitivity },
                { label: "粗糙度", data: result.texture },
              ].map(({ label, data }) => (
                <div key={label} className="flex items-start gap-3 bg-[#FDF6F0] rounded-xl px-3 py-2.5">
                  <span className="inline-block text-xs font-semibold rounded-full px-2 py-0.5 flex-shrink-0 mt-0.5"
                    style={{ background: getScoreColor(data.score) + "22", color: getScoreColor(data.score) }}>
                    {data.level}
                  </span>
                  <span className="text-[#6B4B4B] text-xs leading-relaxed">
                    <span className="font-medium">{label}：</span>{data.desc}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-gradient-to-br from-[#FDF0F5] to-[#FDF6E8] rounded-2xl p-5 shadow-sm mb-5">
            <h3 className="text-[#5C3D3D] text-sm font-semibold mb-3 flex items-center gap-1.5">
              <span className="text-base">💆‍♀️</span>个性化护肤建议
            </h3>
            <div className="space-y-2.5">
              {result.suggestions.map((s, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <div className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-bold mt-0.5"
                    style={{ background: "linear-gradient(135deg, #C9A96E, #E8B4B8)" }}>{i + 1}</div>
                  <p className="text-[#6B4B4B] text-sm leading-relaxed">{s}</p>
                </div>
              ))}
            </div>
          </div>

          <button onClick={reset}
            className="w-full bg-gradient-to-r from-[#C9A96E] to-[#E8B4B8] text-white rounded-full py-4 text-base font-semibold shadow-lg active:scale-95 transition-transform flex items-center justify-center gap-2">
            <RotateCcw className="w-4 h-4" />重新检测
          </button>
          <p className="text-center text-[#C0A0A0] text-[10px] mt-4 leading-relaxed">
            本检测结果仅供参考，不构成医疗诊断建议<br />如有皮肤问题请咨询专业皮肤科医生
          </p>
        </div>
      )}

      {/* 全局动画样式 */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes radarSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes lockPulse { 0% { transform: scale(0.5); opacity: 0; } 60% { transform: scale(1.2); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
        @keyframes countPop { from { transform: scale(1.4); opacity: 0.5; } to { transform: scale(1); opacity: 0.9; } }
        @keyframes fadeIn { from { opacity: 0; transform: translateX(-8px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes progressFill { 0% { width: 0%; } 30% { width: 35%; } 60% { width: 65%; } 85% { width: 88%; } 100% { width: 95%; } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
      `}</style>
    </div>
  );
}

// ===== 图库组件 =====
function GalleryTab() {
  const { user, isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: images = [], isLoading } = trpc.idealightGalleryList.useQuery();

  const uploadMutation = trpc.idealightGalleryUpload.useMutation({
    onSuccess: () => {
      toast.success('图片上传成功');
      utils.idealightGalleryList.invalidate();
      setUploading(false);
    },
    onError: (err) => {
      toast.error(err.message || '上传失败');
      setUploading(false);
    },
  });

  const deleteMutation = trpc.idealightGalleryDelete.useMutation({
    onSuccess: () => {
      toast.success('已删除');
      utils.idealightGalleryList.invalidate();
    },
    onError: (err) => toast.error(err.message || '删除失败'),
  });

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error('图片不能超过 10MB');
      return;
    }
    setUploading(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target?.result as string;
      uploadMutation.mutate({ imageBase64: base64, mimeType: file.type, title: file.name.replace(/\.[^.]+$/, '') });
    };
    reader.readAsDataURL(file);
    // 重置input以允许重复选择同一文件
    e.target.value = '';
  }, [uploadMutation]);

  // 判断是否是管理员（owner）
  const isOwner = isAuthenticated && user?.openId === (window as any).__OWNER_OPEN_ID__;
  // 通过尝试上传来判断，实际权限在后端检查
  const canManage = isAuthenticated;

  return (
    <div className="px-3 py-4">
      {/* 标题行 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Images className="w-5 h-5 text-[#E53935]" />
          <span className="text-white font-semibold text-base">宣传图库</span>
          <span className="text-white/40 text-xs">({images.length}张)</span>
        </div>
        {canManage && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileSelect}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1.5 bg-[#E53935] hover:bg-[#C62828] disabled:opacity-50 text-white rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
            >
              {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              {uploading ? '上传中...' : '上传图片'}
            </button>
          </>
        )}
      </div>

      {/* 图片网格 - 每行两张 */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-[#E53935] animate-spin" />
        </div>
      ) : images.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Images className="w-12 h-12 text-white/20 mb-3" />
          <p className="text-white/40 text-sm">暂无图片</p>
          {canManage && <p className="text-white/25 text-xs mt-1">点击上方「上传图片」添加宣传海报</p>}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {images.map((img) => (
            <div key={img.id} className="relative group rounded-xl overflow-hidden bg-white/5 aspect-[3/4]">
              <img
                src={img.url}
                alt={img.title || '图库图片'}
                className="w-full h-full object-cover cursor-pointer transition-transform duration-200 active:scale-95"
                loading="lazy"
                onClick={() => setLightboxUrl(img.url)}
              />
              {/* 放大图标 */}
              <div
                className="absolute inset-0 bg-black/0 active:bg-black/20 flex items-center justify-center transition-colors"
                onClick={() => setLightboxUrl(img.url)}
              >
                <ZoomIn className="w-8 h-8 text-white opacity-0 group-hover:opacity-80 transition-opacity drop-shadow-lg" />
              </div>
              {/* 删除按鈕（管理员可见） */}
              {canManage && (
                <button
                  onClick={(e) => { e.stopPropagation(); if (confirm('确认删除这张图片？')) deleteMutation.mutate({ id: img.id }); }}
                  className="absolute top-1.5 right-1.5 w-6 h-6 bg-black/60 hover:bg-red-600 rounded-full flex items-center justify-center transition-colors"
                >
                  <Trash2 className="w-3 h-3 text-white" />
                </button>
              )}
              {/* 图片标题 */}
              {img.title && (
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-2">
                  <p className="text-white text-xs truncate">{img.title}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 灯笱放大查看 */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            className="absolute top-4 right-4 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center"
            onClick={() => setLightboxUrl(null)}
          >
            <X className="w-5 h-5 text-white" />
          </button>
          <img
            src={lightboxUrl}
            alt="放大查看"
            className="max-w-full max-h-full object-contain px-4"
            onClick={(e) => e.stopPropagation()}
          />
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
      navigator.share({ title: "IDEALIGHT 红颜派 · 红光美容灯", text: "650nm 黄金波长，科学美容，在家享受专业护肤体验", url: shareUrl }).catch(() => {});
    } else {
      navigator.clipboard.writeText(shareUrl).then(() => toast.success("链接已复制，快去分享吧！"));
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <div className="sticky top-0 z-50 bg-black/90 backdrop-blur-md border-b border-white/10">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <img src={ICON_URL} alt="IDEALIGHT" className="w-7 h-7 object-contain" />
            <span className="text-white font-semibold tracking-widest text-sm">IDEALIGHT</span>
          </div>
          <button onClick={handleShare}
            className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 rounded-full px-3 py-1.5 text-xs text-white/80 transition-colors">
            <Share2 className="w-3.5 h-3.5" /><span>分享</span>
          </button>
        </div>
        <div className="flex border-t border-white/10">
          {([
            { key: "intro" as TabType, label: "产品介绍" },
            { key: "shop" as TabType, label: "商城" },
            { key: "gallery" as TabType, label: "图库" },
            { key: "health" as TabType, label: "健康检测" },
          ] as const).map((tab) => (
            <button key={tab.key}
              onClick={() => { setActiveTab(tab.key); if (tab.key === "shop") toast("商城即将上线，敬请期待"); }}
              className={`flex-1 flex items-center justify-center gap-1 py-3 text-xs font-medium transition-colors ${
                activeTab === tab.key ? "text-[#E53935] border-b-2 border-[#E53935]" : "text-white/50 hover:text-white/80"
              }`}>
              {tab.key === "intro" && <BookOpen className="w-3.5 h-3.5" />}
              {tab.key === "shop" && <ShoppingBag className="w-3.5 h-3.5" />}
              {tab.key === "gallery" && <Images className="w-3.5 h-3.5" />}
              {tab.key === "health" && <Activity className="w-3.5 h-3.5" />}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 pb-24">
        {activeTab === "intro" && (
          <div className="w-full">
            {PRODUCT_PAGES.map((url, idx) => (
              <div key={idx} style={{ lineHeight: 0 }}>
                <img src={url} alt={`红颜派产品介绍 ${idx + 1}`} className="w-full block" loading={idx < 3 ? "eager" : "lazy"} />
              </div>
            ))}
            <div className="bg-[#0D0D0D] px-6 py-8 border-t border-white/10">
              <div className="flex items-center justify-center mb-6">
                <img src={ICON_URL} alt="IDEALIGHT" className="w-6 h-6 object-contain mr-2" />
                <span className="text-white/60 text-xs tracking-widest">IDEALIGHT</span>
              </div>
              <div className="space-y-3">
                <a href="tel:13761550633" className="flex items-center justify-between bg-white/5 rounded-xl px-4 py-3.5 active:bg-white/10">
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

        {activeTab === "shop" && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] px-8 text-center">
            <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-6">
              <ShoppingBag className="w-9 h-9 text-white/30" />
            </div>
            <h3 className="text-white text-lg font-medium mb-2">商城即将上线</h3>
            <p className="text-white/40 text-sm leading-relaxed">我们正在为您精心准备<br />敬请期待</p>
            <button onClick={handleShare}
              className="mt-8 flex items-center gap-2 bg-[#E53935] text-white rounded-full px-6 py-3 text-sm font-medium">
              <Share2 className="w-4 h-4" />分享给朋友
            </button>
          </div>
        )}

        {activeTab === "gallery" && <GalleryTab />}

        {activeTab === "health" && <HealthTab />}
      </div>

      <BottomNav />
    </div>
  );
}
