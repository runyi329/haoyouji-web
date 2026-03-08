/**
 * 抽奖活动编辑页（完整版）
 * 路由：/lottery/edit/:activityId
 * 功能：修改活动所有字段，包括奖项增删改、开奖模式、报名方式、时间、人数等
 */
import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  ChevronLeft, Save, Clock, Users, AlignLeft, Type,
  Gift, Plus, Trash2, Edit3, Check, Trophy, Zap, Timer
} from "lucide-react";

interface PrizeRow {
  id?: number;
  name: string;
  description: string;
  quantity: number;
  prizeValue: string;
  isConsolation: boolean;
  isNew?: boolean;
  deleted?: boolean;
}

const C = {
  red: '#D32F2F',
  redDark: '#B71C1C',
  redLight: '#FFEBEE',
  bg: '#FAF3ED',
  card: '#FFFFFF',
  text: '#1A1A1A',
  sub: '#757575',
  border: '#E0E0E0',
};

export default function LotteryEdit() {
  const [, params] = useRoute("/lottery/edit/:activityId");
  const activityId = parseInt(params?.activityId ?? "0");
  const [, navigate] = useLocation();

  const { data: activity, isLoading } = trpc.lottery.getActivity.useQuery({ activityId });
  const updateMutation = trpc.lottery.update.useMutation();
  const addPrizeMutation = trpc.lottery.addPrize.useMutation();
  const updatePrizeMutation = trpc.lottery.updatePrize.useMutation();
  const deletePrizeMutation = trpc.lottery.deletePrize.useMutation();

  // 基础字段
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState<"instant" | "scheduled" | "milestone">("instant");
  const [drawAt, setDrawAt] = useState("");
  const [signupEndAt, setSignupEndAt] = useState("");
  const [maxParticipants, setMaxParticipants] = useState("");
  const [registrationMode, setRegistrationMode] = useState<"open" | "member_only" | "invite_only">("open");
  const [requiresInfo, setRequiresInfo] = useState(false);
  const [isPublic, setIsPublic] = useState(true);

  // 奖项列表
  const [prizes, setPrizes] = useState<PrizeRow[]>([]);
  const [editingPrizeIdx, setEditingPrizeIdx] = useState<number | null>(null);

  // 状态
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // 预填数据
  useEffect(() => {
    if (!activity) return;
    setTitle(activity.title ?? "");
    setDescription(activity.description ?? "");
    setMode(activity.mode ?? "instant");
    setRegistrationMode(activity.registration_mode ?? "open");
    setRequiresInfo(!!activity.requires_info);
    setIsPublic(activity.is_public !== false);
    setMaxParticipants(activity.max_participants ? String(activity.max_participants) : "");
    if (activity.draw_at) {
      const d = new Date(activity.draw_at);
      setDrawAt(new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16));
    }
    if (activity.signup_end_at) {
      const d = new Date(activity.signup_end_at);
      setSignupEndAt(new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16));
    }
    if (activity.prizes) {
      setPrizes(activity.prizes.map((p: any) => ({
        id: p.id,
        name: p.name ?? "",
        description: p.description ?? "",
        quantity: p.quantity ?? 1,
        prizeValue: p.prize_value ? String(p.prize_value) : "",
        isConsolation: !!p.is_consolation,
      })));
    }
  }, [activity]);

  const handleSave = async () => {
    if (!title.trim()) { setError("请填写活动名称"); return; }
    if (prizes.filter(p => !p.deleted).length === 0) { setError("至少需要一个奖项"); return; }
    setSubmitting(true);
    setError("");
    try {
      await updateMutation.mutateAsync({
        activityId,
        title: title.trim(),
        description: description.trim() || undefined,
        mode,
        drawAt: drawAt || undefined,
        signupEndAt: signupEndAt || undefined,
        maxParticipants: maxParticipants ? parseInt(maxParticipants) : null,
        isPublic,
        requiresInfo,
      });
      for (const prize of prizes) {
        if (prize.deleted && prize.id) {
          await deletePrizeMutation.mutateAsync({ prizeId: prize.id, activityId });
        } else if (prize.isNew && !prize.deleted) {
          await addPrizeMutation.mutateAsync({
            activityId,
            name: prize.name,
            description: prize.description || undefined,
            quantity: prize.quantity,
            prizeValue: prize.prizeValue ? parseFloat(prize.prizeValue) : undefined,
            isConsolation: prize.isConsolation,
          });
        } else if (prize.id && !prize.deleted) {
          await updatePrizeMutation.mutateAsync({
            prizeId: prize.id,
            activityId,
            name: prize.name,
            description: prize.description || undefined,
            quantity: prize.quantity,
            prizeValue: prize.prizeValue ? parseFloat(prize.prizeValue) : undefined,
            isConsolation: prize.isConsolation,
          });
        }
      }
      setSuccess(true);
      setTimeout(() => navigate(`/lottery/manage/${activityId}` as any), 1200);
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

  const updatePrizeField = (idx: number, field: keyof PrizeRow, value: any) => {
    setPrizes(prev => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p));
  };

  const visiblePrizes = prizes.map((p, i) => ({ ...p, _idx: i })).filter(p => !p.deleted);

  const inputClass = "w-full rounded-xl px-4 py-3 text-sm border focus:outline-none focus:ring-2 focus:ring-red-200";
  const inputStyle = { backgroundColor: C.card, borderColor: C.border, color: C.text };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: C.bg }}>
        <div className="text-sm" style={{ color: C.sub }}>加载中...</div>
      </div>
    );
  }
  if (!activity) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: C.bg }}>
        <div className="text-sm" style={{ color: C.sub }}>活动不存在</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-32" style={{ backgroundColor: C.bg }}>
      {/* 顶部导航 */}
      <div className="sticky top-0 z-10 px-4 py-3 flex items-center gap-3" style={{ backgroundColor: C.red }}>
        <button onClick={() => window.history.back()} className="p-1 -ml-1">
          <ChevronLeft className="w-6 h-6 text-white" />
        </button>
        <h1 className="text-base font-semibold text-white flex-1">编辑活动</h1>
        <span className="text-xs text-white/70 px-2 py-0.5 rounded-full border border-white/30">
          {activity.status === 'draft' ? '草稿' : activity.status === 'open' ? '报名中' : activity.status === 'closed' ? '已关闭' : activity.status}
        </span>
      </div>

      <div className="px-4 pt-4 space-y-4 max-w-lg mx-auto">

        {/* 活动名称 */}
        <div className="bg-white rounded-2xl p-4" style={{ border: `1px solid ${C.border}` }}>
          <label className="flex items-center gap-2 text-sm font-semibold mb-3" style={{ color: C.text }}>
            <Type className="w-4 h-4" style={{ color: C.red }} />活动名称
          </label>
          <input className={inputClass} style={inputStyle}
            placeholder="例如：2026年度员工抽奖"
            value={title} onChange={e => setTitle(e.target.value)} maxLength={100} />
          <div className="text-right text-xs mt-1" style={{ color: C.sub }}>{title.length}/100</div>
        </div>

        {/* 活动描述 */}
        <div className="bg-white rounded-2xl p-4" style={{ border: `1px solid ${C.border}` }}>
          <label className="flex items-center gap-2 text-sm font-semibold mb-3" style={{ color: C.text }}>
            <AlignLeft className="w-4 h-4" style={{ color: C.red }} />活动描述
            <span className="font-normal text-xs" style={{ color: C.sub }}>（选填）</span>
          </label>
          <textarea className={inputClass} style={{ ...inputStyle, resize: 'none' }}
            placeholder="简单介绍活动内容、奖品或参与规则..." rows={3}
            value={description} onChange={e => setDescription(e.target.value)} maxLength={500} />
          <div className="text-right text-xs mt-1" style={{ color: C.sub }}>{description.length}/500</div>
        </div>

        {/* 开奖模式 */}
        <div className="bg-white rounded-2xl p-4" style={{ border: `1px solid ${C.border}` }}>
          <label className="flex items-center gap-2 text-sm font-semibold mb-3" style={{ color: C.text }}>
            <Zap className="w-4 h-4" style={{ color: C.red }} />开奖模式
          </label>
          <div className="grid grid-cols-3 gap-2">
            {([
              { value: 'instant', label: '即时开奖', icon: <Zap className="w-4 h-4" /> },
              { value: 'scheduled', label: '定时开奖', icon: <Timer className="w-4 h-4" /> },
              { value: 'milestone', label: '里程碑', icon: <Trophy className="w-4 h-4" /> },
            ] as const).map(opt => (
              <button key={opt.value} onClick={() => setMode(opt.value)}
                className="flex flex-col items-center gap-1 py-3 rounded-xl text-xs font-medium border-2 transition-colors"
                style={{
                  borderColor: mode === opt.value ? C.red : C.border,
                  backgroundColor: mode === opt.value ? C.redLight : C.card,
                  color: mode === opt.value ? C.red : C.sub,
                }}>
                {opt.icon}{opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* 开奖时间（定时模式） */}
        {mode === 'scheduled' && (
          <div className="bg-white rounded-2xl p-4" style={{ border: `1px solid ${C.border}` }}>
            <label className="flex items-center gap-2 text-sm font-semibold mb-3" style={{ color: C.text }}>
              <Clock className="w-4 h-4" style={{ color: C.red }} />开奖时间
            </label>
            <input type="datetime-local" className={inputClass} style={inputStyle}
              value={drawAt} onChange={e => setDrawAt(e.target.value)} />
          </div>
        )}

        {/* 报名截止时间 */}
        <div className="bg-white rounded-2xl p-4" style={{ border: `1px solid ${C.border}` }}>
          <label className="flex items-center gap-2 text-sm font-semibold mb-3" style={{ color: C.text }}>
            <Clock className="w-4 h-4" style={{ color: C.sub }} />报名截止时间
            <span className="font-normal text-xs" style={{ color: C.sub }}>（选填）</span>
          </label>
          <input type="datetime-local" className={inputClass} style={inputStyle}
            value={signupEndAt} onChange={e => setSignupEndAt(e.target.value)} />
          <p className="text-xs mt-1.5" style={{ color: C.sub }}>不填则报名一直开放至活动结束</p>
        </div>

        {/* 人数上限 */}
        <div className="bg-white rounded-2xl p-4" style={{ border: `1px solid ${C.border}` }}>
          <label className="flex items-center gap-2 text-sm font-semibold mb-3" style={{ color: C.text }}>
            <Users className="w-4 h-4" style={{ color: C.red }} />最大参与人数
            <span className="font-normal text-xs" style={{ color: C.sub }}>（选填）</span>
          </label>
          <input type="number" min={1} className={inputClass} style={inputStyle}
            placeholder="不填则不限制人数"
            value={maxParticipants} onChange={e => setMaxParticipants(e.target.value)} />
        </div>

        {/* 报名方式 */}
        <div className="bg-white rounded-2xl p-4" style={{ border: `1px solid ${C.border}` }}>
          <label className="flex items-center gap-2 text-sm font-semibold mb-3" style={{ color: C.text }}>
            <Users className="w-4 h-4" style={{ color: C.red }} />报名方式
          </label>
          <div className="space-y-2">
            {([
              { value: 'open', label: '公开报名', desc: '任何人均可报名参与' },
              { value: 'member_only', label: '仅限成员', desc: '只有账本成员可以报名' },
              { value: 'invite_only', label: '邀请制', desc: '仅限管理员邀请的人' },
            ] as const).map(opt => (
              <button key={opt.value} onClick={() => setRegistrationMode(opt.value)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-colors"
                style={{
                  borderColor: registrationMode === opt.value ? C.red : C.border,
                  backgroundColor: registrationMode === opt.value ? C.redLight : C.card,
                }}>
                <div className="w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                  style={{ borderColor: registrationMode === opt.value ? C.red : C.border }}>
                  {registrationMode === opt.value && (
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: C.red }} />
                  )}
                </div>
                <div>
                  <div className="text-sm font-medium" style={{ color: C.text }}>{opt.label}</div>
                  <div className="text-xs" style={{ color: C.sub }}>{opt.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* 其他设置 */}
        <div className="bg-white rounded-2xl p-4" style={{ border: `1px solid ${C.border}` }}>
          <label className="text-sm font-semibold mb-3 block" style={{ color: C.text }}>其他设置</label>
          <div className="space-y-3">
            {[
              { label: '公开活动', desc: '所有人可见（关闭则仅成员可见）', val: isPublic, set: setIsPublic },
              { label: '收集报名信息', desc: '报名时要求填写姓名/联系方式', val: requiresInfo, set: setRequiresInfo },
            ].map(item => (
              <div key={item.label} className="flex items-center justify-between">
                <div>
                  <div className="text-sm" style={{ color: C.text }}>{item.label}</div>
                  <div className="text-xs" style={{ color: C.sub }}>{item.desc}</div>
                </div>
                <button onClick={() => item.set((v: boolean) => !v)}
                  className="w-12 h-6 rounded-full transition-colors relative flex-shrink-0"
                  style={{ backgroundColor: item.val ? C.red : C.border }}>
                  <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${item.val ? 'translate-x-6' : 'translate-x-0.5'}`} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* 奖项管理 */}
        <div className="bg-white rounded-2xl p-4" style={{ border: `1px solid ${C.border}` }}>
          <div className="flex items-center justify-between mb-3">
            <label className="flex items-center gap-2 text-sm font-semibold" style={{ color: C.text }}>
              <Gift className="w-4 h-4" style={{ color: C.red }} />奖项设置
              <span className="text-xs font-normal px-2 py-0.5 rounded-full" style={{ backgroundColor: C.redLight, color: C.red }}>
                {visiblePrizes.length} 个
              </span>
            </label>
            <button onClick={addPrize}
              className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-full font-medium"
              style={{ backgroundColor: C.redLight, color: C.red }}>
              <Plus className="w-3.5 h-3.5" />添加奖项
            </button>
          </div>
          {visiblePrizes.length === 0 ? (
            <div className="text-center py-6" style={{ color: C.sub }}>
              <Gift className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">还没有奖项，点击「添加奖项」</p>
            </div>
          ) : (
            <div className="space-y-3">
              {visiblePrizes.map((prize, visIdx) => {
                const idx = prize._idx;
                const isEditing = editingPrizeIdx === idx;
                return (
                  <div key={idx} className="rounded-xl border" style={{ borderColor: isEditing ? C.red : C.border }}>
                    {isEditing ? (
                      <div className="p-3 space-y-2">
                        <input
                          className="w-full rounded-lg px-3 py-2 text-sm border focus:outline-none"
                          style={{ borderColor: C.red, color: C.text }}
                          placeholder="奖项名称（必填）"
                          value={prize.name}
                          onChange={e => updatePrizeField(idx, 'name', e.target.value)}
                          autoFocus
                        />
                        <input
                          className="w-full rounded-lg px-3 py-2 text-sm border focus:outline-none"
                          style={{ borderColor: C.border, color: C.text }}
                          placeholder="奖项描述（选填）"
                          value={prize.description}
                          onChange={e => updatePrizeField(idx, 'description', e.target.value)}
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <div className="text-xs mb-1" style={{ color: C.sub }}>数量</div>
                            <input type="number" min={1}
                              className="w-full rounded-lg px-3 py-2 text-sm border focus:outline-none"
                              style={{ borderColor: C.border, color: C.text }}
                              value={prize.quantity}
                              onChange={e => updatePrizeField(idx, 'quantity', parseInt(e.target.value) || 1)} />
                          </div>
                          <div>
                            <div className="text-xs mb-1" style={{ color: C.sub }}>价值（元，选填）</div>
                            <input type="number" min={0} step={0.01}
                              className="w-full rounded-lg px-3 py-2 text-sm border focus:outline-none"
                              style={{ borderColor: C.border, color: C.text }}
                              placeholder="0.00"
                              value={prize.prizeValue}
                              onChange={e => updatePrizeField(idx, 'prizeValue', e.target.value)} />
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => updatePrizeField(idx, 'isConsolation', !prize.isConsolation)}
                            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border"
                            style={{
                              borderColor: prize.isConsolation ? C.red : C.border,
                              backgroundColor: prize.isConsolation ? C.redLight : 'transparent',
                              color: prize.isConsolation ? C.red : C.sub,
                            }}>
                            <Trophy className="w-3 h-3" />安慰奖
                          </button>
                          <div className="flex-1" />
                          <button onClick={() => setEditingPrizeIdx(null)}
                            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-full"
                            style={{ backgroundColor: C.redLight, color: C.red }}>
                            <Check className="w-3.5 h-3.5" />完成
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 px-3 py-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                          style={{ backgroundColor: C.redLight, color: C.red }}>
                          {visIdx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate" style={{ color: C.text }}>
                            {prize.name || <span style={{ color: C.sub }}>（未填写名称）</span>}
                          </div>
                          <div className="text-xs" style={{ color: C.sub }}>
                            数量 {prize.quantity}
                            {prize.prizeValue ? ` · ¥${prize.prizeValue}` : ''}
                            {prize.isConsolation ? ' · 安慰奖' : ''}
                          </div>
                        </div>
                        <button onClick={() => setEditingPrizeIdx(idx)} className="p-1.5 rounded-lg" style={{ color: C.sub }}>
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button onClick={() => removePrize(idx)} className="p-1.5 rounded-lg" style={{ color: C.red }}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-xl px-4 py-3 text-sm" style={{ backgroundColor: C.redLight, color: C.red }}>
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-xl px-4 py-3 text-sm font-medium" style={{ backgroundColor: '#E8F5E9', color: '#2E7D32' }}>
            保存成功！正在跳转...
          </div>
        )}
      </div>

      {/* 底部保存按钮 */}
      <div
        className="fixed bottom-0 left-0 right-0 px-4 pb-8 pt-3 z-20"
        style={{ background: 'linear-gradient(to top, rgba(250,243,237,1) 70%, rgba(250,243,237,0) 100%)' }}
      >
        <div className="max-w-lg mx-auto">
          <button
            onClick={handleSave}
            disabled={submitting || success}
            className="w-full py-4 rounded-full text-white font-bold text-base flex items-center justify-center gap-2 transition-opacity disabled:opacity-50"
            style={{
              background: `linear-gradient(135deg, ${C.red}, ${C.redDark})`,
              boxShadow: `0 4px 16px ${C.red}55`,
            }}
          >
            <Save className="w-5 h-5" />
            {submitting ? '保存中...' : success ? '已保存' : '保存修改'}
          </button>
        </div>
      </div>
    </div>
  );
}
