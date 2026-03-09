/**
 * A1 定制账本 - 共享抽奖：组织者创建/设置页面
 * 路由：/lottery/create?ledgerId=xxx （创建）
 * /lottery/edit/:activityId （编辑）
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { ChevronLeft, Plus, X, Trophy, Shield, TrendingUp, BarChart2, Users, UserPlus, Link2, HelpCircle, CheckCircle2, Circle } from "lucide-react";
import { LotteryDatePicker } from "@/components/LotteryDatePicker";

// ─── 抽奖模式配置 ──────────────────────────────────────────────────────────
const MODES = [
  {
    key: "instant" as const,
    title: "即时自助",
    tooltip: "参与者扫码进入后立即可抽，支持刮刮乐、大转盘、翻牌、砸金蛋四种动效，满足条件即可独立抽，无需等待。",
  },
  {
    key: "scheduled" as const,
    title: "定时开奖",
    tooltip: "所有人先报名，到了约定时间统一开奖，支持大屏动效逐级揭晓，适合年会、团建。",
  },
  {
    key: "milestone" as const,
    title: "阶段解锁",
    tooltip: "当账本金额、成员数或记录数达到设定目标时，自动解锁一次抽奖机会。",
  },
];

const INSTANT_STYLES = [
  { key: "scratch", label: "刮刮乐" },
  { key: "wheel", label: "大转盘" },
  { key: "flip", label: "翻牌" },
  { key: "egg", label: "砸金蛋" },
];

// ─── 模式选择组件（横排三按钮 + 问号 tooltip）────────────────────────────────
function ModeSelector({ mode, setMode }: { mode: string; setMode: (m: any) => void }) {
  const [tooltip, setTooltip] = useState<string | null>(null);
  return (
    <div className="mb-5">
      <div className="grid grid-cols-3 gap-2">
        {MODES.map(m => (
          <div key={m.key} className="relative">
            <button
              type="button"
              onClick={() => setMode(m.key)}
              className="w-full py-2.5 px-2 rounded-xl border-2 text-center transition-all"
              style={{
                borderColor: mode === m.key ? '#D32F2F' : '#E0E0E0',
                backgroundColor: mode === m.key ? '#FFEBEE' : '#FFFFFF',
              }}
            >
              <div className="flex items-center justify-center gap-1">
                <span className="text-sm font-semibold" style={{ color: mode === m.key ? '#D32F2F' : '#222222' }}>{m.title}</span>
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); setTooltip(tooltip === m.key ? null : m.key); }}
                  className="flex-shrink-0"
                >
                  <HelpCircle className="w-3.5 h-3.5" style={{ color: mode === m.key ? '#D32F2F' : '#BDBDBD' }} />
                </button>
              </div>
            </button>
            {tooltip === m.key && (
              <div
                className="absolute z-20 left-0 right-0 top-full mt-1 p-2.5 rounded-xl text-xs leading-relaxed shadow-lg"
                style={{ backgroundColor: '#222222', color: '#FFFFFF', minWidth: '200px', maxWidth: '240px' }}
              >
                {m.tooltip}
                <button
                  type="button"
                  onClick={() => setTooltip(null)}
                  className="block mt-1 text-xs opacity-60"
                >点击关闭</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const MILESTONE_TYPES = [
  { key: "amount", label: "账本总金额达到" },
  { key: "member_count", label: "成员人数达到" },
  { key: "record_count", label: "账目条数达到" },
];

// ─── 报名方式配置 ──────────────────────────────────────────────────────────
const REGISTRATION_MODES = [
  {
    key: "open" as const,
    icon: <Link2 className="w-5 h-5" style={{ color: '#1565C0' }} />,
    title: "自由报名",
    subtitle: "任何人扫码/点击链接即可报名",
    desc: "参与者通过活动链接或二维码自主报名，无需审批，适合公开活动。",
    tag: "推荐",
    tagStyle: { color: '#1565C0', backgroundColor: '#E3F2FD', borderColor: '#90CAF9' },
  },
  {
    key: "invite" as const,
    icon: <UserPlus className="w-5 h-5" style={{ color: '#2E7D32' }} />,
    title: "邀请报名",
    subtitle: "仅持有邀请码的人可报名",
    desc: "组织者生成专属邀请码或邀请链接，只有收到邀请的人才能参与，适合私密活动。",
    tag: "私密",
    tagStyle: { color: '#2E7D32', backgroundColor: '#F1F8E9', borderColor: '#A5D6A7' },
  },
  {
    key: "organizer_add" as const,
    icon: <Users className="w-5 h-5" style={{ color: '#E65100' }} />,
    title: "组织者添加",
    subtitle: "由组织者手动添加参与者名单",
    desc: "组织者直接从账本成员或外部名单中添加参与者，参与者无需主动报名，适合内部抽奖。",
    tag: "内部",
    tagStyle: { color: '#E65100', backgroundColor: '#FFF3E0', borderColor: '#FFCC80' },
  },
];

// ─── 外部开奖数据源配置 ────────────────────────────────────────────────────
const EXTERNAL_SEED_TYPES = [
  {
    key: "none" as const,
    icon: <Shield className="w-5 h-5" style={{ color: '#757575' }} />,
    title: "系统内部随机",
    subtitle: "预生成随机种子，开奖前公示哈希",
    desc: "系统在创建时预生成随机种子并公示其哈希值，开奖后公布完整种子供验证。",
    tag: "默认",
    tagStyle: { color: '#757575', backgroundColor: '#F5F5F5', borderColor: '#E0E0E0' },
  },
  {
    key: "sh_index" as const,
    icon: <TrendingUp className="w-5 h-5" style={{ color: '#2E7D32' }} />,
    title: "上证指数收盘价",
    subtitle: "以指定日期上证指数收盘价为开奖依据",
    desc: "数据来源：Yahoo Finance（000001.SS），全球公开可查，任何人均可独立验证。",
    tag: "免费",
    tagStyle: { color: '#2E7D32', backgroundColor: '#F1F8E9', borderColor: '#A5D6A7' },
  },
  {
    key: "sz_index" as const,
    icon: <BarChart2 className="w-5 h-5" style={{ color: '#1565C0' }} />,
    title: "深证成指收盘价",
    subtitle: "以指定日期深证成指收盘价为开奖依据",
    desc: "数据来源：Yahoo Finance（399001.SZ），全球公开可查，任何人均可独立验证。",
    tag: "免费",
    tagStyle: { color: '#1565C0', backgroundColor: '#E3F2FD', borderColor: '#90CAF9' },
  },
  {
    key: "ssq" as const,
    icon: <div className="w-5 h-5 rounded-full flex-shrink-0" style={{ background: 'radial-gradient(circle at 35% 35%, #EF5350, #B71C1C)' }} />,
    title: "双色球开奖号码",
    subtitle: "以指定期双色球开奖号码为开奖依据",
    desc: "数据来源：中国福利彩票官方开奖结果，每周二、四、日开奖，号码公开可查。",
    tag: "彩票",
    tagStyle: { color: '#D32F2F', backgroundColor: '#FFEBEE', borderColor: '#EF9A9A' },
  },
  {
    key: "dlt" as const,
    icon: <div className="w-5 h-5 rounded-full flex-shrink-0" style={{ background: 'radial-gradient(circle at 35% 35%, #FFA726, #E65100)' }} />,
    title: "大乐透开奖号码",
    subtitle: "以指定期大乐透开奖号码为开奖依据",
    desc: "数据来源：中国体育彩票官方开奖结果，每周一、三、六开奖，号码公开可查。",
    tag: "彩票",
    tagStyle: { color: '#E65100', backgroundColor: '#FFF3E0', borderColor: '#FFCC80' },
  },
];

// ─── 奖项行组件 ────────────────────────────────────────────────────────────
interface PrizeRow {
  id: string;
  name: string;
  description: string;
  quantity: number | string;  // 允许临时为空字符串，方便用户清空再输入
  weight: number | string;   // 允许临时为空字符串，方便用户清空再输入
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

  const removePrize = (id: string) => {
    onChange(prizes.filter(p => p.id !== id));
  };

  const updatePrize = (id: string, field: keyof PrizeRow, value: any) => {
    onChange(prizes.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  return (
    <div>
      <div className="space-y-3 mb-3">
        {prizes.map((prize) => (
          <div key={prize.id} className="rounded-xl p-3 border" style={{ backgroundColor: '#FAF3ED', borderColor: '#E0E0E0' }}>
            <div className="flex items-center gap-2 mb-2">
              <input
                className="flex-1 rounded-lg px-3 py-2 text-sm border focus:outline-none font-medium"
                style={{ backgroundColor: '#FFFFFF', borderColor: '#E0E0E0', color: '#D32F2F' }}
                placeholder="奖项名称（如：一等奖）"
                value={prize.name}
                onChange={e => updatePrize(prize.id, "name", e.target.value)}
              />
              <button
                type="button"
                onClick={() => removePrize(prize.id)}
                className="p-1 rounded-full hover:bg-red-50 transition-colors"
              >
                <X className="w-4 h-4" style={{ color: '#757575' }} />
              </button>
            </div>
            <input
              className="w-full rounded-lg px-3 py-1.5 text-sm border focus:outline-none mb-2"
              style={{ backgroundColor: '#FFFFFF', borderColor: '#E0E0E0', color: '#757575' }}
              placeholder="奖品描述（可选）"
              value={prize.description}
              onChange={e => updatePrize(prize.id, "description", e.target.value)}
            />
            <div className="flex items-center gap-4 text-xs" style={{ color: '#757575' }}>
              <label className="flex items-center gap-1.5">
                名额
                <input
                  type="number" min={1}
                  className="w-14 rounded px-2 py-1 text-center border focus:outline-none"
                  style={{ backgroundColor: '#FFFFFF', borderColor: '#E0E0E0', color: '#222222' }}
                  value={prize.quantity}
                  onChange={e => {
                    const raw = e.target.value;
                    // 允许临时空值，方便用户清空后重新输入
                    updatePrize(prize.id, "quantity", raw === '' ? '' : (parseInt(raw) || 1));
                  }}
                  onBlur={e => {
                    // 失焦时确保不为空
                    if (e.target.value === '' || parseInt(e.target.value) < 1) {
                      updatePrize(prize.id, "quantity", 1);
                    }
                  }}
                />
              </label>
              <label className="flex items-center gap-1.5">
                权重
                <input
                  type="number" min={1}
                  className="w-14 rounded px-2 py-1 text-center border focus:outline-none"
                  style={{ backgroundColor: '#FFFFFF', borderColor: '#E0E0E0', color: '#222222' }}
                  value={prize.weight}
                  onChange={e => {
                    const raw = e.target.value;
                    updatePrize(prize.id, "weight", raw === '' ? '' : (parseInt(raw) || 1));
                  }}
                  onBlur={e => {
                    if (e.target.value === '' || parseInt(e.target.value) < 1) {
                      updatePrize(prize.id, "weight", 1);
                    }
                  }}
                />
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={prize.isConsolation}
                  onChange={e => updatePrize(prize.id, "isConsolation", e.target.checked)}
                  className="accent-red-600"
                />
                保底奖
              </label>
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={addPrize}
        className="w-full py-2.5 rounded-xl border-2 text-sm font-medium flex items-center justify-center gap-2 transition-all hover:bg-red-50"
        style={{ borderColor: '#D32F2F', color: '#D32F2F', backgroundColor: '#FFFFFF' }}
      >
        <Plus className="w-4 h-4" />
        添加奖项
      </button>
    </div>
  );
}

// ─── 主页面 ────────────────────────────────────────────────────────────────
export default function LotteryCreate() {
  const [, navigate] = useLocation();
  const { user } = useAuth();

  const search = new URLSearchParams(window.location.search);
  const ledgerId = parseInt(search.get("ledgerId") ?? "0");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState<"instant" | "scheduled" | "milestone">("scheduled");
  const [instantStyle, setInstantStyle] = useState<"scratch" | "wheel" | "flip" | "egg">("scratch");
  const [drawAt, setDrawAt] = useState("");
  const [autoDrawEnabled, setAutoDrawEnabled] = useState(true);
  const [milestoneType, setMilestoneType] = useState<"amount" | "member_count" | "record_count">("amount");
  const [milestoneTarget, setMilestoneTarget] = useState("");
  const [signupStartMode, setSignupStartMode] = useState<"immediate" | "scheduled">("immediate");
  const [signupStartAt, setSignupStartAt] = useState("");
  const [signupEndAt, setSignupEndAt] = useState("");
  const [maxParticipants, setMaxParticipants] = useState("");
  const [signupFee, setSignupFee] = useState("0");
  const [registrationMode, setRegistrationMode] = useState<"open" | "invite" | "organizer_add">("open");
  // 报名条件（自主报名模式下可配置）
  const [signupConditions, setSignupConditions] = useState<Array<{ type: string; value: number; label: string; enabled: boolean }>>(
    [
      { type: 'min_contacts', value: 1, label: '至少有1个人脉', enabled: false },
    ]
  );
  const [useParticipantSeed, setUseParticipantSeed] = useState(false);
  const [isPublic, setIsPublic] = useState(true);
  const [prizes, setPrizes] = useState<PrizeRow[]>([
    { id: "p1", name: "一等奖", description: "", quantity: 1, weight: 1, isConsolation: false },
    { id: "p2", name: "二等奖", description: "", quantity: 3, weight: 1, isConsolation: false },
    { id: "p3", name: "参与奖", description: "", quantity: 0, weight: 1, isConsolation: true },
  ]);

  const [externalSeedType, setExternalSeedType] = useState<"none" | "sh_index" | "sz_index" | "ssq" | "dlt">("none");
  const [externalSeedDate, setExternalSeedDate] = useState("");

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
      const { id: activityId } = await createActivity.mutateAsync({
        ledgerId,
        title: title.trim(),
        description: description.trim() || undefined,
        mode,
        instantStyle: mode === "instant" ? instantStyle : undefined,
        drawAt: mode === "scheduled" && externalSeedType !== "none" && externalSeedDate
          ? (() => {
              // 有外部依据时，自动计算开奖时间：股票当天15:30，彩票当天22:30（北京时间）
              const isLotteryType = externalSeedType === 'ssq' || externalSeedType === 'dlt';
              const hour = isLotteryType ? 22 : 15;
              const min = 30;
              return `${externalSeedDate}T${String(hour).padStart(2,'0')}:${String(min).padStart(2,'0')}`;
            })()
          : mode === "scheduled" && drawAt ? drawAt : undefined,
        autoDrawEnabled,
        milestoneType: mode === "milestone" ? milestoneType : undefined,
        milestoneTarget: mode === "milestone" && milestoneTarget ? parseFloat(milestoneTarget) : undefined,
        signupStartAt: signupStartMode === 'scheduled' && signupStartAt ? signupStartAt : undefined,
        signupEndAt: signupEndAt || undefined,
        maxParticipants: maxParticipants ? parseInt(maxParticipants) : undefined,
        signupFee: parseFloat(signupFee) || 0,
        registrationMode,
        signupConditions: registrationMode === 'open'
          ? signupConditions.filter(c => c.enabled).map(({ type, value, label }) => ({ type, value, label }))
          : undefined,
        useParticipantSeed,
        isPublic,
        externalSeedType: externalSeedType !== "none" ? externalSeedType : undefined,
        externalSeedDate: externalSeedType !== "none" && externalSeedDate ? externalSeedDate : undefined,
      });

      for (let i = 0; i < prizes.length; i++) {
        const p = prizes[i];
        await addPrizeMutation.mutateAsync({
          activityId,
          name: p.name,
          description: p.description || undefined,
          quantity: typeof p.quantity === 'string' ? (parseInt(p.quantity) || 1) : p.quantity,
          sortOrder: i,
          weight: typeof p.weight === 'string' ? (parseInt(p.weight) || 1) : p.weight,
          isConsolation: p.isConsolation,
        });
      }

      await updateActivity.mutateAsync({ activityId, status: "open" });
      navigate(`/lottery/list/${ledgerId}`);
    } catch (e: any) {
      setError(e.message || "创建失败，请重试");
    } finally {
      setSubmitting(false);
    }
  };

  const steps = ["mode", "prizes", "rules", "confirm"] as const;
  const stepIdx = steps.indexOf(step);
  const externalSeedLabel = EXTERNAL_SEED_TYPES.find(t => t.key === externalSeedType)?.title || "系统内部随机";
  const registrationModeLabel = REGISTRATION_MODES.find(m => m.key === registrationMode)?.title || "自由报名";

  // 通用输入框样式
  const inputClass = "w-full rounded-xl px-4 py-3 text-sm border focus:outline-none";
  const inputStyle = { backgroundColor: '#FFFFFF', borderColor: '#E0E0E0', color: '#222222' };

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: '#FAF3ED' }}>
      {/* 顶部导航 */}
      <div className="bg-white border-b sticky top-0 z-10" style={{ borderColor: '#E0E0E0' }}>
        <div className="flex items-center h-14 px-4 gap-3">
          <button
            onClick={() => stepIdx > 0 ? setStep(steps[stepIdx - 1]) : (ledgerId ? navigate(`/lottery/list/${ledgerId}`) : window.history.back())}
            className="p-2 -ml-2"
          >
            <ChevronLeft className="w-6 h-6" style={{ color: '#222222' }} />
          </button>
          <h1 className="flex-1 text-lg font-medium" style={{ color: '#222222' }}>创建抽奖活动</h1>
          <span className="text-sm" style={{ color: '#757575' }}>{stepIdx + 1}/4</span>
        </div>
        {/* 步骤进度条 */}
        <div className="flex px-4 pb-0 gap-1">
          {steps.map((s, i) => (
            <div key={s} className="h-1 flex-1 rounded-full transition-colors"
              style={{ backgroundColor: i <= stepIdx ? '#D32F2F' : '#E0E0E0' }} />
          ))}
        </div>
      </div>

      <div className="px-4 py-5 max-w-lg mx-auto">

        {/* ── Step 1: 选择模式 ── */}
        {step === "mode" && (
          <div>
            <h2 className="text-base font-bold mb-1" style={{ color: '#222222' }}>选择抽奖模式</h2>
            <p className="text-sm mb-3" style={{ color: '#757575' }}>三种模式满足不同场景需求</p>
            <ModeSelector mode={mode} setMode={setMode} />

            {/* 即时模式：动效选择 */}
            {mode === "instant" && (
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2" style={{ color: '#222222' }}>动效样式</label>
                <div className="grid grid-cols-4 gap-2">
                  {INSTANT_STYLES.map(s => (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => setInstantStyle(s.key as any)}
                      className="py-2.5 rounded-xl border-2 flex items-center justify-center transition-all"
                      style={{
                        borderColor: instantStyle === s.key ? '#D32F2F' : '#E0E0E0',
                        backgroundColor: instantStyle === s.key ? '#FFEBEE' : '#FFFFFF',
                      }}
                    >
                      <span className="text-xs font-medium" style={{ color: instantStyle === s.key ? '#D32F2F' : '#757575' }}>{s.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 活动名称 */}
            <div className="mb-3">
              <label className="block text-sm font-medium mb-2" style={{ color: '#222222' }}>活动名称 *</label>
              <input
                className={inputClass}
                style={inputStyle}
                placeholder="例：2025年终感恩抽奖"
                value={title}
                onChange={e => setTitle(e.target.value)}
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2" style={{ color: '#222222' }}>活动描述（可选）</label>
              <textarea
                className={`${inputClass} resize-none`}
                style={inputStyle}
                placeholder="活动说明、奖品介绍等"
                rows={2}
                value={description}
                onChange={e => setDescription(e.target.value)}
              />
            </div>

            {/* 定时模式：开奖时间（有外部依据时自动计算，无依据时手动填写）*/}
            {mode === "scheduled" && (
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2" style={{ color: '#222222' }}>开奖时间</label>
                <div className="rounded-xl px-3 py-2.5 text-sm" style={{ background: '#FAF3ED', border: '1px solid #E0E0E0', color: '#757575' }}>
                  将在第三步选择开奖依据日期后自动设定
                </div>
                <p className="text-xs mt-1.5" style={{ color: '#BDBDBD' }}>股票数据：依据日期当天 15:30 后自动开奖；彩票数据：当天 22:30 后自动开奖</p>
              </div>
            )}

            {/* 阶段解锁模式 */}
            {mode === "milestone" && (
              <div className="mb-4 space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: '#222222' }}>触发条件</label>
                  <div className="grid grid-cols-3 gap-2">
                    {MILESTONE_TYPES.map(t => (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => setMilestoneType(t.key as any)}
                        className="py-2 px-2 rounded-xl text-xs border-2 transition-all"
                        style={{
                          borderColor: milestoneType === t.key ? '#D32F2F' : '#E0E0E0',
                          backgroundColor: milestoneType === t.key ? '#FFEBEE' : '#FFFFFF',
                          color: milestoneType === t.key ? '#D32F2F' : '#757575',
                        }}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: '#222222' }}>目标值</label>
                  <input
                    type="number" min={1}
                    className={inputClass}
                    style={inputStyle}
                    placeholder="达到此值时触发抽奖"
                    value={milestoneTarget}
                    onChange={e => setMilestoneTarget(e.target.value)}
                  />
                </div>
              </div>
            )}

            {error && (
              <div className="mb-3 p-3 rounded-xl text-sm" style={{ backgroundColor: '#FFEBEE', color: '#D32F2F', border: '1px solid #EF9A9A' }}>
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={() => { if (!title.trim()) { setError("请填写活动名称"); return; } setError(""); setStep("prizes"); }}
              className="w-full py-3.5 rounded-2xl text-white font-bold text-base hover:opacity-90 transition-opacity"
              style={{ backgroundColor: '#D32F2F' }}
            >
              下一步：设置奖项
            </button>
          </div>
        )}

        {/* ── Step 2: 奖项设置 ── */}
        {step === "prizes" && (
          <div>
            <h2 className="text-base font-bold mb-1" style={{ color: '#222222' }}>设置奖项</h2>
            <p className="text-sm mb-4" style={{ color: '#757575' }}>添加奖项及名额，支持保底奖</p>
            <div className="bg-white rounded-2xl p-4 shadow-sm border mb-4" style={{ borderColor: '#E0E0E0' }}>
              <PrizeEditor prizes={prizes} onChange={setPrizes} />
            </div>
            {error && (
              <div className="mb-3 p-3 rounded-xl text-sm" style={{ backgroundColor: '#FFEBEE', color: '#D32F2F', border: '1px solid #EF9A9A' }}>
                {error}
              </div>
            )}
            <button
              type="button"
              onClick={() => { if (prizes.filter(p => !p.isConsolation).length === 0) { setError("请至少添加一个非保底奖项"); return; } setError(""); setStep("rules"); }}
              className="w-full py-3.5 rounded-2xl text-white font-bold text-base hover:opacity-90 transition-opacity"
              style={{ backgroundColor: '#D32F2F' }}
            >
              下一步：报名规则
            </button>
          </div>
        )}

        {/* ── Step 3: 报名规则 + 公平机制 ── */}
        {step === "rules" && (
          <div>
            <h2 className="text-base font-bold mb-1" style={{ color: '#222222' }}>报名规则</h2>
            <p className="text-sm mb-4" style={{ color: '#757575' }}>设置报名方式、截止时间及公平机制</p>

            {/* ── 报名方式 ── */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border mb-4" style={{ borderColor: '#E0E0E0' }}>
              <div className="flex items-center gap-2 mb-1">
                <Users className="w-4 h-4" style={{ color: '#D32F2F' }} />
                <span className="text-sm font-semibold" style={{ color: '#222222' }}>报名方式</span>
              </div>
              <p className="text-xs mb-3" style={{ color: '#757575' }}>
                决定参与者如何加入本次抽奖活动
              </p>
              <div className="space-y-2">
                {REGISTRATION_MODES.map(m => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setRegistrationMode(m.key)}
                    className="w-full text-left p-3.5 rounded-xl border-2 transition-all"
                    style={{
                      borderColor: registrationMode === m.key ? '#D32F2F' : '#E0E0E0',
                      backgroundColor: registrationMode === m.key ? '#FFEBEE' : '#FAF3ED',
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex-shrink-0">{m.icon}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm" style={{ color: '#222222' }}>{m.title}</span>
                          <span className="text-xs px-1.5 py-0.5 rounded border" style={m.tagStyle}>{m.tag}</span>
                          {registrationMode === m.key && (
                            <span className="text-xs px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: '#D32F2F' }}>已选</span>
                          )}
                        </div>
                        <p className="text-xs mt-0.5" style={{ color: '#757575' }}>{m.subtitle}</p>
                        <p className="text-xs mt-1 leading-relaxed" style={{ color: '#BDBDBD' }}>{m.desc}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* ── 报名条件（自主报名模式下显示） ── */}
            {registrationMode === 'open' && (
              <div className="bg-white rounded-2xl p-4 shadow-sm border mb-4" style={{ borderColor: '#E0E0E0' }}>
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 className="w-4 h-4" style={{ color: '#D32F2F' }} />
                  <span className="text-sm font-semibold" style={{ color: '#222222' }}>报名条件</span>
                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: '#FFF3E0', color: '#E65100', border: '1px solid #FFCC80' }}>可选</span>
                </div>
                <p className="text-xs mb-3" style={{ color: '#757575' }}>
                  设置后，只有符合条件的用户才能报名。不设则任何人均可报名。
                </p>
                <div className="space-y-2">
                  {signupConditions.map((cond, idx) => (
                    <div key={cond.type} className="rounded-xl border p-3" style={{ borderColor: cond.enabled ? '#D32F2F' : '#E0E0E0', backgroundColor: cond.enabled ? '#FFEBEE' : '#FAF3ED' }}>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const updated = [...signupConditions];
                            updated[idx] = { ...updated[idx], enabled: !updated[idx].enabled };
                            setSignupConditions(updated);
                          }}
                          className="flex-shrink-0"
                        >
                          {cond.enabled
                            ? <CheckCircle2 className="w-5 h-5" style={{ color: '#D32F2F' }} />
                            : <Circle className="w-5 h-5" style={{ color: '#BDBDBD' }} />
                          }
                        </button>
                        <div className="flex-1">
                          <div className="text-sm font-medium" style={{ color: cond.enabled ? '#D32F2F' : '#222222' }}>
                            {cond.type === 'min_contacts' ? '人脉数量要求' : cond.label}
                          </div>
                          {cond.type === 'min_contacts' && (
                            <div className="text-xs mt-0.5" style={{ color: '#757575' }}>报名者必须已添加至少 N 个人脉</div>
                          )}
                        </div>
                        {cond.enabled && (
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <span className="text-xs" style={{ color: '#757575' }}>至少</span>
                            <input
                              type="number" min={1}
                              className="w-12 rounded-lg px-2 py-1 text-center text-sm border focus:outline-none"
                              style={{ borderColor: '#D32F2F', backgroundColor: '#FFFFFF', color: '#222222' }}
                              value={cond.value}
                              onChange={e => {
                                const raw = e.target.value;
                                const updated = [...signupConditions];
                                updated[idx] = { ...updated[idx], value: raw === '' ? 1 : (parseInt(raw) || 1), label: `至少有${raw || 1}个人脉` };
                                setSignupConditions(updated);
                              }}
                            />
                            <span className="text-xs" style={{ color: '#757575' }}>个人脉</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-xs mt-2" style={{ color: '#BDBDBD' }}>更多条件类型持续增加中...</p>
              </div>
            )}

            {/* ── 其他报名设置 ── */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border mb-4 space-y-4" style={{ borderColor: '#E0E0E0' }}>
              {/* 报名开始时间 */}
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: '#222222' }}>报名开始时间</label>
                <div className="flex gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => setSignupStartMode('immediate')}
                    className="flex-1 py-2 rounded-xl text-sm font-medium border-2 transition-all"
                    style={{
                      borderColor: signupStartMode === 'immediate' ? '#D32F2F' : '#E0E0E0',
                      backgroundColor: signupStartMode === 'immediate' ? '#FFEBEE' : '#FAF3ED',
                      color: signupStartMode === 'immediate' ? '#D32F2F' : '#757575',
                    }}
                  >立即开始</button>
                  <button
                    type="button"
                    onClick={() => setSignupStartMode('scheduled')}
                    className="flex-1 py-2 rounded-xl text-sm font-medium border-2 transition-all"
                    style={{
                      borderColor: signupStartMode === 'scheduled' ? '#D32F2F' : '#E0E0E0',
                      backgroundColor: signupStartMode === 'scheduled' ? '#FFEBEE' : '#FAF3ED',
                      color: signupStartMode === 'scheduled' ? '#D32F2F' : '#757575',
                    }}
                  >定时开始</button>
                </div>
                {signupStartMode === 'scheduled' && (
                  <input type="datetime-local" className={inputClass} style={{ ...inputStyle, backgroundColor: '#FAF3ED' }}
                    value={signupStartAt} onChange={e => setSignupStartAt(e.target.value)} />
                )}
              </div>
              {/* 报名截止时间 */}
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: '#222222' }}>报名截止时间（可选）</label>
                <input type="datetime-local" className={inputClass} style={{ ...inputStyle, backgroundColor: '#FAF3ED' }}
                  value={signupEndAt} onChange={e => setSignupEndAt(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: '#222222' }}>最大参与人数（留空=不限）</label>
                <input type="number" min={1} className={inputClass} style={{ ...inputStyle, backgroundColor: '#FAF3ED' }}
                  placeholder="不限" value={maxParticipants} onChange={e => setMaxParticipants(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: '#222222' }}>报名费（元，0=免费）</label>
                <input type="number" min={0} step={0.01} className={inputClass} style={{ ...inputStyle, backgroundColor: '#FAF3ED' }}
                  value={signupFee} onChange={e => setSignupFee(e.target.value)} />
              </div>
            </div>

            {/* ── 公平开奖依据 ── */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border mb-4" style={{ borderColor: '#E0E0E0' }}>
              <div className="flex items-center gap-2 mb-1">
                <Trophy className="w-4 h-4" style={{ color: '#D32F2F' }} />
                <span className="text-sm font-semibold" style={{ color: '#222222' }}>公平开奖依据</span>
              </div>
              <p className="text-xs mb-3" style={{ color: '#757575' }}>
                选择开奖时使用的随机数据来源，外部数据全球公开可查，任何人均可独立验证结果
              </p>
              <div className="space-y-2">
                {EXTERNAL_SEED_TYPES.map(t => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setExternalSeedType(t.key)}
                    className="w-full text-left p-3.5 rounded-xl border-2 transition-all"
                    style={{
                      borderColor: externalSeedType === t.key ? '#D32F2F' : '#E0E0E0',
                      backgroundColor: externalSeedType === t.key ? '#FFEBEE' : '#FAF3ED',
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex-shrink-0">{t.icon}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm" style={{ color: '#222222' }}>{t.title}</span>
                          <span className="text-xs px-1.5 py-0.5 rounded border" style={t.tagStyle}>{t.tag}</span>
                          {externalSeedType === t.key && (
                            <span className="text-xs px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: '#D32F2F' }}>已选</span>
                          )}
                        </div>
                        <p className="text-xs mt-0.5" style={{ color: '#757575' }}>{t.subtitle}</p>
                        <p className="text-xs mt-1 leading-relaxed" style={{ color: '#BDBDBD' }}>{t.desc}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {/* 外部数据日期选择 - 智能日历 */}
              {externalSeedType !== "none" && (
                <div className="mt-3">
                  <label className="block text-sm font-medium mb-2" style={{ color: '#222222' }}>
                    {externalSeedType === "sh_index" || externalSeedType === "sz_index"
                      ? "选择收盘日期（必须是交易日）"
                      : "选择开奖日期（仅显示开奖日）"}
                  </label>
                  <LotteryDatePicker
                    value={externalSeedDate}
                    onChange={setExternalSeedDate}
                    seedType={externalSeedType}
                  />
                </div>
              )}
            </div>

            {/* 其他公平性选项 */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border mb-4 space-y-3" style={{ borderColor: '#E0E0E0' }}>
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={useParticipantSeed} onChange={e => setUseParticipantSeed(e.target.checked)} className="accent-red-600 mt-0.5" />
                <div>
                  <div className="text-sm font-medium" style={{ color: '#222222' }}>参与者共同决定随机种子</div>
                  <div className="text-xs mt-0.5" style={{ color: '#757575' }}>每位参与者报名时贡献一段随机数，所有人的随机数共同决定最终种子，组织者无法预知或操控结果。</div>
                </div>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={isPublic} onChange={e => setIsPublic(e.target.checked)} className="accent-red-600" />
                <div className="text-sm" style={{ color: '#222222' }}>公开活动（链接可见）</div>
              </label>
            </div>

            {error && (
              <div className="mb-3 p-3 rounded-xl text-sm" style={{ backgroundColor: '#FFEBEE', color: '#D32F2F', border: '1px solid #EF9A9A' }}>
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={() => { setError(""); setStep("confirm"); }}
              className="w-full py-3.5 rounded-2xl text-white font-bold text-base hover:opacity-90 transition-opacity"
              style={{ backgroundColor: '#D32F2F' }}
            >
              下一步：确认创建
            </button>
          </div>
        )}

        {/* ── Step 4: 确认 ── */}
        {step === "confirm" && (
          <div>
            <h2 className="text-base font-bold mb-1" style={{ color: '#222222' }}>确认创建</h2>
            <p className="text-sm mb-4" style={{ color: '#757575' }}>请核对以下信息</p>

            <div className="bg-white rounded-2xl p-4 shadow-sm border mb-4" style={{ borderColor: '#E0E0E0' }}>
              {[
                { label: "活动名称", value: title, valueColor: '#222222' },
                { label: "抽奖模式", value: MODES.find(m => m.key === mode)?.title, valueColor: '#D32F2F' },
                ...(mode === "instant" ? [{ label: "动效样式", value: INSTANT_STYLES.find(s => s.key === instantStyle)?.label, valueColor: '#222222' }] : []),
                ...(mode === "scheduled" && drawAt ? [{ label: "开奖时间", value: new Date(drawAt).toLocaleString(), valueColor: '#222222' }] : []),
                { label: "奖项数量", value: `${prizes.length} 个`, valueColor: '#222222' },
                { label: "报名方式", value: registrationModeLabel, valueColor: '#1565C0' },
                { label: "报名费", value: parseFloat(signupFee) > 0 ? `¥${signupFee}` : "免费", valueColor: '#222222' },
                {
                  label: "开奖依据",
                  value: externalSeedLabel + (externalSeedType !== "none" && externalSeedDate ? ` (${externalSeedDate})` : ""),
                  valueColor: externalSeedType !== "none" ? '#D32F2F' : '#2E7D32',
                },
                ...(useParticipantSeed ? [{ label: "参与者种子", value: "✓ 开启", valueColor: '#2E7D32' }] : []),
              ].map((row, i) => (
                <div key={i} className="flex justify-between items-center py-2.5 border-b last:border-b-0" style={{ borderColor: '#F5F5F5' }}>
                  <span className="text-sm" style={{ color: '#757575' }}>{row.label}</span>
                  <span className="text-sm font-medium" style={{ color: row.valueColor }}>{row.value}</span>
                </div>
              ))}
            </div>

            {/* 奖项预览 */}
            <div className="mb-4">
              <div className="text-sm font-medium mb-2" style={{ color: '#222222' }}>奖项预览</div>
              <div className="space-y-2">
                {prizes.map((p) => (
                  <div key={p.id} className="flex items-center justify-between rounded-xl px-3 py-2.5 border" style={{ backgroundColor: '#FAF3ED', borderColor: '#E0E0E0' }}>
                    <span className="text-sm font-medium" style={{ color: '#D32F2F' }}>{p.name}</span>
                    <span className="text-xs" style={{ color: '#757575' }}>
                      {p.isConsolation ? "保底（剩余参与者）" : `×${p.quantity} 名`}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* 外部数据说明 */}
            {externalSeedType !== "none" && (
              <div className="mb-4 p-3 rounded-xl border text-xs leading-relaxed" style={{ backgroundColor: '#FAF3ED', borderColor: '#E0E0E0', color: '#757575' }}>
                🔍 <strong style={{ color: '#222222' }}>可验证说明：</strong>开奖时系统将自动拉取{externalSeedLabel}数据，
                与内部随机种子混合后决定最终结果。任何人均可用相同数据独立验证，确保公平。
              </div>
            )}

            {error && (
              <div className="mb-4 p-3 rounded-xl text-sm" style={{ backgroundColor: '#FFEBEE', color: '#D32F2F', border: '1px solid #EF9A9A' }}>
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full py-3.5 rounded-2xl text-white font-bold text-base hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: '#D32F2F' }}
            >
              {submitting ? "创建中..." : "立即创建并开放报名"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
