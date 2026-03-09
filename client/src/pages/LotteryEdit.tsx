/**
 * 抽奖活动编辑页（紧凑版）
 * 路由：/lottery/edit/:activityId
 */
import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useRef } from "react";
import {
  ChevronLeft, Save, Clock, Users, Gift, Plus, Trash2, Edit3, Check, Trophy, Zap, Timer, AlignLeft, Type, ImagePlus, X, TrendingUp, Shield
} from "lucide-react";
import { LotteryDatePicker } from "@/components/LotteryDatePicker";

interface PrizeRow {
  id?: number;
  name: string;
  description: string;
  quantity: number;
  prizeValue: string;
  isConsolation: boolean;
  imageUrl?: string | null;
  isNew?: boolean;
  deleted?: boolean;
}

const C = {
  red: '#D32F2F', redLight: '#FFEBEE', bg: '#FAF3ED',
  card: '#FFFFFF', text: '#1A1A1A', sub: '#757575', border: '#E8E0D8',
};

const inputCls = "w-full rounded-lg px-3 py-2 text-sm border focus:outline-none focus:ring-1 focus:ring-red-200";
const inputSty = { backgroundColor: '#FAFAFA', borderColor: C.border, color: C.text };

export default function LotteryEdit() {
  const [, params] = useRoute("/lottery/edit/:activityId");
  const activityId = parseInt(params?.activityId ?? "0");
  const [, navigate] = useLocation();

  const { data: activity, isLoading } = trpc.lottery.getActivity.useQuery({ activityId });
  const updateMutation = trpc.lottery.update.useMutation();
  const addPrizeMutation = trpc.lottery.addPrize.useMutation();
  const updatePrizeMutation = trpc.lottery.updatePrize.useMutation();
  const deletePrizeMutation = trpc.lottery.deletePrize.useMutation();
  const uploadFileMutation = trpc.upload.file.useMutation();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState<"instant" | "scheduled" | "milestone">("instant");
  const [drawAt, setDrawAt] = useState("");
  const [signupStartMode, setSignupStartMode] = useState<"immediate" | "scheduled">("immediate");
  const [signupStartAt, setSignupStartAt] = useState("");
  const [signupEndAt, setSignupEndAt] = useState("");
  const [maxParticipants, setMaxParticipants] = useState("");
  const [registrationMode, setRegistrationMode] = useState<"open" | "invite" | "organizer_add">("open");
  const [requiresInfo, setRequiresInfo] = useState(false);
  const [isPublic, setIsPublic] = useState(true);
  const [externalSeedType, setExternalSeedType] = useState<"none" | "sh_index" | "sz_index" | "ssq" | "dlt">("none");
  const [externalSeedDate, setExternalSeedDate] = useState("");
  const [participantScale, setParticipantScale] = useState<"small" | "large">("small");
  const [prizes, setPrizes] = useState<PrizeRow[]>([]);
  const [editingPrizeIdx, setEditingPrizeIdx] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!activity) return;
    setTitle(activity.title ?? "");
    setDescription(activity.description ?? "");
    setMode(activity.mode ?? "instant");
    setRegistrationMode(activity.registration_mode ?? "open");
    setRequiresInfo(!!activity.requires_info);
    setIsPublic(activity.is_public !== false);
    setExternalSeedType((activity.external_seed_type as any) ?? "none");
    setExternalSeedDate(activity.external_seed_date ?? "");
    setParticipantScale((activity.participant_scale as any) ?? "small");
    setMaxParticipants(activity.max_participants ? String(activity.max_participants) : "");
    if (activity.draw_at) {
      const d = new Date(activity.draw_at);
      setDrawAt(new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16));
    }
    if (activity.signup_start_at) {
      const d = new Date(activity.signup_start_at);
      setSignupStartMode('scheduled');
      setSignupStartAt(new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16));
    } else {
      setSignupStartMode('immediate');
      setSignupStartAt('');
    }
    if (activity.signup_end_at) {
      const d = new Date(activity.signup_end_at);
      setSignupEndAt(new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16));
    }
    if (activity.prizes) {
      setPrizes(activity.prizes.map((p: any) => ({
        id: p.id, name: p.name ?? "", description: p.description ?? "",
        quantity: p.quantity ?? 1, prizeValue: p.prize_value ? String(p.prize_value) : "",
        isConsolation: !!p.is_consolation,
        imageUrl: p.image_url ?? null,
      })));
    }
  }, [activity]);

  const handleSave = async () => {
    if (!title.trim()) { setError("请填写活动名称"); return; }
    if (prizes.filter(p => !p.deleted).length === 0) { setError("至少需要一个奖项"); return; }
    setSubmitting(true); setError("");
    try {
      await updateMutation.mutateAsync({
        activityId, title: title.trim(),
        description: description.trim() || undefined,
        mode, drawAt: drawAt || undefined,
        signupStartAt: signupStartMode === 'scheduled' && signupStartAt ? signupStartAt : undefined,
        signupEndAt: signupEndAt || undefined,
        maxParticipants: maxParticipants ? parseInt(maxParticipants) : null,
        isPublic, requiresInfo, registrationMode,
        externalSeedType: externalSeedType === 'none' ? undefined : externalSeedType,
        externalSeedDate: externalSeedDate || undefined,
        participantScale,
      });
      for (const prize of prizes) {
        if (prize.deleted && prize.id) {
          await deletePrizeMutation.mutateAsync({ prizeId: prize.id, activityId });
        } else if (prize.isNew && !prize.deleted) {
          await addPrizeMutation.mutateAsync({
            activityId, name: prize.name,
            description: prize.description || undefined,
            quantity: prize.quantity,
            prizeValue: prize.prizeValue ? parseFloat(prize.prizeValue) : undefined,
            isConsolation: prize.isConsolation,
            imageUrl: prize.imageUrl || undefined,
          });
        } else if (prize.id && !prize.deleted) {
          await updatePrizeMutation.mutateAsync({
            prizeId: prize.id, activityId, name: prize.name,
            description: prize.description || undefined,
            quantity: prize.quantity,
            prizeValue: prize.prizeValue ? parseFloat(prize.prizeValue) : undefined,
            isConsolation: prize.isConsolation,
            imageUrl: prize.imageUrl,
          });
        }
      }
      setSuccess(true);
      setTimeout(() => navigate(`/lottery/${activityId}` as any), 1200);
    } catch (e: any) {
      setError(e.message || "保存失败，请重试");
    } finally {
      setSubmitting(false);
    }
  };

  const addPrize = () => {
    const newIdx = prizes.length;
    setPrizes(prev => [...prev, { name: "", description: "", quantity: 1, prizeValue: "", isConsolation: false, isNew: true }]);
    setEditingPrizeIdx(newIdx);
  };
  const removePrize = (idx: number) => {
    setPrizes(prev => prev.map((p, i) => i === idx ? { ...p, deleted: true } : p));
    if (editingPrizeIdx === idx) setEditingPrizeIdx(null);
  };
  const updatePrizeField = (idx: number, field: keyof PrizeRow, value: any) =>
    setPrizes(prev => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p));

  const visiblePrizes = prizes.map((p, i) => ({ ...p, _idx: i })).filter(p => !p.deleted);

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: C.bg }}>
      <div className="text-sm" style={{ color: C.sub }}>加载中...</div>
    </div>
  );
  if (!activity) return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: C.bg }}>
      <div className="text-sm" style={{ color: C.sub }}>活动不存在</div>
    </div>
  );

  return (
    <div className="min-h-screen pb-28" style={{ backgroundColor: C.bg }}>
      {/* 顶部导航 */}
      <div className="sticky top-0 z-10 px-4 h-12 flex items-center gap-3" style={{ backgroundColor: C.red }}>
        <button onClick={() => navigate(`/lottery/list/${activity.ledger_id}` as any)} className="p-1 -ml-1">
          <ChevronLeft className="w-5 h-5 text-white" />
        </button>
        <h1 className="text-sm font-semibold text-white flex-1">编辑活动</h1>
        <span className="text-xs text-white/70 px-2 py-0.5 rounded-full border border-white/30">
          {activity.status === 'draft' ? '草稿' : activity.status === 'open' ? '报名中' : activity.status}
        </span>
      </div>

      <div className="px-3 pt-3 space-y-2.5 max-w-lg mx-auto">

        {/* 卡片1：名称 + 描述 */}
        <div className="bg-white rounded-xl p-3.5" style={{ border: `1px solid ${C.border}` }}>
          <div className="flex items-center gap-1.5 text-xs font-semibold mb-2" style={{ color: C.sub }}>
            <Type className="w-3.5 h-3.5" style={{ color: C.red }} />基本信息
          </div>
          <input className={inputCls} style={inputSty}
            placeholder="活动名称（必填）"
            value={title} onChange={e => setTitle(e.target.value)} maxLength={100} />
          <textarea className={`${inputCls} mt-2`} style={{ ...inputSty, resize: 'none' }}
            placeholder="活动描述（选填）" rows={2}
            value={description} onChange={e => setDescription(e.target.value)} maxLength={500} />
        </div>

        {/* 卡片2：开奖模式 */}
        <div className="bg-white rounded-xl p-3.5" style={{ border: `1px solid ${C.border}` }}>
          <div className="flex items-center gap-1.5 text-xs font-semibold mb-2" style={{ color: C.sub }}>
            <Zap className="w-3.5 h-3.5" style={{ color: C.red }} />开奖模式
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {([
              { value: 'instant', label: '即时开奖', icon: <Zap className="w-3.5 h-3.5" /> },
              { value: 'scheduled', label: '定时开奖', icon: <Timer className="w-3.5 h-3.5" /> },
              { value: 'milestone', label: '里程碑', icon: <Trophy className="w-3.5 h-3.5" /> },
            ] as const).map(opt => (
              <button key={opt.value} onClick={() => setMode(opt.value)}
                className="flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium border-2 transition-colors"
                style={{
                  borderColor: mode === opt.value ? C.red : C.border,
                  backgroundColor: mode === opt.value ? C.redLight : '#FAFAFA',
                  color: mode === opt.value ? C.red : C.sub,
                }}>
                {opt.icon}{opt.label}
              </button>
            ))}
          </div>
          {/* 开奖时间（定时模式内联显示） */}
          {mode === 'scheduled' && (
            <div className="mt-2 flex items-center gap-2">
              <div className="text-xs flex-shrink-0" style={{ color: C.sub }}>开奖时间</div>
              <input type="datetime-local" className={inputCls} style={{ ...inputSty, flex: 1 }}
                value={drawAt} onChange={e => setDrawAt(e.target.value)} />
            </div>
          )}
        </div>

        {/* 卡片3：报名时间设置 */}
        <div className="bg-white rounded-xl p-3.5" style={{ border: `1px solid ${C.border}` }}>
          <div className="flex items-center gap-1.5 text-xs font-semibold mb-2" style={{ color: C.sub }}>
            <Clock className="w-3.5 h-3.5" style={{ color: C.red }} />报名设置
          </div>
          <div className="space-y-2">
            {/* 报名开始时间 */}
            <div>
              <div className="text-xs mb-1.5" style={{ color: C.sub }}>报名开始</div>
              <div className="flex gap-1.5 mb-1.5">
                <button
                  type="button"
                  onClick={() => setSignupStartMode('immediate')}
                  className="flex-1 py-1.5 rounded-lg text-xs font-medium border-2 transition-colors"
                  style={{
                    borderColor: signupStartMode === 'immediate' ? C.red : C.border,
                    backgroundColor: signupStartMode === 'immediate' ? C.redLight : '#FAFAFA',
                    color: signupStartMode === 'immediate' ? C.red : C.sub,
                  }}
                >立即开始</button>
                <button
                  type="button"
                  onClick={() => setSignupStartMode('scheduled')}
                  className="flex-1 py-1.5 rounded-lg text-xs font-medium border-2 transition-colors"
                  style={{
                    borderColor: signupStartMode === 'scheduled' ? C.red : C.border,
                    backgroundColor: signupStartMode === 'scheduled' ? C.redLight : '#FAFAFA',
                    color: signupStartMode === 'scheduled' ? C.red : C.sub,
                  }}
                >定时开始</button>
              </div>
              {signupStartMode === 'scheduled' && (
                <input type="datetime-local" className={inputCls} style={{ ...inputSty, width: '100%' }}
                  value={signupStartAt} onChange={e => setSignupStartAt(e.target.value)} />
              )}
            </div>
            {/* 报名截止时间 */}
            <div className="flex items-center gap-2">
              <div className="text-xs flex-shrink-0 w-16" style={{ color: C.sub }}>报名截止</div>
              <input type="datetime-local" className={inputCls} style={{ ...inputSty, flex: 1 }}
                value={signupEndAt} onChange={e => setSignupEndAt(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <div className="text-xs flex-shrink-0 w-16" style={{ color: C.sub }}>人数上限</div>
              <input type="number" min={1} className={inputCls} style={{ ...inputSty, flex: 1 }}
                placeholder="不限" value={maxParticipants} onChange={e => setMaxParticipants(e.target.value)} />
            </div>
            {/* 人数规模选择 */}
            <div className="flex items-center gap-2">
              <div className="text-xs flex-shrink-0 w-16" style={{ color: C.sub }}>人数规模</div>
              <div className="flex gap-1.5 flex-1">
                {([{ value: 'small', label: '100人以内' }, { value: 'large', label: '100人以上' }] as const).map(opt => (
                  <button key={opt.value} onClick={() => setParticipantScale(opt.value)}
                    className="flex-1 py-1.5 rounded-lg text-xs font-medium border-2 transition-colors"
                    style={{
                      borderColor: participantScale === opt.value ? C.red : C.border,
                      backgroundColor: participantScale === opt.value ? C.redLight : '#FAFAFA',
                      color: participantScale === opt.value ? C.red : C.sub,
                    }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 卡片4：报名方式 + 其他设置（合并） */}
        <div className="bg-white rounded-xl p-3.5" style={{ border: `1px solid ${C.border}` }}>
          <div className="flex items-center gap-1.5 text-xs font-semibold mb-2" style={{ color: C.sub }}>
            <Users className="w-3.5 h-3.5" style={{ color: C.red }} />报名方式
          </div>
          <div className="flex gap-1.5 mb-3">
            {([
              { value: 'open', label: '公开报名' },
              { value: 'organizer_add', label: '仅限成员' },
              { value: 'invite', label: '邀请制' },
            ] as const).map(opt => (
              <button key={opt.value} onClick={() => setRegistrationMode(opt.value)}
                className="flex-1 py-1.5 rounded-lg text-xs font-medium border-2 transition-colors"
                style={{
                  borderColor: registrationMode === opt.value ? C.red : C.border,
                  backgroundColor: registrationMode === opt.value ? C.redLight : '#FAFAFA',
                  color: registrationMode === opt.value ? C.red : C.sub,
                }}>
                {opt.label}
              </button>
            ))}
          </div>
          {/* 分割线 */}
          <div className="border-t mb-2.5" style={{ borderColor: C.border }} />
          {/* 开关行 */}
          {[
            { label: '公开活动', desc: '关闭则仅成员可见', val: isPublic, set: setIsPublic },
            { label: '收集报名信息', desc: '报名时要求填写联系方式', val: requiresInfo, set: setRequiresInfo },
          ].map(item => (
            <div key={item.label} className="flex items-center justify-between py-1.5">
              <div>
                <span className="text-sm" style={{ color: C.text }}>{item.label}</span>
                <span className="text-xs ml-1.5" style={{ color: C.sub }}>{item.desc}</span>
              </div>
              <button onClick={() => item.set((v: boolean) => !v)}
                className="w-10 h-5 rounded-full transition-colors relative flex-shrink-0 ml-2"
                style={{ backgroundColor: item.val ? C.red : '#D0D0D0' }}>
                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${item.val ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>
          ))}
        </div>

        {/* 卡片5：奖项管理 */}
        <div className="bg-white rounded-xl p-3.5" style={{ border: `1px solid ${C.border}` }}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: C.sub }}>
              <Gift className="w-3.5 h-3.5" style={{ color: C.red }} />奖项设置
              <span className="px-1.5 py-0.5 rounded-full text-xs" style={{ backgroundColor: C.redLight, color: C.red }}>
                {visiblePrizes.length}
              </span>
            </div>
            <button onClick={addPrize}
              className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium"
              style={{ backgroundColor: C.redLight, color: C.red }}>
              <Plus className="w-3 h-3" />添加
            </button>
          </div>
          {visiblePrizes.length === 0 ? (
            <div className="text-center py-4" style={{ color: C.sub }}>
              <p className="text-xs">还没有奖项，点击「添加」</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {visiblePrizes.map((prize, visIdx) => {
                const idx = prize._idx;
                const isEditing = editingPrizeIdx === idx;
                return (
                  <div key={idx} className="rounded-lg border" style={{ borderColor: isEditing ? C.red : C.border }}>
                    {isEditing ? (
                      <div className="p-2.5 space-y-1.5">
                        {/* 图片上传区域 */}
                        <div className="flex items-start gap-2">
                          {/* 图片预览/上传按钮 */}
                          <label className="relative flex-shrink-0 cursor-pointer">
                            <input type="file" accept="image/*" className="hidden"
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                if (file.size > 5 * 1024 * 1024) { alert('图片不能超过 5MB'); return; }
                                const reader = new FileReader();
                                reader.onload = async (ev) => {
                                  const base64 = (ev.target?.result as string).split(',')[1];
                                  try {
                                    const { url } = await uploadFileMutation.mutateAsync({
                                      base64Data: base64,
                                      contentType: file.type,
                                      prefix: 'lottery-prizes',
                                    });
                                    updatePrizeField(idx, 'imageUrl', url);
                                  } catch { alert('上传失败，请重试'); }
                                };
                                reader.readAsDataURL(file);
                              }} />
                            {prize.imageUrl ? (
                              <div className="relative w-16 h-16">
                                <img src={prize.imageUrl} alt="奖品图" className="w-16 h-16 rounded-lg object-cover border" style={{ borderColor: C.border }} />
                                <button type="button"
                                  className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center"
                                  onClick={(e) => { e.preventDefault(); updatePrizeField(idx, 'imageUrl', null); }}>
                                  <X className="w-2.5 h-2.5" />
                                </button>
                              </div>
                            ) : (
                              <div className="w-16 h-16 rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-0.5"
                                style={{ borderColor: C.border, backgroundColor: '#FAFAFA' }}>
                                {uploadFileMutation.isPending ? (
                                  <div className="w-4 h-4 border-2 border-red-300 border-t-red-600 rounded-full animate-spin" />
                                ) : (
                                  <>
                                    <ImagePlus className="w-4 h-4" style={{ color: C.sub }} />
                                    <span className="text-xs" style={{ color: C.sub }}>图片</span>
                                  </>
                                )}
                              </div>
                            )}
                          </label>
                          {/* 名称+描述 */}
                          <div className="flex-1 space-y-1.5">
                            <input className="w-full rounded-lg px-3 py-1.5 text-sm border focus:outline-none"
                              style={{ borderColor: C.red, color: C.text, backgroundColor: '#FAFAFA' }}
                              placeholder="奖项名称（必填）" value={prize.name} autoFocus
                              onChange={e => updatePrizeField(idx, 'name', e.target.value)} />
                            <input className="w-full rounded-lg px-3 py-1.5 text-sm border focus:outline-none"
                              style={{ borderColor: C.border, color: C.text, backgroundColor: '#FAFAFA' }}
                              placeholder="描述（选填）" value={prize.description}
                              onChange={e => updatePrizeField(idx, 'description', e.target.value)} />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          <div>
                            <div className="text-xs mb-0.5" style={{ color: C.sub }}>数量</div>
                            <input type="number" min={1}
                              className="w-full rounded-lg px-3 py-1.5 text-sm border focus:outline-none"
                              style={{ borderColor: C.border, color: C.text, backgroundColor: '#FAFAFA' }}
                              value={prize.quantity}
                              onChange={e => updatePrizeField(idx, 'quantity', parseInt(e.target.value) || 1)} />
                          </div>
                          <div>
                            <div className="text-xs mb-0.5" style={{ color: C.sub }}>价值（元）</div>
                            <input type="number" min={0} step={0.01}
                              className="w-full rounded-lg px-3 py-1.5 text-sm border focus:outline-none"
                              style={{ borderColor: C.border, color: C.text, backgroundColor: '#FAFAFA' }}
                              placeholder="选填" value={prize.prizeValue}
                              onChange={e => updatePrizeField(idx, 'prizeValue', e.target.value)} />
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => updatePrizeField(idx, 'isConsolation', !prize.isConsolation)}
                            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border"
                            style={{
                              borderColor: prize.isConsolation ? C.red : C.border,
                              backgroundColor: prize.isConsolation ? C.redLight : 'transparent',
                              color: prize.isConsolation ? C.red : C.sub,
                            }}>
                            <Trophy className="w-3 h-3" />安慰奖
                          </button>
                          <div className="flex-1" />
                          <button onClick={() => setEditingPrizeIdx(null)}
                            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full"
                            style={{ backgroundColor: C.redLight, color: C.red }}>
                            <Check className="w-3 h-3" />完成
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 px-3 py-2">
                        {prize.imageUrl ? (
                          <img src={prize.imageUrl} alt="" className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                            style={{ backgroundColor: C.redLight, color: C.red }}>
                            {visIdx + 1}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium" style={{ color: C.text }}>
                            {prize.name || <span style={{ color: C.sub }}>未填写</span>}
                          </span>
                          <span className="text-xs ml-1.5" style={{ color: C.sub }}>
                            ×{prize.quantity}{prize.prizeValue ? ` ¥${prize.prizeValue}` : ''}{prize.isConsolation ? ' 安慰奖' : ''}
                          </span>
                        </div>
                        <button onClick={() => setEditingPrizeIdx(idx)} className="p-1 rounded" style={{ color: C.sub }}>
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => removePrize(idx)} className="p-1 rounded" style={{ color: '#EF5350' }}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 卡片6：公平开奖依据 */}
        <div className="bg-white rounded-xl p-3.5" style={{ border: `1px solid ${C.border}` }}>
          <div className="flex items-center gap-1.5 text-xs font-semibold mb-2" style={{ color: C.sub }}>
            <Shield className="w-3.5 h-3.5" style={{ color: C.red }} />公平开奖依据
          </div>
          <div className="flex gap-1.5 flex-wrap mb-2">
            {([
              { value: 'none', label: '随机算法' },
              { value: 'sh_index', label: '上证指数' },
              { value: 'sz_index', label: '深证成指' },
              { value: 'ssq', label: '双色球' },
              { value: 'dlt', label: '大乐透' },
            ] as const).map(opt => (
              <button key={opt.value} onClick={() => { setExternalSeedType(opt.value); setExternalSeedDate(''); }}
                className="py-1.5 px-3 rounded-lg text-xs font-medium border-2 transition-colors"
                style={{
                  borderColor: externalSeedType === opt.value ? C.red : C.border,
                  backgroundColor: externalSeedType === opt.value ? C.redLight : '#FAFAFA',
                  color: externalSeedType === opt.value ? C.red : C.sub,
                }}>
                {opt.label}
              </button>
            ))}
          </div>
          {externalSeedType !== 'none' && (
            <div className="mt-2">
              <div className="text-xs mb-1.5" style={{ color: C.sub }}>
                {externalSeedType === 'sh_index' || externalSeedType === 'sz_index'
                  ? '选择依据的交易日（灰色为非交易日）'
                  : externalSeedType === 'ssq'
                  ? '选择双色球开奖日（仅周二/四/日）'
                  : '选择大乐透开奖日（仅周一/三/六）'}
              </div>
              <LotteryDatePicker
                seedType={externalSeedType}
                value={externalSeedDate}
                onChange={setExternalSeedDate}
              />
              {externalSeedDate && (
                <div className="mt-1.5 text-xs px-2 py-1 rounded-lg" style={{ backgroundColor: C.redLight, color: C.red }}>
                  已选：{externalSeedDate}
                </div>
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-lg px-3 py-2 text-xs" style={{ backgroundColor: C.redLight, color: C.red }}>
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-lg px-3 py-2 text-xs text-white" style={{ backgroundColor: '#2E7D32' }}>
            保存成功！正在跳转...
          </div>
        )}
      </div>

      {/* 底部保存按钮 */}
      <div className="fixed bottom-0 left-0 right-0 px-4 pb-6 pt-3" style={{ backgroundColor: C.bg }}>
        <button
          onClick={handleSave}
          disabled={submitting}
          className="w-full max-w-lg mx-auto flex items-center justify-center gap-2 py-3.5 rounded-2xl text-white font-bold text-sm active:opacity-80 transition-opacity disabled:opacity-50 block"
          style={{ backgroundColor: C.red }}
        >
          <Save className="w-4 h-4" />
          {submitting ? '保存中...' : '保存修改'}
        </button>
      </div>
    </div>
  );
}
