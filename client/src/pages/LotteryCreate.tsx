/**
 * A1 定制账本 - 共享抽奖：组织者创建/设置页面
 * 路由：/lottery/create?ledgerId=xxx  （创建）
 *       /lottery/edit/:activityId      （编辑）
 */
import { useState } from "react";
import { useLocation, useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

// ─── 抽奖模式配置 ──────────────────────────────────────────────────────────
const MODES = [
  {
    key: "instant" as const,
    icon: "🎰",
    title: "即时自助抽奖",
    subtitle: "满足条件即可独立抽，无需等待",
    desc: "参与者扫码进入后立即可抽，支持刮刮乐、大转盘、翻牌、砸金蛋四种动效。",
  },
  {
    key: "scheduled" as const,
    icon: "⏰",
    title: "定时集体开奖",
    subtitle: "设定时间，到点统一揭晓",
    desc: "所有人先报名，到了约定时间统一开奖，支持大屏动效逐级揭晓，适合年会、团建。",
  },
  {
    key: "milestone" as const,
    icon: "🏆",
    title: "阶段解锁抽奖",
    subtitle: "账本达成目标自动触发",
    desc: "当账本金额、成员数或记录数达到设定目标时，自动解锁一次抽奖机会。",
  },
];

const INSTANT_STYLES = [
  { key: "scratch", emoji: "🎟️", label: "刮刮乐" },
  { key: "wheel",   emoji: "🎡", label: "大转盘" },
  { key: "flip",    emoji: "🃏", label: "翻牌" },
  { key: "egg",     emoji: "🥚", label: "砸金蛋" },
];

const MILESTONE_TYPES = [
  { key: "amount",       label: "账本总金额达到" },
  { key: "member_count", label: "成员人数达到" },
  { key: "record_count", label: "账目条数达到" },
];

// ─── 奖项行组件 ────────────────────────────────────────────────────────────
interface PrizeRow {
  id: string; // 临时前端 ID
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
      name: `${prizes.length + 1}等奖`,
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
        <span className="text-sm font-medium text-amber-200">奖项设置</span>
        <button
          type="button"
          onClick={addPrize}
          className="text-xs px-3 py-1 rounded-full bg-amber-600/30 text-amber-300 border border-amber-600/40 hover:bg-amber-600/50 transition-colors"
        >
          + 添加奖项
        </button>
      </div>

      {prizes.length === 0 && (
        <div className="text-center py-6 text-gray-500 text-sm border border-dashed border-gray-700 rounded-xl">
          还没有奖项，点击上方按钮添加
        </div>
      )}

      <div className="space-y-3">
        {prizes.map((prize, idx) => (
          <div key={prize.id} className="bg-gray-800/60 rounded-xl p-3 border border-gray-700/50">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-amber-400 text-sm font-bold w-5">{idx + 1}</span>
              <input
                className="flex-1 bg-gray-700/60 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-500 border border-gray-600/40 focus:outline-none focus:border-amber-500/60"
                placeholder="奖项名称（如：一等奖）"
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
              placeholder="奖品描述（可选）"
              value={prize.description}
              onChange={e => updatePrize(prize.id, "description", e.target.value)}
            />
            <div className="flex items-center gap-4 text-xs text-gray-400">
              <label className="flex items-center gap-1.5">
                名额
                <input
                  type="number" min={1}
                  className="w-14 bg-gray-700/60 rounded px-2 py-1 text-white text-center border border-gray-600/40 focus:outline-none focus:border-amber-500/60"
                  value={prize.quantity}
                  onChange={e => updatePrize(prize.id, "quantity", parseInt(e.target.value) || 1)}
                />
              </label>
              <label className="flex items-center gap-1.5">
                权重
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
                保底奖
              </label>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── 主页面 ────────────────────────────────────────────────────────────────
export default function LotteryCreate() {
  const [, navigate] = useLocation();
  const { user } = useAuth();

  // 从 URL 获取 ledgerId
  const search = new URLSearchParams(window.location.search);
  const ledgerId = parseInt(search.get("ledgerId") ?? "0");

  // 表单状态
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
    { id: "p1", name: "一等奖", description: "", quantity: 1, weight: 1, isConsolation: false },
    { id: "p2", name: "二等奖", description: "", quantity: 3, weight: 1, isConsolation: false },
    { id: "p3", name: "参与奖", description: "", quantity: 0, weight: 1, isConsolation: true },
  ]);
  const [step, setStep] = useState<"mode" | "prizes" | "rules" | "confirm">("mode");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const createActivity = trpc.lottery.create.useMutation();
  const addPrizeMutation = trpc.lottery.addPrize.useMutation();
  const updateActivity = trpc.lottery.update.useMutation();

  const handleSubmit = async () => {
    if (!title.trim()) { setError("请填写活动名称"); return; }
    if (prizes.filter(p => !p.isConsolation).length === 0) { setError("请至少添加一个非保底奖项"); return; }

    setSubmitting(true);
    setError("");
    try {
      // 1. 创建活动
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

      // 2. 添加奖项
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

      // 3. 开放报名
      await updateActivity.mutateAsync({ activityId, status: "open" });

      navigate(`/lottery/${activityId}`);
    } catch (e: any) {
      setError(e.message || "创建失败，请重试");
    } finally {
      setSubmitting(false);
    }
  };

  const steps = ["mode", "prizes", "rules", "confirm"] as const;
  const stepIdx = steps.indexOf(step);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* 顶部导航 */}
      <div className="sticky top-0 z-10 bg-gray-950/95 backdrop-blur border-b border-gray-800/50 px-4 py-3 flex items-center gap-3">
        <button onClick={() => stepIdx > 0 ? setStep(steps[stepIdx - 1]) : navigate(-1 as any)}
          className="text-gray-400 hover:text-white transition-colors">
          ← 返回
        </button>
        <h1 className="flex-1 text-center font-bold text-amber-400">创建抽奖活动</h1>
        <span className="text-xs text-gray-500">{stepIdx + 1}/4</span>
      </div>

      {/* 步骤进度条 */}
      <div className="flex px-4 pt-4 gap-1.5">
        {steps.map((s, i) => (
          <div key={s} className={`h-1 flex-1 rounded-full transition-colors ${i <= stepIdx ? "bg-amber-500" : "bg-gray-800"}`} />
        ))}
      </div>

      <div className="px-4 py-6 max-w-lg mx-auto">

        {/* ── Step 1: 选择模式 ── */}
        {step === "mode" && (
          <div>
            <h2 className="text-lg font-bold mb-1">选择抽奖模式</h2>
            <p className="text-sm text-gray-400 mb-5">三种模式满足不同场景需求</p>
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
                        {mode === m.key && <span className="text-xs text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full">已选</span>}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{m.subtitle}</p>
                      <p className="text-xs text-gray-500 mt-1 leading-relaxed">{m.desc}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {/* 活动名称（在模式选择页一并填写） */}
            <div className="mb-4">
              <label className="block text-sm text-amber-200 mb-2">活动名称 *</label>
              <input
                className="w-full bg-gray-800/60 rounded-xl px-4 py-3 text-white placeholder-gray-500 border border-gray-700/50 focus:outline-none focus:border-amber-500/60"
                placeholder="例：2025年终感恩抽奖"
                value={title}
                onChange={e => setTitle(e.target.value)}
              />
            </div>
            <div className="mb-6">
              <label className="block text-sm text-amber-200 mb-2">活动描述（可选）</label>
              <textarea
                className="w-full bg-gray-800/60 rounded-xl px-4 py-3 text-white placeholder-gray-500 border border-gray-700/50 focus:outline-none focus:border-amber-500/60 resize-none"
                placeholder="活动说明、参与方式等..."
                rows={3}
                value={description}
                onChange={e => setDescription(e.target.value)}
              />
            </div>

            {/* 即时模式：选动效样式 */}
            {mode === "instant" && (
              <div className="mb-6">
                <label className="block text-sm text-amber-200 mb-3">动效样式</label>
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

            {/* 定时模式：开奖时间 */}
            {mode === "scheduled" && (
              <div className="mb-6">
                <label className="block text-sm text-amber-200 mb-2">开奖时间 *</label>
                <input
                  type="datetime-local"
                  className="w-full bg-gray-800/60 rounded-xl px-4 py-3 text-white border border-gray-700/50 focus:outline-none focus:border-amber-500/60"
                  value={drawAt}
                  onChange={e => setDrawAt(e.target.value)}
                />
                <label className="flex items-center gap-2 mt-3 text-sm text-gray-400 cursor-pointer">
                  <input type="checkbox" checked={autoDrawEnabled} onChange={e => setAutoDrawEnabled(e.target.checked)} className="accent-amber-500" />
                  到时间自动开奖（无需手动触发）
                </label>
              </div>
            )}

            {/* 阶段解锁：目标设置 */}
            {mode === "milestone" && (
              <div className="mb-6">
                <label className="block text-sm text-amber-200 mb-2">解锁条件</label>
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
                    placeholder="目标值"
                    value={milestoneTarget}
                    onChange={e => setMilestoneTarget(e.target.value)}
                  />
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => { if (!title.trim()) { setError("请填写活动名称"); return; } setError(""); setStep("prizes"); }}
              className="w-full py-3.5 rounded-2xl bg-amber-500 text-gray-950 font-bold text-base hover:bg-amber-400 transition-colors"
            >
              下一步：设置奖项
            </button>
          </div>
        )}

        {/* ── Step 2: 奖项设置 ── */}
        {step === "prizes" && (
          <div>
            <h2 className="text-lg font-bold mb-1">设置奖项</h2>
            <p className="text-sm text-gray-400 mb-5">奖项对应账本二级科目，每条报名是一条账目</p>
            <PrizeEditor prizes={prizes} onChange={setPrizes} />
            <div className="mt-6 p-3 rounded-xl bg-amber-900/20 border border-amber-700/30 text-xs text-amber-300/80 leading-relaxed">
              💡 <strong>保底奖</strong>：勾选后，未中其他奖项的参与者将自动获得此奖，适合「人人有奖」场景。<br/>
              💡 <strong>权重</strong>：数值越大，该奖项被抽中的概率越高（在即时模式中有效）。
            </div>
            <button
              type="button"
              onClick={() => { if (prizes.filter(p => !p.isConsolation).length === 0) { setError("请至少添加一个非保底奖项"); return; } setError(""); setStep("rules"); }}
              className="w-full mt-6 py-3.5 rounded-2xl bg-amber-500 text-gray-950 font-bold text-base hover:bg-amber-400 transition-colors"
            >
              下一步：报名规则
            </button>
          </div>
        )}

        {/* ── Step 3: 报名规则 ── */}
        {step === "rules" && (
          <div>
            <h2 className="text-lg font-bold mb-1">报名规则</h2>
            <p className="text-sm text-gray-400 mb-5">设置报名截止、人数上限等</p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-amber-200 mb-2">报名截止时间（可选）</label>
                <input
                  type="datetime-local"
                  className="w-full bg-gray-800/60 rounded-xl px-4 py-3 text-white border border-gray-700/50 focus:outline-none focus:border-amber-500/60"
                  value={signupEndAt}
                  onChange={e => setSignupEndAt(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm text-amber-200 mb-2">最大参与人数（留空=不限）</label>
                <input
                  type="number" min={1}
                  className="w-full bg-gray-800/60 rounded-xl px-4 py-3 text-white placeholder-gray-500 border border-gray-700/50 focus:outline-none focus:border-amber-500/60"
                  placeholder="不限"
                  value={maxParticipants}
                  onChange={e => setMaxParticipants(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm text-amber-200 mb-2">报名费（元，0=免费）</label>
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
                    <div className="text-sm font-medium text-white">参与者共同决定随机种子</div>
                    <div className="text-xs text-gray-400 mt-0.5">每位参与者报名时贡献一段随机数，所有人的随机数共同决定最终种子，组织者无法预知或操控结果。</div>
                  </div>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={isPublic} onChange={e => setIsPublic(e.target.checked)} className="accent-amber-500" />
                  <div className="text-sm text-white">公开活动（链接可见）</div>
                </label>
              </div>
            </div>

            <button
              type="button"
              onClick={() => { setError(""); setStep("confirm"); }}
              className="w-full mt-6 py-3.5 rounded-2xl bg-amber-500 text-gray-950 font-bold text-base hover:bg-amber-400 transition-colors"
            >
              下一步：确认创建
            </button>
          </div>
        )}

        {/* ── Step 4: 确认 ── */}
        {step === "confirm" && (
          <div>
            <h2 className="text-lg font-bold mb-1">确认创建</h2>
            <p className="text-sm text-gray-400 mb-5">请核对以下信息</p>

            <div className="bg-gray-800/60 rounded-2xl p-4 space-y-3 mb-6 border border-gray-700/40">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">活动名称</span>
                <span className="text-white font-medium">{title}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">抽奖模式</span>
                <span className="text-amber-400">{MODES.find(m => m.key === mode)?.title}</span>
              </div>
              {mode === "instant" && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">动效样式</span>
                  <span className="text-white">{INSTANT_STYLES.find(s => s.key === instantStyle)?.label}</span>
                </div>
              )}
              {mode === "scheduled" && drawAt && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">开奖时间</span>
                  <span className="text-white">{new Date(drawAt).toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">奖项数量</span>
                <span className="text-white">{prizes.length} 个</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">报名费</span>
                <span className="text-white">{parseFloat(signupFee) > 0 ? `¥${signupFee}` : "免费"}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">公平机制</span>
                <span className="text-green-400">{useParticipantSeed ? "参与者共同决定种子" : "预生成随机种子"}</span>
              </div>
            </div>

            {/* 奖项预览 */}
            <div className="mb-6">
              <div className="text-sm text-gray-400 mb-2">奖项预览</div>
              <div className="space-y-2">
                {prizes.map((p, i) => (
                  <div key={p.id} className="flex items-center justify-between bg-gray-800/40 rounded-xl px-3 py-2 text-sm">
                    <span className="text-amber-300">{p.name}</span>
                    <span className="text-gray-400">
                      {p.isConsolation ? "保底（剩余参与者）" : `×${p.quantity} 名`}
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
              {submitting ? "创建中..." : "🎉 立即创建并开放报名"}
            </button>
          </div>
        )}

        {/* 错误提示 */}
        {error && step !== "confirm" && (
          <div className="mt-4 p-3 rounded-xl bg-red-900/30 border border-red-700/40 text-red-300 text-sm">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
