/**
 * A1 定制账本 - 共享抽奖：定时集体开奖大屏 + 结果公示
 * 路由：/lottery/:activityId/draw （组织者开奖大屏）
 * /lottery/:activityId/results（结果公示，所有人可见）
 */
import { useState, useEffect, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

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

 // 逐渐减速
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
 <div className={`text-4xl font-bold transition-all duration-100 ${done ? "text-amber-400 scale-110" : "text-white"}`}>
 {done ? finalName : names[current]}
 </div>
 {done && <div className="text-amber-300/60 text-sm mt-1 animate-pulse"> 恭喜！</div>}
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

 const prizeEmojis = ["", "", "", "", "", ""];
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

 // 滚动结束后
 setTimeout(() => {
 setRevealedWinners(prev => [...prev, {
 prizeName: prize.name,
 prizeEmoji: prizeEmojis[currentPrizeIdx] ?? "",
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

 if (!activity) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-amber-400 animate-pulse">加载中...</div>;

 return (
 <div className="min-h-screen bg-gray-950 text-white flex flex-col">
 {/* 顶部 */}
 <div className="px-6 py-4 flex items-center justify-between border-b border-gray-800/50">
 <button onClick={() => window.history.back()} className="text-gray-400 hover:text-white text-sm">← 返回</button>
 <h1 className="text-lg font-bold text-amber-400">{activity.title}</h1>
 <span className="text-xs text-gray-500">组织者开奖</span>
 </div>

 <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">

 {/* 未开始 */}
 {!drawStarted && (
 <div className="text-center max-w-sm">
 <div className="text-6xl mb-6"></div>
 <h2 className="text-2xl font-bold mb-2">{activity.title}</h2>
 <p className="text-gray-400 mb-2">共 {participantNames.length} 人参与</p>
 <p className="text-gray-500 text-sm mb-8">点击下方按钮开始开奖，系统将使用预生成的随机种子公平抽取</p>
 <div className="bg-gray-800/60 rounded-2xl p-4 mb-6 text-left text-xs text-gray-400">
 <div className="font-medium text-amber-300 mb-2"> 公平性保障</div>
 <div>种子哈希（已公示）：</div>
 <div className="font-mono text-gray-500 break-all mt-1">{activity.random_seed_hash?.slice(0, 32)}...</div>
 </div>
 <button
 onClick={handleStartDraw}
 disabled={startDrawMutation.isPending}
 className="w-full py-4 rounded-2xl bg-amber-500 text-gray-950 font-bold text-lg hover:bg-amber-400 transition-colors disabled:opacity-50"
 >
 {startDrawMutation.isPending ? "开奖中..." : " 开始开奖"}
 </button>
 </div>
 )}

 {/* 开奖进行中 */}
 {drawStarted && !allDone && (
 <div className="w-full max-w-lg">
 {/* 当前奖项 */}
 {currentPrizeIdx < prizes.length && (
 <div className="text-center mb-8">
 <div className="text-5xl mb-3">{prizeEmojis[currentPrizeIdx] ?? ""}</div>
 <div className="text-2xl font-bold text-amber-400 mb-6">{prizes[currentPrizeIdx]?.name}</div>

 {rolling && participantNames.length > 0 ? (
 <div className="bg-gray-800/60 rounded-2xl p-8 border border-amber-700/30">
 <RollingNames
 names={participantNames}
 finalName={currentRollWinner ?? ""}
 onDone={() => {}}
 />
 </div>
 ) : (
 <button
 onClick={handleRevealNext}
 disabled={rolling}
 className="px-10 py-4 rounded-2xl bg-amber-500 text-gray-950 font-bold text-lg hover:bg-amber-400 transition-colors disabled:opacity-50"
 >
 {rolling ? "抽取中..." : `揭晓 ${prizes[currentPrizeIdx]?.name}`}
 </button>
 )}
 </div>
 )}

 {/* 已揭晓的奖项 */}
 {revealedWinners.length > 0 && (
 <div className="space-y-3">
 <div className="text-sm text-gray-400 mb-2">已揭晓</div>
 {revealedWinners.map((item, idx) => (
 <div key={idx} className="bg-gray-800/40 rounded-xl px-4 py-3 flex items-center justify-between">
 <div className="flex items-center gap-2">
 <span className="text-xl">{item.prizeEmoji}</span>
 <span className="font-medium text-sm">{item.prizeName}</span>
 </div>
 <div className="text-amber-300 text-sm font-bold">
 {item.winners.join("、")}
 </div>
 </div>
 ))}
 </div>
 )}
 </div>
 )}

 {/* 全部揭晓 */}
 {allDone && (
 <div className="w-full max-w-lg text-center">
 <div className="text-5xl mb-4"></div>
 <h2 className="text-2xl font-bold text-amber-400 mb-6">开奖完成！</h2>
 <div className="space-y-3 mb-8">
 {revealedWinners.map((item, idx) => (
 <div key={idx} className="bg-gray-800/40 rounded-xl px-4 py-3 flex items-center justify-between">
 <div className="flex items-center gap-2">
 <span className="text-xl">{item.prizeEmoji}</span>
 <span className="font-medium">{item.prizeName}</span>
 </div>
 <div className="text-amber-300 font-bold">{item.winners.join("、")}</div>
 </div>
 ))}
 </div>
 <button
 onClick={() => navigate(`/lottery/${activityId}/results`)}
 className="w-full py-3.5 rounded-2xl bg-amber-500 text-gray-950 font-bold hover:bg-amber-400 transition-colors"
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

 if (isLoading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-amber-400 animate-pulse">加载中...</div>;

 const results = resultsData?.results ?? [];
 const fairness = resultsData?.fairnessInfo;

 // 按奖项分组
 const grouped: Record<string, { prizeName: string; prizeEmoji: string; sortOrder: number; winners: any[] }> = {};
 const emojis = ["", "", "", "", "", ""];
 results.forEach((r: any) => {
 if (!grouped[r.prize_id]) {
 grouped[r.prize_id] = {
 prizeName: r.prize_name,
 prizeEmoji: emojis[r.prize_sort_order] ?? "",
 sortOrder: r.prize_sort_order,
 winners: [],
 };
 }
 grouped[r.prize_id].winners.push(r);
 });
 const sortedGroups = Object.values(grouped).sort((a, b) => a.sortOrder - b.sortOrder);

 return (
 <div className="min-h-screen bg-gray-950 text-white pb-24">
 <div className="sticky top-0 z-10 bg-gray-950/95 backdrop-blur border-b border-gray-800/50 px-4 py-3 flex items-center gap-3">
 <button onClick={() => window.history.back()} className="text-gray-400 hover:text-white">← 返回</button>
 <h1 className="flex-1 text-center font-bold text-amber-400">开奖结果</h1>
 </div>

 <div className="px-4 py-6 max-w-lg mx-auto">

 {results.length === 0 ? (
 <div className="text-center py-16 text-gray-500">暂无开奖结果</div>
 ) : (
 <>
 <div className="text-center mb-6">
 <div className="text-4xl mb-2"></div>
 <div className="text-gray-400 text-sm">共 {results.length} 位中奖者</div>
 </div>

 <div className="space-y-4 mb-8">
 {sortedGroups.map((group, gIdx) => (
 <div key={gIdx} className="bg-gray-800/40 rounded-2xl overflow-hidden border border-gray-700/30">
 <div className="flex items-center gap-2 px-4 py-3 bg-gray-800/60 border-b border-gray-700/30">
 <span className="text-xl">{group.prizeEmoji}</span>
 <span className="font-bold">{group.prizeName}</span>
 <span className="text-xs text-gray-400 ml-auto">×{group.winners.length}</span>
 </div>
 <div className="divide-y divide-gray-700/20">
 {group.winners.map((w: any, wIdx: number) => (
 <div key={wIdx} className="flex items-center justify-between px-4 py-3">
 <span className="font-medium text-amber-300">{w.winner_name}</span>
 <span className={`text-xs px-2 py-0.5 rounded-full ${
 w.claim_status === "claimed"
 ? "bg-green-500/20 text-green-400"
 : "bg-gray-700/40 text-gray-400"
 }`}>
 {w.claim_status === "claimed" ? "已领取" : "待领取"}
 </span>
 </div>
 ))}
 </div>
 </div>
 ))}
 </div>

 {/* 公平性验证区域 */}
 <div className="bg-gray-800/40 rounded-2xl p-4 border border-gray-700/30">
 <div className="flex items-center justify-between mb-3">
 <div className="text-sm font-medium text-amber-200"> 公平性验证</div>
 <button
 onClick={() => setShowVerify(v => !v)}
 className="text-xs text-amber-400 hover:text-amber-300 transition-colors"
 >
 {showVerify ? "收起" : "展开验证"}
 </button>
 </div>
 <p className="text-xs text-gray-400 leading-relaxed">
 本次抽奖使用预生成随机种子，开奖前已公示哈希值。任何人可用相同算法验证结果未被篡改。
 </p>

 {showVerify && fairness && (
 <div className="mt-3 space-y-2 text-xs">
 <div>
 <div className="text-gray-400 mb-1">预公示哈希（开奖前）：</div>
 <div className="font-mono text-gray-500 break-all bg-gray-900/40 rounded p-2">
 {fairness.random_seed_hash}
 </div>
 </div>
 <div>
 <div className="text-gray-400 mb-1">完整随机种子（开奖后公布）：</div>
 <div className="font-mono text-gray-500 break-all bg-gray-900/40 rounded p-2">
 {fairness.random_seed ?? "（开奖后公布）"}
 </div>
 </div>
 {verifyData && (
 <div className={`p-2 rounded-lg text-center font-medium ${
 verifyData.verified
 ? "bg-green-900/30 text-green-400 border border-green-700/30"
 : "bg-red-900/30 text-red-400 border border-red-700/30"
 }`}>
 {verifyData.message}
 </div>
 )}
 <p className="text-gray-500 leading-relaxed">
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
