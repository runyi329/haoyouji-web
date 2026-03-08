/**
 * AE - /
 * /lottery/create?ledgerId=xxx 
 * /lottery/edit/:activityId 
 */
import { useState } from "react";
import { useLocation, useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

// 
const MODES = [
 {
 key: "instant" as const,
 icon: "",
 title: "",
 subtitle: "",
 desc: "",
 },
 {
 key: "scheduled" as const,
 icon: "⏰",
 title: "",
 subtitle: "",
 desc: "",
 },
 {
 key: "milestone" as const,
 icon: "",
 title: "",
 subtitle: "",
 desc: "",
 },
];

const INSTANT_STYLES = [
 { key: "scratch", emoji: "", label: "" },
 { key: "wheel", emoji: "", label: "" },
 { key: "flip", emoji: "", label: "" },
 { key: "egg", emoji: "", label: "" },
];

const MILESTONE_TYPES = [
 { key: "amount", label: "" },
 { key: "member_count", label: "" },
 { key: "record_count", label: "" },
];

// 
interface PrizeRow {
 id: string; // ID
 name: string;
 description: string;
 quantity: number;
 weight: number;
 isConsolation: boolean;
}

function PrizeEditor({ prizes, onChange }: {
 prizes: PrizeRow[];
 onChange: (prizes: PrizeRow[]) => void;
}) {
 const addPrize = () => {
 onChange([...prizes, {
 id: `p_${Date.now()}`,
 name: `${prizes.length + 1}`,
 description: "",
 quantity: 1,
 weight: 1,
 isConsolation: false,
 }]);
 };

 const updatePrize = (id: string, field: keyof PrizeRow, value: any) => {
 onChange(prizes.map(p => p.id === id ? { ...p, [field]: value } : p));
 };

 const removePrize = (id: string) => {
 onChange(prizes.filter(p => p.id !== id));
 };

 return (
 <div>
 <div className="flex items-center justify-between mb-3">
 <span className="text-sm font-medium text-amber-200"></span>
 <button
 type="button"
 onClick={addPrize}
 className="text-xs px-3 py-1 rounded-full bg-amber-600/30 text-amber-300 border border-amber-600/40 hover:bg-amber-600/50 transition-colors"
 >
 + 
 </button>
 </div>

 {prizes.length === 0 && (
 <div className="text-center py-6 text-gray-500 text-sm border border-dashed border-gray-700 rounded-xl">
 
 </div>
 )}

 <div className="space-y-3">
 {prizes.map((prize, idx) => (
 <div key={prize.id} className="bg-gray-800/60 rounded-xl p-3 border border-gray-700/50">
 <div className="flex items-center gap-2 mb-2">
 <span className="text-amber-400 text-sm font-bold w-5">{idx + 1}</span>
 <input
 className="flex-1 bg-gray-700/60 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-500 border border-gray-600/40 focus:outline-none focus:border-amber-500/60"
 placeholder=""
 value={prize.name}
 onChange={e => updatePrize(prize.id, "name", e.target.value)}
 />
 <button
 type="button"
 onClick={() => removePrize(prize.id)}
 className="text-gray-500 hover:text-red-400 transition-colors text-lg leading-none"
 >×</button>
 </div>
 <input
 className="w-full bg-gray-700/60 rounded-lg px-3 py-1.5 text-sm text-gray-300 placeholder-gray-500 border border-gray-600/40 focus:outline-none focus:border-amber-500/60 mb-2"
 placeholder=""
 value={prize.description}
 onChange={e => updatePrize(prize.id, "description", e.target.value)}
 />
 <div className="flex items-center gap-4 text-xs text-gray-400">
 <label className="flex items-center gap-1.5">
 
 <input
 type="number" min={1}
 className="w-14 bg-gray-700/60 rounded px-2 py-1 text-white text-center border border-gray-600/40 focus:outline-none focus:border-amber-500/60"
 value={prize.quantity}
 onChange={e => updatePrize(prize.id, "quantity", parseInt(e.target.value) || 1)}
 />
 </label>
 <label className="flex items-center gap-1.5">
 
 <input
 type="number" min={1}
 className="w-14 bg-gray-700/60 rounded px-2 py-1 text-white text-center border border-gray-600/40 focus:outline-none focus:border-amber-500/60"
 value={prize.weight}
 onChange={e => updatePrize(prize.id, "weight", parseInt(e.target.value) || 1)}
 />
 </label>
 <label className="flex items-center gap-1.5 cursor-pointer">
 <input
 type="checkbox"
 checked={prize.isConsolation}
 onChange={e => updatePrize(prize.id, "isConsolation", e.target.checked)}
 className="accent-amber-500"
 />
 
 </label>
 </div>
 </div>
 ))}
 </div>
 </div>
 );
}

// 
export default function LotteryCreate() {
 const [, navigate] = useLocation();
 const { user } = useAuth();

 // URL ledgerId
 const search = new URLSearchParams(window.location.search);
 const ledgerId = parseInt(search.get("ledgerId") ?? "0");

 // 
 const [title, setTitle] = useState("");
 const [description, setDescription] = useState("");
 const [mode, setMode] = useState<"instant" | "scheduled" | "milestone">("scheduled");
 const [instantStyle, setInstantStyle] = useState<"scratch" | "wheel" | "flip" | "egg">("scratch");
 const [drawAt, setDrawAt] = useState("");
 const [autoDrawEnabled, setAutoDrawEnabled] = useState(true);
 const [milestoneType, setMilestoneType] = useState<"amount" | "member_count" | "record_count">("amount");
 const [milestoneTarget, setMilestoneTarget] = useState("");
 const [signupEndAt, setSignupEndAt] = useState("");
 const [maxParticipants, setMaxParticipants] = useState("");
 const [signupFee, setSignupFee] = useState("0");
 const [useParticipantSeed, setUseParticipantSeed] = useState(false);
 const [isPublic, setIsPublic] = useState(true);
 const [prizes, setPrizes] = useState<PrizeRow[]>([
 { id: "p1", name: "", description: "", quantity: 1, weight: 1, isConsolation: false },
 { id: "p2", name: "", description: "", quantity: 3, weight: 1, isConsolation: false },
 { id: "p3", name: "", description: "", quantity: 0, weight: 1, isConsolation: true },
 ]);
 const [step, setStep] = useState<"mode" | "prizes" | "rules" | "confirm">("mode");
 const [submitting, setSubmitting] = useState(false);
 const [error, setError] = useState("");

 const createActivity = trpc.lottery.create.useMutation();
 const addPrizeMutation = trpc.lottery.addPrize.useMutation();
 const updateActivity = trpc.lottery.update.useMutation();

 const handleSubmit = async () => {
 if (!title.trim()) { setError(""); return; }
 if (prizes.filter(p => !p.isConsolation).length === 0) { setError(""); return; }

 setSubmitting(true);
 setError("");
 try {
 // 1. 
 const { id: activityId } = await createActivity.mutateAsync({
 ledgerId,
 title: title.trim(),
 description: description.trim() || undefined,
 mode,
 instantStyle: mode === "instant" ? instantStyle : undefined,
 drawAt: mode === "scheduled" && drawAt ? drawAt : undefined,
 autoDrawEnabled,
 milestoneType: mode === "milestone" ? milestoneType : undefined,
 milestoneTarget: mode === "milestone" && milestoneTarget ? parseFloat(milestoneTarget) : undefined,
 signupEndAt: signupEndAt || undefined,
 maxParticipants: maxParticipants ? parseInt(maxParticipants) : undefined,
 signupFee: parseFloat(signupFee) || 0,
 useParticipantSeed,
 isPublic,
 });

 // 2. 
 for (let i = 0; i < prizes.length; i++) {
 const p = prizes[i];
 await addPrizeMutation.mutateAsync({
 activityId,
 name: p.name,
 description: p.description || undefined,
 quantity: p.quantity,
 sortOrder: i,
 weight: p.weight,
 isConsolation: p.isConsolation,
 });
 }

 // 3. 
 await updateActivity.mutateAsync({ activityId, status: "open" });

 navigate(`/lottery/${activityId}`);
 } catch (e: any) {
 setError(e.message || "");
 } finally {
 setSubmitting(false);
 }
 };

 const steps = ["mode", "prizes", "rules", "confirm"] as const;
 const stepIdx = steps.indexOf(step);

 return (
 <div className="min-h-screen bg-gray-950 text-white">
 {/* */}
 <div className="sticky top-0 z-10 bg-gray-950/95 backdrop-blur border-b border-gray-800/50 px-4 py-3 flex items-center gap-3">
 <button onClick={() => stepIdx > 0 ? setStep(steps[stepIdx - 1]) : navigate(-1 as any)}
 className="text-gray-400 hover:text-white transition-colors">
 ← 
 </button>
 <h1 className="flex-1 text-center font-bold text-amber-400"></h1>
 <span className="text-xs text-gray-500">{stepIdx + 1}/4</span>
 </div>

 {/* */}
 <div className="flex px-4 pt-4 gap-1.5">
 {steps.map((s, i) => (
 <div key={s} className={`h-1 flex-1 rounded-full transition-colors ${i <= stepIdx ? "bg-amber-500" : "bg-gray-800"}`} />
 ))}
 </div>

 <div className="px-4 py-6 max-w-lg mx-auto">

 {/* Step 1: */}
 {step === "mode" && (
 <div>
 <h2 className="text-lg font-bold mb-1"></h2>
 <p className="text-sm text-gray-400 mb-5"></p>
 <div className="space-y-3 mb-6">
 {MODES.map(m => (
 <button
 key={m.key}
 type="button"
 onClick={() => setMode(m.key)}
 className={`w-full text-left p-4 rounded-2xl border-2 transition-all ${
 mode === m.key
 ? "border-amber-500 bg-amber-500/10"
 : "border-gray-700/50 bg-gray-800/40 hover:border-gray-600"
 }`}
 >
 <div className="flex items-start gap-3">
 <span className="text-2xl">{m.icon}</span>
 <div className="flex-1">
 <div className="flex items-center gap-2">
 <span className="font-bold text-sm">{m.title}</span>
 {mode === m.key && <span className="text-xs text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full"></span>}
 </div>
 <p className="text-xs text-gray-400 mt-0.5">{m.subtitle}</p>
 <p className="text-xs text-gray-500 mt-1 leading-relaxed">{m.desc}</p>
 </div>
 </div>
 </button>
 ))}
 </div>

 {/* */}
 <div className="mb-4">
 <label className="block text-sm text-amber-200 mb-2"> *</label>
 <input
 className="w-full bg-gray-800/60 rounded-xl px-4 py-3 text-white placeholder-gray-500 border border-gray-700/50 focus:outline-none focus:border-amber-500/60"
 placeholder="2025"
 value={title}
 onChange={e => setTitle(e.target.value)}
 />
 </div>
 <div className="mb-6">
 <label className="block text-sm text-amber-200 mb-2"></label>
 <textarea
 className="w-full bg-gray-800/60 rounded-xl px-4 py-3 text-white placeholder-gray-500 border border-gray-700/50 focus:outline-none focus:border-amber-500/60 resize-none"
 placeholder="..."
 rows={3}
 value={description}
 onChange={e => setDescription(e.target.value)}
 />
 </div>

 {/* */}
 {mode === "instant" && (
 <div className="mb-6">
 <label className="block text-sm text-amber-200 mb-3"></label>
 <div className="grid grid-cols-4 gap-2">
 {INSTANT_STYLES.map(s => (
 <button
 key={s.key}
 type="button"
 onClick={() => setInstantStyle(s.key as any)}
 className={`py-3 rounded-xl flex flex-col items-center gap-1 border-2 transition-all ${
 instantStyle === s.key
 ? "border-amber-500 bg-amber-500/10"
 : "border-gray-700/50 bg-gray-800/40"
 }`}
 >
 <span className="text-xl">{s.emoji}</span>
 <span className="text-xs text-gray-300">{s.label}</span>
 </button>
 ))}
 </div>
 </div>
 )}

 {/* */}
 {mode === "scheduled" && (
 <div className="mb-6">
 <label className="block text-sm text-amber-200 mb-2"> *</label>
 <input
 type="datetime-local"
 className="w-full bg-gray-800/60 rounded-xl px-4 py-3 text-white border border-gray-700/50 focus:outline-none focus:border-amber-500/60"
 value={drawAt}
 onChange={e => setDrawAt(e.target.value)}
 />
 <label className="flex items-center gap-2 mt-3 text-sm text-gray-400 cursor-pointer">
 <input type="checkbox" checked={autoDrawEnabled} onChange={e => setAutoDrawEnabled(e.target.checked)} className="accent-amber-500" />
 
 </label>
 </div>
 )}

 {/* */}
 {mode === "milestone" && (
 <div className="mb-6">
 <label className="block text-sm text-amber-200 mb-2"></label>
 <div className="flex gap-2">
 <select
 className="flex-1 bg-gray-800/60 rounded-xl px-3 py-3 text-white border border-gray-700/50 focus:outline-none focus:border-amber-500/60"
 value={milestoneType}
 onChange={e => setMilestoneType(e.target.value as any)}
 >
 {MILESTONE_TYPES.map(t => (
 <option key={t.key} value={t.key}>{t.label}</option>
 ))}
 </select>
 <input
 type="number" min={1}
 className="w-28 bg-gray-800/60 rounded-xl px-3 py-3 text-white border border-gray-700/50 focus:outline-none focus:border-amber-500/60"
 placeholder=""
 value={milestoneTarget}
 onChange={e => setMilestoneTarget(e.target.value)}
 />
 </div>
 </div>
 )}

 <button
 type="button"
 onClick={() => { if (!title.trim()) { setError(""); return; } setError(""); setStep("prizes"); }}
 className="w-full py-3.5 rounded-2xl bg-amber-500 text-gray-950 font-bold text-base hover:bg-amber-400 transition-colors"
 >
 
 </button>
 </div>
 )}

 {/* Step 2: */}
 {step === "prizes" && (
 <div>
 <h2 className="text-lg font-bold mb-1"></h2>
 <p className="text-sm text-gray-400 mb-5"></p>
 <PrizeEditor prizes={prizes} onChange={setPrizes} />
 <div className="mt-6 p-3 rounded-xl bg-amber-900/20 border border-amber-700/30 text-xs text-amber-300/80 leading-relaxed">
 <strong></strong><br/>
 <strong></strong>
 </div>
 <button
 type="button"
 onClick={() => { if (prizes.filter(p => !p.isConsolation).length === 0) { setError(""); return; } setError(""); setStep("rules"); }}
 className="w-full mt-6 py-3.5 rounded-2xl bg-amber-500 text-gray-950 font-bold text-base hover:bg-amber-400 transition-colors"
 >
 
 </button>
 </div>
 )}

 {/* Step 3: */}
 {step === "rules" && (
 <div>
 <h2 className="text-lg font-bold mb-1"></h2>
 <p className="text-sm text-gray-400 mb-5"></p>

 <div className="space-y-4">
 <div>
 <label className="block text-sm text-amber-200 mb-2"></label>
 <input
 type="datetime-local"
 className="w-full bg-gray-800/60 rounded-xl px-4 py-3 text-white border border-gray-700/50 focus:outline-none focus:border-amber-500/60"
 value={signupEndAt}
 onChange={e => setSignupEndAt(e.target.value)}
 />
 </div>

 <div>
 <label className="block text-sm text-amber-200 mb-2">=</label>
 <input
 type="number" min={1}
 className="w-full bg-gray-800/60 rounded-xl px-4 py-3 text-white placeholder-gray-500 border border-gray-700/50 focus:outline-none focus:border-amber-500/60"
 placeholder=""
 value={maxParticipants}
 onChange={e => setMaxParticipants(e.target.value)}
 />
 </div>

 <div>
 <label className="block text-sm text-amber-200 mb-2">0=</label>
 <input
 type="number" min={0} step={0.01}
 className="w-full bg-gray-800/60 rounded-xl px-4 py-3 text-white border border-gray-700/50 focus:outline-none focus:border-amber-500/60"
 value={signupFee}
 onChange={e => setSignupFee(e.target.value)}
 />
 </div>

 <div className="p-4 rounded-xl bg-gray-800/40 border border-gray-700/40 space-y-3">
 <label className="flex items-start gap-3 cursor-pointer">
 <input type="checkbox" checked={useParticipantSeed} onChange={e => setUseParticipantSeed(e.target.checked)} className="accent-amber-500 mt-0.5" />
 <div>
 <div className="text-sm font-medium text-white"></div>
 <div className="text-xs text-gray-400 mt-0.5"></div>
 </div>
 </label>
 <label className="flex items-center gap-3 cursor-pointer">
 <input type="checkbox" checked={isPublic} onChange={e => setIsPublic(e.target.checked)} className="accent-amber-500" />
 <div className="text-sm text-white"></div>
 </label>
 </div>
 </div>

 <button
 type="button"
 onClick={() => { setError(""); setStep("confirm"); }}
 className="w-full mt-6 py-3.5 rounded-2xl bg-amber-500 text-gray-950 font-bold text-base hover:bg-amber-400 transition-colors"
 >
 
 </button>
 </div>
 )}

 {/* Step 4: */}
 {step === "confirm" && (
 <div>
 <h2 className="text-lg font-bold mb-1"></h2>
 <p className="text-sm text-gray-400 mb-5"></p>

 <div className="bg-gray-800/60 rounded-2xl p-4 space-y-3 mb-6 border border-gray-700/40">
 <div className="flex justify-between text-sm">
 <span className="text-gray-400"></span>
 <span className="text-white font-medium">{title}</span>
 </div>
 <div className="flex justify-between text-sm">
 <span className="text-gray-400"></span>
 <span className="text-amber-400">{MODES.find(m => m.key === mode)?.title}</span>
 </div>
 {mode === "instant" && (
 <div className="flex justify-between text-sm">
 <span className="text-gray-400"></span>
 <span className="text-white">{INSTANT_STYLES.find(s => s.key === instantStyle)?.label}</span>
 </div>
 )}
 {mode === "scheduled" && drawAt && (
 <div className="flex justify-between text-sm">
 <span className="text-gray-400"></span>
 <span className="text-white">{new Date(drawAt).toLocaleString()}</span>
 </div>
 )}
 <div className="flex justify-between text-sm">
 <span className="text-gray-400"></span>
 <span className="text-white">{prizes.length} </span>
 </div>
 <div className="flex justify-between text-sm">
 <span className="text-gray-400"></span>
 <span className="text-white">{parseFloat(signupFee) > 0 ? `¥${signupFee}` : ""}</span>
 </div>
 <div className="flex justify-between text-sm">
 <span className="text-gray-400"></span>
 <span className="text-green-400">{useParticipantSeed ? "" : ""}</span>
 </div>
 </div>

 {/* */}
 <div className="mb-6">
 <div className="text-sm text-gray-400 mb-2"></div>
 <div className="space-y-2">
 {prizes.map((p, i) => (
 <div key={p.id} className="flex items-center justify-between bg-gray-800/40 rounded-xl px-3 py-2 text-sm">
 <span className="text-amber-300">{p.name}</span>
 <span className="text-gray-400">
 {p.isConsolation ? "" : `×${p.quantity} `}
 </span>
 </div>
 ))}
 </div>
 </div>

 {error && (
 <div className="mb-4 p-3 rounded-xl bg-red-900/30 border border-red-700/40 text-red-300 text-sm">
 {error}
 </div>
 )}

 <button
 type="button"
 onClick={handleSubmit}
 disabled={submitting}
 className="w-full py-3.5 rounded-2xl bg-amber-500 text-gray-950 font-bold text-base hover:bg-amber-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
 >
 {submitting ? "..." : " "}
 </button>
 </div>
 )}

 {/* */}
 {error && step !== "confirm" && (
 <div className="mt-4 p-3 rounded-xl bg-red-900/30 border border-red-700/40 text-red-300 text-sm">
 {error}
 </div>
 )}
 </div>
 </div>
 );
}
