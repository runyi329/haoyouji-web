/**
 * A1 定制账本 - 共享抽奖：活动详情 + 参与者报名 + 即时抽奖动效
 * 路由：/lottery/:activityId
 */
import { useState, useEffect, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

// ─── 倒计时 Hook ────────────────────────────────────────────────────────────
function useCountdown(targetTime: string | null) {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    if (!targetTime) return;
    const update = () => {
      const diff = new Date(targetTime).getTime() - Date.now();
      setRemaining(Math.max(0, diff));
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [targetTime]);

  const d = Math.floor(remaining / 86400000);
  const h = Math.floor((remaining % 86400000) / 3600000);
  const m = Math.floor((remaining % 3600000) / 60000);
  const s = Math.floor((remaining % 60000) / 1000);
  return { remaining, d, h, m, s };
}

// ─── 刮刮乐动效 ────────────────────────────────────────────────────────────
function ScratchCard({ prizeName, onReveal }: { prizeName: string; onReveal: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [revealed, setRevealed] = useState(false);
  const [scratching, setScratching] = useState(false);
  const scratchedRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#8B6914";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // 绘制金色纹理
    for (let i = 0; i < 200; i++) {
      ctx.fillStyle = `rgba(${180 + Math.random() * 40}, ${130 + Math.random() * 30}, 20, 0.3)`;
      ctx.fillRect(Math.random() * canvas.width, Math.random() * canvas.height, 2, 2);
    }
    ctx.fillStyle = "rgba(255,220,100,0.6)";
    ctx.font = "bold 16px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("← 用手指刮开 →", canvas.width / 2, canvas.height / 2);
  }, []);

  const scratch = (x: number, y: number) => {
    const canvas = canvasRef.current;
    if (!canvas || revealed) return;
    const ctx = canvas.getContext("2d")!;
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(x, y, 22, 0, Math.PI * 2);
    ctx.fill();

    // 检查刮开比例
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let transparent = 0;
    for (let i = 3; i < imageData.data.length; i += 4) {
      if (imageData.data[i] < 128) transparent++;
    }
    const ratio = transparent / (canvas.width * canvas.height);
    if (ratio > 0.5 && !revealed) {
      setRevealed(true);
      onReveal();
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!scratching) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    scratch(e.clientX - rect.left, e.clientY - rect.top);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
    const rect = canvasRef.current!.getBoundingClientRect();
    const touch = e.touches[0];
    scratch(touch.clientX - rect.left, touch.clientY - rect.top);
  };

  return (
    <div className="relative w-64 h-40 mx-auto rounded-2xl overflow-hidden shadow-2xl">
      {/* 底层：奖品内容 */}
      <div className="absolute inset-0 bg-gradient-to-br from-amber-900/80 to-gray-900 flex flex-col items-center justify-center">
        <div className="text-4xl mb-2">🎁</div>
        <div className="text-amber-300 font-bold text-xl">{prizeName}</div>
        <div className="text-gray-400 text-xs mt-1">恭喜中奖！</div>
      </div>
      {/* 上层：刮开涂层 */}
      {!revealed && (
        <canvas
          ref={canvasRef}
          width={256}
          height={160}
          className="absolute inset-0 cursor-crosshair"
          onMouseDown={() => setScratching(true)}
          onMouseUp={() => setScratching(false)}
          onMouseMove={handleMouseMove}
          onTouchStart={() => setScratching(true)}
          onTouchEnd={() => setScratching(false)}
          onTouchMove={handleTouchMove}
          style={{ touchAction: "none" }}
        />
      )}
    </div>
  );
}

// ─── 大转盘动效 ────────────────────────────────────────────────────────────
function SpinWheel({ prizes, winnerIdx, onDone }: { prizes: string[]; winnerIdx: number; onDone: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [spinning, setSpinning] = useState(false);
  const [done, setDone] = useState(false);
  const angleRef = useRef(0);
  const rafRef = useRef<number>(0);

  const colors = ["#B8860B", "#8B6914", "#DAA520", "#CD853F", "#A0522D", "#D2691E"];
  const n = prizes.length;
  const sliceAngle = (Math.PI * 2) / n;

  const draw = (angle: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const cx = canvas.width / 2, cy = canvas.height / 2, r = cx - 8;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < n; i++) {
      const start = angle + i * sliceAngle;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, start, start + sliceAngle);
      ctx.closePath();
      ctx.fillStyle = colors[i % colors.length];
      ctx.fill();
      ctx.strokeStyle = "rgba(255,200,50,0.3)";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(start + sliceAngle / 2);
      ctx.textAlign = "right";
      ctx.fillStyle = "#fff";
      ctx.font = "bold 11px sans-serif";
      ctx.fillText(prizes[i].length > 6 ? prizes[i].slice(0, 6) + "…" : prizes[i], r - 10, 4);
      ctx.restore();
    }

    // 中心圆
    ctx.beginPath();
    ctx.arc(cx, cy, 18, 0, Math.PI * 2);
    ctx.fillStyle = "#1a1a1a";
    ctx.fill();
    ctx.strokeStyle = "#DAA520";
    ctx.lineWidth = 2;
    ctx.stroke();

    // 指针
    ctx.beginPath();
    ctx.moveTo(cx + r - 5, cy);
    ctx.lineTo(cx + r + 14, cy - 8);
    ctx.lineTo(cx + r + 14, cy + 8);
    ctx.closePath();
    ctx.fillStyle = "#FF4444";
    ctx.fill();
  };

  useEffect(() => { draw(0); }, [prizes]);

  const spin = () => {
    if (spinning || done) return;
    setSpinning(true);

    // 目标角度：让 winnerIdx 对应的扇区停在指针处
    const targetAngle = -(winnerIdx * sliceAngle + sliceAngle / 2) + Math.PI * 2 * 8; // 8圈
    const startAngle = angleRef.current;
    const totalDelta = targetAngle - startAngle;
    const duration = 4000;
    const startTime = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // 缓动：先快后慢
      const eased = 1 - Math.pow(1 - progress, 4);
      const current = startAngle + totalDelta * eased;
      angleRef.current = current;
      draw(current);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        setSpinning(false);
        setDone(true);
        onDone();
      }
    };
    rafRef.current = requestAnimationFrame(animate);
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <canvas ref={canvasRef} width={240} height={240} className="rounded-full shadow-2xl" />
      {!done && (
        <button
          onClick={spin}
          disabled={spinning}
          className="px-8 py-3 rounded-full bg-amber-500 text-gray-950 font-bold text-lg hover:bg-amber-400 transition-colors disabled:opacity-50"
        >
          {spinning ? "转动中..." : "🎡 开始旋转"}
        </button>
      )}
    </div>
  );
}

// ─── 翻牌动效 ──────────────────────────────────────────────────────────────
function FlipCards({ prizes, winnerIdx, onDone }: { prizes: string[]; winnerIdx: number; onDone: () => void }) {
  const [flipped, setFlipped] = useState<number | null>(null);
  const [done, setDone] = useState(false);

  const handleFlip = (idx: number) => {
    if (done || flipped !== null) return;
    setFlipped(idx);
    setTimeout(() => {
      setDone(true);
      onDone();
    }, 800);
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-gray-400 text-sm">选择一张牌</p>
      <div className="grid grid-cols-3 gap-3">
        {prizes.map((prize, idx) => (
          <div
            key={idx}
            onClick={() => handleFlip(idx)}
            className="w-20 h-28 cursor-pointer"
            style={{ perspective: "600px" }}
          >
            <div
              className="relative w-full h-full transition-transform duration-700"
              style={{
                transformStyle: "preserve-3d",
                transform: flipped === idx ? "rotateY(180deg)" : "rotateY(0deg)",
              }}
            >
              {/* 正面 */}
              <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-amber-700 to-amber-900 flex items-center justify-center border border-amber-500/40 shadow-lg"
                style={{ backfaceVisibility: "hidden" }}>
                <span className="text-3xl">🃏</span>
              </div>
              {/* 背面 */}
              <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-gray-800 to-gray-900 flex flex-col items-center justify-center border border-amber-500/60 shadow-lg"
                style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}>
                <span className="text-2xl">🎁</span>
                <span className="text-xs text-amber-300 text-center px-1 mt-1 font-bold">
                  {flipped === idx ? (idx === winnerIdx ? prize : "谢谢参与") : ""}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── 主页面 ────────────────────────────────────────────────────────────────
export default function LotteryActivity() {
  const [, params] = useRoute("/lottery/:activityId");
  const activityId = parseInt(params?.activityId ?? "0");
  const [, navigate] = useLocation();
  const { user } = useAuth();

  const [displayName, setDisplayName] = useState(user?.name ?? "");
  const [signingUp, setSigningUp] = useState(false);
  const [participantId, setParticipantId] = useState<number | null>(null);
  const [drawResult, setDrawResult] = useState<{ prize: { name: string; description: string }; drawSeed: string } | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [showDraw, setShowDraw] = useState(false);
  const [signupError, setSignupError] = useState("");

  const { data: activity, isLoading } = trpc.lottery.getActivity.useQuery({ activityId });
  const countdown = useCountdown(activity?.draw_at ?? null);

  const signupMutation = trpc.lottery.signup.useMutation();
  const instantDrawMutation = trpc.lottery.instantDraw.useMutation();

  const handleSignup = async () => {
    if (!displayName.trim()) { setSignupError("请填写您的名字"); return; }
    setSigningUp(true);
    setSignupError("");
    try {
      const result = await signupMutation.mutateAsync({
        activityId,
        displayName: displayName.trim(),
        userId: user?.id,
      });
      setParticipantId(result.id);
      if (activity?.mode === "instant") {
        setShowDraw(true);
      }
    } catch (e: any) {
      setSignupError(e.message || "报名失败");
    } finally {
      setSigningUp(false);
    }
  };

  const handleInstantDraw = async () => {
    if (!participantId) return;
    setDrawing(true);
    try {
      const result = await instantDrawMutation.mutateAsync({ activityId, participantId });
      setDrawResult(result);
    } catch (e: any) {
      setSignupError(e.message || "抽奖失败");
    } finally {
      setDrawing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-amber-400 text-lg animate-pulse">加载中...</div>
      </div>
    );
  }

  if (!activity) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-400">活动不存在</div>
      </div>
    );
  }

  const isOpen = activity.status === "open";
  const isCompleted = activity.status === "completed";
  const modeLabel = { instant: "即时自助抽奖", scheduled: "定时集体开奖", milestone: "阶段解锁抽奖" }[activity.mode as string] ?? "";

  return (
    <div className="min-h-screen bg-gray-950 text-white pb-24">
      {/* 顶部 */}
      <div className="sticky top-0 z-10 bg-gray-950/95 backdrop-blur border-b border-gray-800/50 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1 as any)} className="text-gray-400 hover:text-white">← 返回</button>
        <h1 className="flex-1 text-center font-bold text-amber-400 truncate">{activity.title}</h1>
      </div>

      <div className="px-4 py-6 max-w-lg mx-auto">

        {/* 活动头部信息 */}
        <div className="bg-gradient-to-br from-amber-900/30 to-gray-900/60 rounded-3xl p-5 mb-5 border border-amber-700/20">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
              {modeLabel}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full border ${
              isOpen ? "bg-green-500/20 text-green-400 border-green-500/30" :
              isCompleted ? "bg-gray-500/20 text-gray-400 border-gray-500/30" :
              "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
            }`}>
              {isOpen ? "报名中" : isCompleted ? "已结束" : activity.status}
            </span>
          </div>
          <h2 className="text-xl font-bold mb-1">{activity.title}</h2>
          {activity.description && <p className="text-gray-400 text-sm">{activity.description}</p>}
          <div className="flex items-center gap-4 mt-3 text-sm text-gray-400">
            <span>👥 {activity.participantCount} 人已报名</span>
            {activity.max_participants && <span>/ 最多 {activity.max_participants} 人</span>}
          </div>
        </div>

        {/* 定时模式：倒计时 */}
        {activity.mode === "scheduled" && activity.draw_at && !isCompleted && (
          <div className="bg-gray-800/60 rounded-2xl p-4 mb-5 border border-gray-700/40">
            <div className="text-center text-sm text-gray-400 mb-3">
              {countdown.remaining > 0 ? "距离开奖还有" : "开奖时间已到"}
            </div>
            {countdown.remaining > 0 ? (
              <div className="flex justify-center gap-3">
                {[{ v: countdown.d, u: "天" }, { v: countdown.h, u: "时" }, { v: countdown.m, u: "分" }, { v: countdown.s, u: "秒" }].map(({ v, u }) => (
                  <div key={u} className="flex flex-col items-center">
                    <div className="w-14 h-14 bg-amber-900/40 rounded-xl flex items-center justify-center text-2xl font-bold text-amber-300 border border-amber-700/30">
                      {String(v).padStart(2, "0")}
                    </div>
                    <span className="text-xs text-gray-500 mt-1">{u}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-amber-400 font-bold">🎉 开奖进行中...</div>
            )}
          </div>
        )}

        {/* 奖项展示 */}
        <div className="mb-5">
          <h3 className="text-sm font-medium text-amber-200 mb-3">🏆 奖项设置</h3>
          <div className="space-y-2">
            {(activity.prizes ?? []).map((prize: any, idx: number) => (
              <div key={prize.id} className="flex items-center justify-between bg-gray-800/40 rounded-xl px-4 py-3 border border-gray-700/30">
                <div className="flex items-center gap-3">
                  <span className="text-lg">{["🥇", "🥈", "🥉", "🎖️", "🎀"][idx] ?? "🎁"}</span>
                  <div>
                    <div className="font-medium text-sm">{prize.name}</div>
                    {prize.description && <div className="text-xs text-gray-400">{prize.description}</div>}
                  </div>
                </div>
                <span className="text-xs text-gray-400">
                  {prize.is_consolation ? "保底" : `×${prize.quantity}`}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 报名区域 */}
        {isOpen && !participantId && !showDraw && (
          <div className="bg-gray-800/60 rounded-2xl p-5 border border-gray-700/40">
            <h3 className="font-bold mb-4 text-center">参与报名</h3>
            <input
              className="w-full bg-gray-700/60 rounded-xl px-4 py-3 text-white placeholder-gray-500 border border-gray-600/40 focus:outline-none focus:border-amber-500/60 mb-3"
              placeholder="您的名字（将显示在中奖名单）"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
            />
            {signupError && (
              <div className="mb-3 text-sm text-red-400">{signupError}</div>
            )}
            <button
              onClick={handleSignup}
              disabled={signingUp}
              className="w-full py-3.5 rounded-xl bg-amber-500 text-gray-950 font-bold hover:bg-amber-400 transition-colors disabled:opacity-50"
            >
              {signingUp ? "报名中..." : "🎟️ 立即报名"}
            </button>
            {parseFloat(activity.signup_fee) > 0 && (
              <p className="text-center text-xs text-gray-400 mt-2">报名费：¥{activity.signup_fee}</p>
            )}
          </div>
        )}

        {/* 报名成功（定时模式） */}
        {participantId && activity.mode === "scheduled" && (
          <div className="bg-green-900/20 rounded-2xl p-5 border border-green-700/30 text-center">
            <div className="text-3xl mb-2">✅</div>
            <div className="font-bold text-green-400">报名成功！</div>
            <div className="text-sm text-gray-400 mt-1">请等待开奖，结果将在此页面公示</div>
          </div>
        )}

        {/* 即时抽奖动效 */}
        {showDraw && !drawResult && (
          <div className="bg-gray-800/60 rounded-2xl p-6 border border-amber-700/30 text-center">
            <h3 className="font-bold text-amber-400 mb-6">🎰 开始抽奖！</h3>
            {activity.instant_style === "scratch" && (
              <div>
                <p className="text-sm text-gray-400 mb-4">用手指刮开涂层，查看您的奖品</p>
                <ScratchCard
                  prizeName={drawing ? "..." : "刮开查看"}
                  onReveal={handleInstantDraw}
                />
              </div>
            )}
            {activity.instant_style === "wheel" && (
              <SpinWheel
                prizes={(activity.prizes ?? []).map((p: any) => p.name)}
                winnerIdx={0}
                onDone={handleInstantDraw}
              />
            )}
            {activity.instant_style === "flip" && (
              <FlipCards
                prizes={(activity.prizes ?? []).map((p: any) => p.name)}
                winnerIdx={0}
                onDone={handleInstantDraw}
              />
            )}
            {activity.instant_style === "egg" && (
              <div className="flex flex-col items-center gap-4">
                <div
                  className="text-8xl cursor-pointer select-none transition-transform active:scale-90"
                  onClick={handleInstantDraw}
                >
                  🥚
                </div>
                <p className="text-sm text-gray-400">点击金蛋，查看您的奖品</p>
              </div>
            )}
          </div>
        )}

        {/* 抽奖结果 */}
        {drawResult && (
          <div className="bg-gradient-to-br from-amber-900/40 to-gray-900/60 rounded-2xl p-6 border border-amber-500/40 text-center">
            <div className="text-5xl mb-3">🎉</div>
            <div className="text-2xl font-bold text-amber-400 mb-1">{drawResult.prize.name}</div>
            {drawResult.prize.description && (
              <div className="text-gray-300 text-sm mb-4">{drawResult.prize.description}</div>
            )}
            <div className="text-xs text-gray-500 mt-4 break-all">
              随机种子：{drawResult.drawSeed.slice(0, 16)}...
              <span className="text-amber-600/60 ml-1">（可验证公正性）</span>
            </div>
          </div>
        )}

        {/* 已结束：查看结果 */}
        {isCompleted && (
          <button
            onClick={() => navigate(`/lottery/${activityId}/results`)}
            className="w-full py-3.5 rounded-2xl bg-amber-500/20 text-amber-400 font-bold border border-amber-500/30 hover:bg-amber-500/30 transition-colors"
          >
            📋 查看完整开奖结果
          </button>
        )}
      </div>
    </div>
  );
}
