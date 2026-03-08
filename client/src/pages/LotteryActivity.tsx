/**
 * 共享抽奖：活动详情 + 参与者报名 + 即时抽奖动效
 * 路由：/lottery/:activityId
 * 三个子 Tab：活动信息 | 报名名单 | 开奖结果
 */
import { useState, useEffect, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  ChevronLeft,
  Trophy,
  Users,
  Clock,
  Gift,
  CheckCircle,
  ListChecks,
  BarChart3,
  Loader,
} from "lucide-react";

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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#D32F2F";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < 200; i++) {
      ctx.fillStyle = `rgba(${180 + Math.random() * 40}, ${20 + Math.random() * 20}, 20, 0.3)`;
      ctx.fillRect(Math.random() * canvas.width, Math.random() * canvas.height, 2, 2);
    }
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = "bold 15px sans-serif";
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
    <div className="relative w-64 h-40 mx-auto rounded-2xl overflow-hidden shadow-xl">
      <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ backgroundColor: '#FAF3ED' }}>
        <div className="text-4xl mb-2">🎁</div>
        <div className="font-bold text-xl" style={{ color: '#D32F2F' }}>{prizeName}</div>
        <div className="text-sm mt-1" style={{ color: '#757575' }}>恭喜中奖！</div>
      </div>
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

  const colors = ["#D32F2F", "#B71C1C", "#E57373", "#EF9A9A", "#C62828", "#FF5252"];
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
      ctx.strokeStyle = "rgba(255,255,255,0.3)";
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
    ctx.beginPath();
    ctx.arc(cx, cy, 18, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = "#D32F2F";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + r - 5, cy);
    ctx.lineTo(cx + r + 14, cy - 8);
    ctx.lineTo(cx + r + 14, cy + 8);
    ctx.closePath();
    ctx.fillStyle = "#D32F2F";
    ctx.fill();
  };

  useEffect(() => { draw(0); }, [prizes]);

  const spin = () => {
    if (spinning || done) return;
    setSpinning(true);
    const targetAngle = -(winnerIdx * sliceAngle + sliceAngle / 2) + Math.PI * 2 * 8;
    const startAngle = angleRef.current;
    const totalDelta = targetAngle - startAngle;
    const duration = 4000;
    const startTime = performance.now();
    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
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
      <canvas ref={canvasRef} width={240} height={240} className="rounded-full shadow-xl" />
      {!done && (
        <button
          onClick={spin}
          disabled={spinning}
          className="px-8 py-3 rounded-full text-white font-bold text-lg hover:opacity-90 transition-opacity disabled:opacity-50"
          style={{ backgroundColor: '#D32F2F' }}
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
    setTimeout(() => { setDone(true); onDone(); }, 800);
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-sm" style={{ color: '#757575' }}>选择一张牌</p>
      <div className="grid grid-cols-3 gap-3">
        {prizes.map((prize, idx) => (
          <div key={idx} onClick={() => handleFlip(idx)} className="w-20 h-28 cursor-pointer" style={{ perspective: "600px" }}>
            <div className="relative w-full h-full transition-transform duration-700"
              style={{ transformStyle: "preserve-3d", transform: flipped === idx ? "rotateY(180deg)" : "rotateY(0deg)" }}>
              <div className="absolute inset-0 rounded-xl flex items-center justify-center border shadow-md"
                style={{ backfaceVisibility: "hidden", backgroundColor: '#D32F2F', borderColor: '#B71C1C' }}>
                <span className="text-3xl">🃏</span>
              </div>
              <div className="absolute inset-0 rounded-xl flex flex-col items-center justify-center border shadow-md"
                style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)", backgroundColor: '#FAF3ED', borderColor: '#E0E0E0' }}>
                <span className="text-2xl">🎁</span>
                <span className="text-xs text-center px-1 mt-1 font-bold" style={{ color: '#D32F2F' }}>
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

// ─── 报名名单子 Tab ─────────────────────────────────────────────────────────
function ParticipantsList({ activityId }: { activityId: number }) {
  const { data: participants, isLoading } = trpc.lottery.getPublicParticipants.useQuery({ activityId });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader className="w-6 h-6 text-[#D32F2F] animate-spin" />
      </div>
    );
  }

  if (!participants || (participants as any[]).length === 0) {
    return (
      <div className="text-center py-12">
        <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <div className="text-gray-400 text-base">暂无报名者</div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-sm text-gray-500 mb-3">共 {(participants as any[]).length} 人报名</div>
      {(participants as any[]).map((p: any, idx: number) => (
        <div key={p.id} className="bg-white rounded-xl px-4 py-3 flex items-center gap-3 border border-gray-100">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
            style={{ backgroundColor: '#D32F2F' }}
          >
            {idx + 1}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm text-[#222222] truncate">{p.display_name}</div>
            <div className="text-xs text-gray-400">
              {new Date(p.created_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
          <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
        </div>
      ))}
    </div>
  );
}

// ─── 开奖结果子 Tab ─────────────────────────────────────────────────────────
function DrawResults({ activityId }: { activityId: number }) {
  const { data, isLoading } = trpc.lottery.getResults.useQuery({ activityId });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader className="w-6 h-6 text-[#D32F2F] animate-spin" />
      </div>
    );
  }

  const results = (data?.results ?? []) as any[];
  const fairness = data?.fairnessInfo as any;

  if (results.length === 0) {
    return (
      <div className="text-center py-12">
        <Trophy className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <div className="text-gray-400 text-base">暂无开奖结果</div>
        <div className="text-gray-400 text-sm mt-1">活动开奖后结果将在此公示</div>
      </div>
    );
  }

  // 按奖项分组
  const grouped: Record<string, { prizeName: string; sortOrder: number; winners: any[] }> = {};
  for (const r of results) {
    if (!grouped[r.prize_id]) {
      grouped[r.prize_id] = { prizeName: r.prize_name, sortOrder: r.prize_sort_order, winners: [] };
    }
    grouped[r.prize_id].winners.push(r);
  }
  const sortedGroups = Object.values(grouped).sort((a, b) => a.sortOrder - b.sortOrder);
  const prizeIcons = ["🥇", "🥈", "🥉", "🏅", "🎖️"];

  return (
    <div className="space-y-4">
      {sortedGroups.map((group, gIdx) => (
        <div key={gIdx} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 flex items-center gap-2" style={{ backgroundColor: '#FFEBEE' }}>
            <span className="text-lg">{prizeIcons[gIdx] ?? "🎁"}</span>
            <span className="font-semibold text-sm" style={{ color: '#D32F2F' }}>{group.prizeName}</span>
            <span className="ml-auto text-xs text-gray-500">{group.winners.length} 人获奖</span>
          </div>
          <div className="divide-y divide-gray-50">
            {group.winners.map((w: any, wIdx: number) => (
              <div key={wIdx} className="px-4 py-3 flex items-center gap-3">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                  style={{ backgroundColor: '#D32F2F' }}>
                  {wIdx + 1}
                </div>
                <span className="text-sm font-medium text-[#222222]">{w.winner_name}</span>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* 公平性验证信息 */}
      {fairness?.random_seed && (
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="text-xs font-semibold text-gray-500 mb-2">🔐 公平性验证</div>
          <div className="text-xs text-gray-400 break-all space-y-1">
            <div><span className="text-gray-600">随机种子：</span>{fairness.random_seed.slice(0, 32)}...</div>
            <div><span className="text-gray-600">种子哈希：</span>{fairness.random_seed_hash?.slice(0, 32)}...</div>
          </div>
          <div className="mt-2 text-xs text-green-600">✓ 开奖结果可通过种子独立验证</div>
        </div>
      )}
    </div>
  );
}

// ─── 主页面 ────────────────────────────────────────────────────────────────
export default function LotteryActivity() {
  const [, params] = useRoute("/lottery/:activityId");
  const activityId = parseInt(params?.activityId ?? "0");
  const [, navigate] = useLocation();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<'info' | 'participants' | 'results'>('info');
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
      if (activity?.mode === "instant") setShowDraw(true);
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
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FAF3ED' }}>
        <Loader className="w-6 h-6 text-[#D32F2F] animate-spin" />
      </div>
    );
  }

  if (!activity) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FAF3ED' }}>
        <div className="text-sm" style={{ color: '#757575' }}>活动不存在</div>
      </div>
    );
  }

  const isOpen = activity.status === "open";
  const isCompleted = activity.status === "completed";
  const modeLabel = { instant: "即时自助抽奖", scheduled: "定时集体开奖", milestone: "阶段解锁抽奖" }[activity.mode as string] ?? "";
  const seedMap: Record<string, string> = {
    sh_index: '上证指数', sz_index: '深证成指', ssq: '双色球', dlt: '超级大乐透',
  };
  const regMap: Record<string, string> = {
    open: '自由报名', invite: '邀请制', organizer_add: '主办方添加',
  };

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: '#FAF3ED' }}>
      {/* 顶部导航 */}
      <div className="sticky top-0 z-10" style={{ backgroundColor: '#D32F2F' }}>
        <div className="flex items-center h-14 px-4 gap-3">
          <button onClick={() => window.history.back()} className="p-2 -ml-2">
            <ChevronLeft className="w-6 h-6 text-white" />
          </button>
          <h1 className="flex-1 text-lg font-medium truncate text-white">{activity.title}</h1>
          {/* 状态徽章 */}
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            isOpen ? "bg-green-100 text-green-700" :
            isCompleted ? "bg-white/20 text-white" :
            "bg-orange-100 text-orange-700"
          }`}>
            {isOpen ? "报名中" : isCompleted ? "已结束" : activity.status === 'drawing' ? '开奖中' : activity.status}
          </span>
        </div>

        {/* 三个子 Tab */}
        <div className="flex border-t border-white/20">
          {[
            { key: 'info', label: '活动信息', icon: Gift },
            { key: 'participants', label: '报名名单', icon: ListChecks },
            { key: 'results', label: '开奖结果', icon: BarChart3 },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              className={`flex-1 py-2.5 text-xs font-medium flex items-center justify-center gap-1 transition-colors ${
                activeTab === key
                  ? 'text-white border-b-2 border-white'
                  : 'text-white/60 hover:text-white/80'
              }`}
              onClick={() => setActiveTab(key as any)}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-4 max-w-lg mx-auto">

        {/* ── Tab: 活动信息 ── */}
        {activeTab === 'info' && (
          <>
            {/* 活动头部信息 */}
            <div className="bg-white rounded-2xl p-5 mb-4 shadow-sm border" style={{ borderColor: '#E0E0E0' }}>
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <span className="text-xs px-2 py-0.5 rounded-full text-white font-medium" style={{ backgroundColor: '#D32F2F' }}>
                  {modeLabel}
                </span>
                {activity.registration_mode && (
                  <span className="text-xs px-2 py-0.5 rounded-full border text-gray-600 bg-gray-50 border-gray-200">
                    {regMap[activity.registration_mode] ?? activity.registration_mode}
                  </span>
                )}
                {activity.external_seed_type && (
                  <span className="text-xs px-2 py-0.5 rounded-full border text-blue-600 bg-blue-50 border-blue-200">
                    🎲 {seedMap[activity.external_seed_type] ?? activity.external_seed_type}
                  </span>
                )}
              </div>
              <h2 className="text-lg font-bold mb-1" style={{ color: '#222222' }}>{activity.title}</h2>
              {activity.description && <p className="text-sm mb-3" style={{ color: '#757575' }}>{activity.description}</p>}
              <div className="flex items-center gap-4 text-sm" style={{ color: '#757575' }}>
                <span className="flex items-center gap-1">
                  <Users className="w-4 h-4" />
                  {activity.participantCount} 人已报名
                </span>
                {activity.max_participants && (
                  <span>/ 最多 {activity.max_participants} 人</span>
                )}
              </div>
            </div>

            {/* 定时模式：倒计时 */}
            {activity.mode === "scheduled" && activity.draw_at && !isCompleted && (
              <div className="bg-white rounded-2xl p-4 mb-4 shadow-sm border" style={{ borderColor: '#E0E0E0' }}>
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="w-4 h-4" style={{ color: '#D32F2F' }} />
                  <span className="text-sm font-medium" style={{ color: '#222222' }}>
                    {countdown.remaining > 0 ? "距离开奖还有" : "开奖时间已到"}
                  </span>
                </div>
                {countdown.remaining > 0 ? (
                  <div className="flex justify-center gap-3">
                    {[{ v: countdown.d, u: "天" }, { v: countdown.h, u: "时" }, { v: countdown.m, u: "分" }, { v: countdown.s, u: "秒" }].map(({ v, u }) => (
                      <div key={u} className="flex flex-col items-center">
                        <div className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl font-bold text-white" style={{ backgroundColor: '#D32F2F' }}>
                          {String(v).padStart(2, "0")}
                        </div>
                        <span className="text-xs mt-1" style={{ color: '#757575' }}>{u}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center font-bold" style={{ color: '#D32F2F' }}>🎉 开奖进行中...</div>
                )}
              </div>
            )}

            {/* 奖项展示 */}
            <div className="bg-white rounded-2xl p-4 mb-4 shadow-sm border" style={{ borderColor: '#E0E0E0' }}>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: '#222222' }}>
                <Trophy className="w-4 h-4" style={{ color: '#D32F2F' }} />
                奖项设置
              </h3>
              <div className="space-y-2">
                {(activity.prizes ?? []).map((prize: any, idx: number) => (
                  <div key={prize.id} className="flex items-center justify-between rounded-xl px-4 py-3 border" style={{ backgroundColor: '#FAF3ED', borderColor: '#E0E0E0' }}>
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{["🥇", "🥈", "🥉", "🏅", "🎖️"][idx] ?? "🎁"}</span>
                      <div>
                        <div className="font-medium text-sm" style={{ color: '#222222' }}>{prize.name}</div>
                        {prize.description && <div className="text-xs" style={{ color: '#757575' }}>{prize.description}</div>}
                      </div>
                    </div>
                    <span className="text-xs" style={{ color: '#757575' }}>
                      {prize.is_consolation ? "保底" : `×${prize.quantity}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* 报名区域 */}
            {isOpen && !participantId && !showDraw && (
              <div className="bg-white rounded-2xl p-5 shadow-sm border" style={{ borderColor: '#E0E0E0' }}>
                <h3 className="font-bold mb-4 text-center" style={{ color: '#222222' }}>参与报名</h3>
                <input
                  className="w-full rounded-xl px-4 py-3 text-sm border focus:outline-none mb-3"
                  style={{ backgroundColor: '#FAF3ED', borderColor: '#E0E0E0', color: '#222222' }}
                  placeholder="您的名字（将显示在中奖名单）"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                />
                {signupError && (
                  <div className="mb-3 text-sm" style={{ color: '#D32F2F' }}>{signupError}</div>
                )}
                <button
                  onClick={handleSignup}
                  disabled={signingUp}
                  className="w-full py-3.5 rounded-xl text-white font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
                  style={{ backgroundColor: '#D32F2F' }}
                >
                  {signingUp ? "报名中..." : "🎉 立即报名"}
                </button>
                {parseFloat(activity.signup_fee) > 0 && (
                  <p className="text-center text-xs mt-2" style={{ color: '#757575' }}>报名费：¥{activity.signup_fee}</p>
                )}
              </div>
            )}

            {/* 报名成功（定时模式） */}
            {participantId && activity.mode === "scheduled" && (
              <div className="rounded-2xl p-5 border text-center" style={{ backgroundColor: '#F1F8E9', borderColor: '#A5D6A7' }}>
                <div className="text-3xl mb-2">✅</div>
                <div className="font-bold" style={{ color: '#2E7D32' }}>报名成功！</div>
                <div className="text-sm mt-1" style={{ color: '#757575' }}>请等待开奖，结果将在「开奖结果」Tab 公示</div>
              </div>
            )}

            {/* 即时抽奖动效 */}
            {showDraw && !drawResult && (
              <div className="bg-white rounded-2xl p-6 shadow-sm border text-center" style={{ borderColor: '#E0E0E0' }}>
                <h3 className="font-bold mb-6" style={{ color: '#D32F2F' }}>🎊 开始抽奖！</h3>
                {activity.instant_style === "scratch" && (
                  <div>
                    <p className="text-sm mb-4" style={{ color: '#757575' }}>用手指刮开涂层，查看您的奖品</p>
                    <ScratchCard prizeName={drawing ? "..." : "刮开查看"} onReveal={handleInstantDraw} />
                  </div>
                )}
                {activity.instant_style === "wheel" && (
                  <SpinWheel prizes={(activity.prizes ?? []).map((p: any) => p.name)} winnerIdx={0} onDone={handleInstantDraw} />
                )}
                {activity.instant_style === "flip" && (
                  <FlipCards prizes={(activity.prizes ?? []).map((p: any) => p.name)} winnerIdx={0} onDone={handleInstantDraw} />
                )}
                {activity.instant_style === "egg" && (
                  <div className="flex flex-col items-center gap-4">
                    <div className="text-8xl cursor-pointer select-none transition-transform active:scale-90" onClick={handleInstantDraw}>🥚</div>
                    <p className="text-sm" style={{ color: '#757575' }}>点击金蛋，查看您的奖品</p>
                  </div>
                )}
              </div>
            )}

            {/* 抽奖结果 */}
            {drawResult && (
              <div className="rounded-2xl p-6 border text-center" style={{ backgroundColor: '#FFEBEE', borderColor: '#D32F2F' }}>
                <div className="text-5xl mb-3">🎉</div>
                <div className="text-2xl font-bold mb-1" style={{ color: '#D32F2F' }}>{drawResult.prize.name}</div>
                {drawResult.prize.description && (
                  <div className="text-sm mb-4" style={{ color: '#757575' }}>{drawResult.prize.description}</div>
                )}
                <div className="text-xs mt-4 break-all" style={{ color: '#BDBDBD' }}>
                  随机种子：{drawResult.drawSeed.slice(0, 16)}...
                  <span className="ml-1" style={{ color: '#D32F2F' }}>（可验证公正性）</span>
                </div>
              </div>
            )}

            {/* 已结束：查看结果按钮 */}
            {isCompleted && (
              <button
                onClick={() => setActiveTab('results')}
                className="w-full mt-4 py-3.5 rounded-2xl font-bold border hover:opacity-90 transition-opacity"
                style={{ backgroundColor: '#FFEBEE', color: '#D32F2F', borderColor: '#D32F2F' }}
              >
                查看完整开奖结果 →
              </button>
            )}
          </>
        )}

        {/* ── Tab: 报名名单 ── */}
        {activeTab === 'participants' && (
          <ParticipantsList activityId={activityId} />
        )}

        {/* ── Tab: 开奖结果 ── */}
        {activeTab === 'results' && (
          <DrawResults activityId={activityId} />
        )}

      </div>
    </div>
  );
}
