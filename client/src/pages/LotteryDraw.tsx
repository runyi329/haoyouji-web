/**
 * A1 定制账本 - 共享抽奖：定时集体开奖大屏 + 结果公示
 * 路由：/lottery/:activityId/draw （组织者开奖大屏）
 * /lottery/:activityId/results（结果公示，所有人可见）
 */
import { useState, useEffect, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { ChevronLeft, Shield, CheckCircle, XCircle } from "lucide-react";

// ─── 滚动名单组件 ───────────────────────────────────────────────────────────
function RollingNames({ names, finalName, onDone }: {
  names: string[];
  finalName: string;
  onDone: () => void;
}) {
  const [current, setCurrent] = useState(0);
  const [speed, setSpeed] = useState(60);
  const [done, setDone] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    let elapsed = 0;
    const totalDuration = 3500;
    const tick = () => {
      elapsed += speed;
      setCurrent(c => (c + 1) % names.length);
      const progress = elapsed / totalDuration;
      const newSpeed = 60 + progress * 400;
      setSpeed(newSpeed);
      if (elapsed < totalDuration) {
        timerRef.current = setTimeout(tick, newSpeed);
      } else {
        setDone(true);
        onDone();
      }
    };
    timerRef.current = setTimeout(tick, speed);
    return () => clearTimeout(timerRef.current);
  }, []);

  return (
    <div className="text-center">
      <div className={`text-4xl font-bold transition-all duration-100 ${done ? "scale-110" : ""}`}
        style={{ color: done ? '#D32F2F' : '#222222' }}>
        {done ? finalName : names[current]}
      </div>
      {done && <div className="text-sm mt-1 animate-pulse" style={{ color: '#D32F2F' }}>🎉 恭喜！</div>}
    </div>
  );
}

// ─── 开奖大屏页 ────────────────────────────────────────────────────────────
export function LotteryDrawScreen() {
  const [, params] = useRoute("/lottery/:activityId/draw");
  const activityId = parseInt(params?.activityId ?? "0");
  const [, navigate] = useLocation();
  const { user } = useAuth();

  const [currentPrizeIdx, setCurrentPrizeIdx] = useState(0);
  const [revealedWinners, setRevealedWinners] = useState<Array<{
    prizeName: string; prizeEmoji: string; winners: string[];
  }>>([]);
  const [rolling, setRolling] = useState(false);
  const [currentRollWinner, setCurrentRollWinner] = useState<string | null>(null);
  const [drawStarted, setDrawStarted] = useState(false);
  const [allDone, setAllDone] = useState(false);

  const { data: activity } = trpc.lottery.getActivity.useQuery({ activityId });
  const { data: participants } = trpc.lottery.getParticipants.useQuery({ activityId });
  const startDrawMutation = trpc.lottery.startDraw.useMutation();
  const { data: results, refetch: refetchResults } = trpc.lottery.getResults.useQuery(
    { activityId },
    { enabled: drawStarted }
  );

  const prizeEmojis = ["🥇", "🥈", "🥉", "🏅", "🎖️", "🎁"];
  const prizes = (activity?.prizes ?? []).filter((p: any) => !p.is_consolation);
  const participantNames = (participants ?? []).map((p: any) => p.display_name);

  const handleStartDraw = async () => {
    try {
      await startDrawMutation.mutateAsync({ activityId });
      setDrawStarted(true);
      await refetchResults();
    } catch (e: any) {
      alert(e.message || "开奖失败");
    }
  };

  const handleRevealNext = () => {
    if (!results || currentPrizeIdx >= prizes.length) return;
    const prize = prizes[currentPrizeIdx];
    const prizeResults = results.results.filter((r: any) => r.prize_id === prize.id);
    const winnerNames = prizeResults.map((r: any) => r.winner_name);
    setRolling(true);
    setCurrentRollWinner(winnerNames[0] ?? "无");
    setTimeout(() => {
      setRevealedWinners(prev => [...prev, {
        prizeName: prize.name,
        prizeEmoji: prizeEmojis[currentPrizeIdx] ?? "🎁",
        winners: winnerNames,
      }]);
      setRolling(false);
      if (currentPrizeIdx + 1 >= prizes.length) {
        setAllDone(true);
      } else {
        setCurrentPrizeIdx(idx => idx + 1);
      }
    }, 4000);
  };

  if (!activity) return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FAF3ED' }}>
      <div className="text-sm" style={{ color: '#D32F2F' }}>加载中...</div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#FAF3ED' }}>
      {/* 顶部导航 */}
      <div className="bg-white border-b" style={{ borderColor: '#E0E0E0' }}>
        <div className="flex items-center h-14 px-4 gap-3">
          <button onClick={() => window.history.back()} className="p-2 -ml-2">
            <ChevronLeft className="w-6 h-6" style={{ color: '#222222' }} />
          </button>
          <h1 className="flex-1 text-lg font-medium" style={{ color: '#222222' }}>{activity.title}</h1>
          <span className="text-xs" style={{ color: '#757575' }}>组织者开奖</span>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 max-w-lg mx-auto w-full">

        {/* 未开始 */}
        {!drawStarted && (
          <div className="text-center w-full">
            <div className="text-6xl mb-6">🎰</div>
            <h2 className="text-2xl font-bold mb-2" style={{ color: '#222222' }}>{activity.title}</h2>
            <p className="text-sm mb-2" style={{ color: '#757575' }}>共 {participantNames.length} 人参与</p>
            <p className="text-sm mb-8" style={{ color: '#757575' }}>点击下方按钮开始开奖，系统将使用预生成的随机种子公平抽取</p>
            <div className="bg-white rounded-2xl p-4 mb-6 text-left shadow-sm border" style={{ borderColor: '#E0E0E0' }}>
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-4 h-4" style={{ color: '#D32F2F' }} />
                <span className="text-sm font-semibold" style={{ color: '#222222' }}>公平性保障</span>
              </div>
              <div className="text-xs mb-1" style={{ color: '#757575' }}>种子哈希（已公示）：</div>
              <div className="font-mono text-xs break-all p-2 rounded-lg" style={{ backgroundColor: '#FAF3ED', color: '#757575' }}>
                {activity.random_seed_hash?.slice(0, 32)}...
              </div>
            </div>
            <button
              onClick={handleStartDraw}
              disabled={startDrawMutation.isPending}
              className="w-full py-4 rounded-2xl text-white font-bold text-lg hover:opacity-90 transition-opacity disabled:opacity-50"
              style={{ backgroundColor: '#D32F2F' }}
            >
              {startDrawMutation.isPending ? "开奖中..." : "🎉 开始开奖"}
            </button>
          </div>
        )}

        {/* 开奖进行中 */}
        {drawStarted && !allDone && (
          <div className="w-full">
            {currentPrizeIdx < prizes.length && (
              <div className="text-center mb-8">
                <div className="text-5xl mb-3">{prizeEmojis[currentPrizeIdx] ?? "🎁"}</div>
                <div className="text-2xl font-bold mb-6" style={{ color: '#D32F2F' }}>{prizes[currentPrizeIdx]?.name}</div>
                {rolling && participantNames.length > 0 ? (
                  <div className="bg-white rounded-2xl p-8 shadow-sm border" style={{ borderColor: '#E0E0E0' }}>
                    <RollingNames names={participantNames} finalName={currentRollWinner ?? ""} onDone={() => {}} />
                  </div>
                ) : (
                  <button
                    onClick={handleRevealNext}
                    disabled={rolling}
                    className="px-10 py-4 rounded-2xl text-white font-bold text-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                    style={{ backgroundColor: '#D32F2F' }}
                  >
                    {rolling ? "抽取中..." : `揭晓 ${prizes[currentPrizeIdx]?.name}`}
                  </button>
                )}
              </div>
            )}
            {revealedWinners.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm mb-2" style={{ color: '#757575' }}>已揭晓</div>
                {revealedWinners.map((item, idx) => (
                  <div key={idx} className="bg-white rounded-xl px-4 py-3 flex items-center justify-between shadow-sm border" style={{ borderColor: '#E0E0E0' }}>
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{item.prizeEmoji}</span>
                      <span className="font-medium text-sm" style={{ color: '#222222' }}>{item.prizeName}</span>
                    </div>
                    <div className="text-sm font-bold" style={{ color: '#D32F2F' }}>{item.winners.join("、")}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 全部揭晓 */}
        {allDone && (
          <div className="w-full text-center">
            <div className="text-5xl mb-4">🎊</div>
            <h2 className="text-2xl font-bold mb-6" style={{ color: '#D32F2F' }}>开奖完成！</h2>
            <div className="space-y-2 mb-8">
              {revealedWinners.map((item, idx) => (
                <div key={idx} className="bg-white rounded-xl px-4 py-3 flex items-center justify-between shadow-sm border" style={{ borderColor: '#E0E0E0' }}>
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{item.prizeEmoji}</span>
                    <span className="font-medium" style={{ color: '#222222' }}>{item.prizeName}</span>
                  </div>
                  <div className="font-bold" style={{ color: '#D32F2F' }}>{item.winners.join("、")}</div>
                </div>
              ))}
            </div>
            <button
              onClick={() => navigate(`/lottery/${activityId}/results`)}
              className="w-full py-3.5 rounded-2xl text-white font-bold hover:opacity-90 transition-opacity"
              style={{ backgroundColor: '#D32F2F' }}
            >
              查看完整结果与公平验证
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 结果公示页 ────────────────────────────────────────────────────────────
export function LotteryResults() {
  const [, params] = useRoute("/lottery/:activityId/results");
  const activityId = parseInt(params?.activityId ?? "0");
  const [, navigate] = useLocation();
  const [showVerify, setShowVerify] = useState(false);

  const { data: resultsData, isLoading } = trpc.lottery.getResults.useQuery({ activityId });
  const { data: verifyData } = trpc.lottery.verifyFairness.useQuery(
    { activityId },
    { enabled: showVerify }
  );

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FAF3ED' }}>
      <div className="text-sm" style={{ color: '#D32F2F' }}>加载中...</div>
    </div>
  );

  const results = resultsData?.results ?? [];
  const fairness = resultsData?.fairnessInfo;

  const grouped: Record<string, { prizeName: string; prizeEmoji: string; sortOrder: number; winners: any[] }> = {};
  const emojis = ["🥇", "🥈", "🥉", "🏅", "🎖️", "🎁"];
  results.forEach((r: any) => {
    if (!grouped[r.prize_id]) {
      grouped[r.prize_id] = {
        prizeName: r.prize_name,
        prizeEmoji: emojis[r.prize_sort_order] ?? "🎁",
        sortOrder: r.prize_sort_order,
        winners: [],
      };
    }
    grouped[r.prize_id].winners.push(r);
  });
  const sortedGroups = Object.values(grouped).sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: '#FAF3ED' }}>
      {/* 顶部导航 */}
      <div className="bg-white border-b sticky top-0 z-10" style={{ borderColor: '#E0E0E0' }}>
        <div className="flex items-center h-14 px-4 gap-3">
          <button onClick={() => window.history.back()} className="p-2 -ml-2">
            <ChevronLeft className="w-6 h-6" style={{ color: '#222222' }} />
          </button>
          <h1 className="flex-1 text-center text-lg font-medium" style={{ color: '#222222' }}>开奖结果</h1>
          <div className="w-10" />
        </div>
      </div>

      <div className="px-4 py-5 max-w-lg mx-auto">
        {results.length === 0 ? (
          <div className="text-center py-16 text-sm" style={{ color: '#757575' }}>暂无开奖结果</div>
        ) : (
          <>
            <div className="text-center mb-5">
              <div className="text-4xl mb-2">🎊</div>
              <div className="text-sm" style={{ color: '#757575' }}>共 {results.length} 位中奖者</div>
            </div>

            <div className="space-y-3 mb-5">
              {sortedGroups.map((group, gIdx) => (
                <div key={gIdx} className="bg-white rounded-2xl overflow-hidden shadow-sm border" style={{ borderColor: '#E0E0E0' }}>
                  <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ backgroundColor: '#FAF3ED', borderColor: '#E0E0E0' }}>
                    <span className="text-xl">{group.prizeEmoji}</span>
                    <span className="font-semibold" style={{ color: '#222222' }}>{group.prizeName}</span>
                    <span className="text-xs ml-auto" style={{ color: '#757575' }}>×{group.winners.length}</span>
                  </div>
                  <div className="divide-y" style={{ borderColor: '#F5F5F5' }}>
                    {group.winners.map((w: any, wIdx: number) => (
                      <div key={wIdx} className="flex items-center justify-between px-4 py-3">
                        <span className="font-medium" style={{ color: '#D32F2F' }}>{w.winner_name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          w.claim_status === "claimed"
                            ? "text-green-600 bg-green-50 border border-green-200"
                            : "border"
                        }`} style={w.claim_status !== "claimed" ? { color: '#757575', backgroundColor: '#F5F5F5', borderColor: '#E0E0E0' } : {}}>
                          {w.claim_status === "claimed" ? "已领取" : "待领取"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* 公平性验证区域 */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border" style={{ borderColor: '#E0E0E0' }}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4" style={{ color: '#D32F2F' }} />
                  <span className="text-sm font-semibold" style={{ color: '#222222' }}>公平性验证</span>
                </div>
                <button
                  onClick={() => setShowVerify(v => !v)}
                  className="text-xs hover:opacity-70 transition-opacity"
                  style={{ color: '#D32F2F' }}
                >
                  {showVerify ? "收起" : "展开验证"}
                </button>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: '#757575' }}>
                本次抽奖使用预生成随机种子，开奖前已公示哈希值。任何人可用相同算法验证结果未被篡改。
              </p>

              {showVerify && fairness && (
                <div className="mt-3 space-y-3 text-xs">
                  <div>
                    <div className="mb-1" style={{ color: '#757575' }}>预公示哈希（开奖前）：</div>
                    <div className="font-mono break-all p-2 rounded-lg" style={{ backgroundColor: '#FAF3ED', color: '#757575' }}>
                      {fairness.random_seed_hash}
                    </div>
                  </div>
                  <div>
                    <div className="mb-1" style={{ color: '#757575' }}>完整随机种子（开奖后公布）：</div>
                    <div className="font-mono break-all p-2 rounded-lg" style={{ backgroundColor: '#FAF3ED', color: '#757575' }}>
                      {fairness.random_seed ?? "（开奖后公布）"}
                    </div>
                  </div>
                  {verifyData && (
                    <div className={`p-3 rounded-xl text-center font-medium flex items-center justify-center gap-2 ${
                      verifyData.verified ? "border" : "border"
                    }`} style={{
                      backgroundColor: verifyData.verified ? '#F1F8E9' : '#FFEBEE',
                      borderColor: verifyData.verified ? '#A5D6A7' : '#EF9A9A',
                      color: verifyData.verified ? '#2E7D32' : '#D32F2F',
                    }}>
                      {verifyData.verified
                        ? <CheckCircle className="w-4 h-4" />
                        : <XCircle className="w-4 h-4" />}
                      {verifyData.message}
                    </div>
                  )}
                  <p className="leading-relaxed" style={{ color: '#BDBDBD' }}>
                    验证方法：对随机种子执行 SHA-256 哈希，结果应与预公示哈希完全一致。
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
