/**
 * 抽奖活动编辑页
 * 路由：/lottery/edit/:activityId
 * 功能：修改活动标题、描述、开奖时间、人数上限、报名截止时间
 */
import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { ChevronLeft, Save, Clock, Users, AlignLeft, Type } from "lucide-react";

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

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [drawAt, setDrawAt] = useState("");
  const [signupEndAt, setSignupEndAt] = useState("");
  const [maxParticipants, setMaxParticipants] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // 预填数据
  useEffect(() => {
    if (!activity) return;
    setTitle(activity.title ?? "");
    setDescription(activity.description ?? "");
    if (activity.draw_at) {
      // 转为 datetime-local 格式
      const d = new Date(activity.draw_at);
      const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
        .toISOString().slice(0, 16);
      setDrawAt(local);
    }
    if (activity.signup_end_at) {
      const d = new Date(activity.signup_end_at);
      const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
        .toISOString().slice(0, 16);
      setSignupEndAt(local);
    }
    setMaxParticipants(activity.max_participants ? String(activity.max_participants) : "");
  }, [activity]);

  const handleSave = async () => {
    if (!title.trim()) { setError("请填写活动名称"); return; }
    setSubmitting(true);
    setError("");
    try {
      await updateMutation.mutateAsync({
        activityId,
        title: title.trim(),
        description: description.trim() || undefined,
        drawAt: drawAt || undefined,
        signupEndAt: signupEndAt || undefined,
        maxParticipants: maxParticipants ? parseInt(maxParticipants) : null,
      });
      setSuccess(true);
      setTimeout(() => navigate(`/lottery/${activityId}`), 1200);
    } catch (e: any) {
      setError(e.message || "保存失败，请重试");
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass = "w-full rounded-xl px-4 py-3 text-sm border focus:outline-none";
  const inputStyle = { backgroundColor: C.card, borderColor: C.border, color: C.text };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: C.bg }}>
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-2 border-gray-200 rounded-full animate-spin" style={{ borderTopColor: C.red }} />
          <div className="text-sm mt-3" style={{ color: C.sub }}>加载中...</div>
        </div>
      </div>
    );
  }

  if (!activity) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: C.bg }}>
        <div className="text-center">
          <div className="text-4xl mb-3">&#128683;</div>
          <div className="font-semibold" style={{ color: C.text }}>活动不存在</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-32" style={{ backgroundColor: C.bg }}>
      {/* 顶部导航 */}
      <div className="bg-white border-b sticky top-0 z-10" style={{ borderColor: C.border }}>
        <div className="flex items-center h-14 px-4 gap-3">
          <button
            onClick={() => window.history.back()}
            className="p-2 -ml-2"
          >
            <ChevronLeft className="w-6 h-6" style={{ color: C.text }} />
          </button>
          <h1 className="flex-1 text-base font-semibold" style={{ color: C.text }}>编辑活动</h1>
          <span
            className="text-xs px-2.5 py-1 rounded-full font-medium"
            style={{ backgroundColor: C.redLight, color: C.red }}
          >
            {activity.status === 'draft' ? '草稿' : activity.status === 'open' ? '报名中' : activity.status}
          </span>
        </div>
      </div>

      <div className="px-4 py-5 max-w-lg mx-auto space-y-4">

        {/* 活动名称 */}
        <div className="bg-white rounded-2xl p-4" style={{ border: `1px solid ${C.border}` }}>
          <label className="flex items-center gap-2 text-sm font-semibold mb-3" style={{ color: C.text }}>
            <Type className="w-4 h-4" style={{ color: C.red }} />
            活动名称
          </label>
          <input
            className={inputClass}
            style={inputStyle}
            placeholder="例如：2026年度员工抽奖"
            value={title}
            onChange={e => setTitle(e.target.value)}
            maxLength={100}
          />
          <div className="text-right text-xs mt-1" style={{ color: C.sub }}>{title.length}/100</div>
        </div>

        {/* 活动描述 */}
        <div className="bg-white rounded-2xl p-4" style={{ border: `1px solid ${C.border}` }}>
          <label className="flex items-center gap-2 text-sm font-semibold mb-3" style={{ color: C.text }}>
            <AlignLeft className="w-4 h-4" style={{ color: C.red }} />
            活动描述
            <span className="font-normal text-xs" style={{ color: C.sub }}>（选填）</span>
          </label>
          <textarea
            className={inputClass}
            style={{ ...inputStyle, resize: 'none' }}
            placeholder="简单介绍活动内容、奖品或参与规则..."
            rows={3}
            value={description}
            onChange={e => setDescription(e.target.value)}
            maxLength={500}
          />
          <div className="text-right text-xs mt-1" style={{ color: C.sub }}>{description.length}/500</div>
        </div>

        {/* 开奖时间（仅定时模式显示） */}
        {activity.mode === 'scheduled' && (
          <div className="bg-white rounded-2xl p-4" style={{ border: `1px solid ${C.border}` }}>
            <label className="flex items-center gap-2 text-sm font-semibold mb-3" style={{ color: C.text }}>
              <Clock className="w-4 h-4" style={{ color: C.red }} />
              开奖时间
              <span className="font-normal text-xs" style={{ color: C.sub }}>（选填）</span>
            </label>
            <input
              type="datetime-local"
              className={inputClass}
              style={inputStyle}
              value={drawAt}
              onChange={e => setDrawAt(e.target.value)}
            />
          </div>
        )}

        {/* 报名截止时间 */}
        <div className="bg-white rounded-2xl p-4" style={{ border: `1px solid ${C.border}` }}>
          <label className="flex items-center gap-2 text-sm font-semibold mb-3" style={{ color: C.text }}>
            <Clock className="w-4 h-4" style={{ color: C.sub }} />
            报名截止时间
            <span className="font-normal text-xs" style={{ color: C.sub }}>（选填）</span>
          </label>
          <input
            type="datetime-local"
            className={inputClass}
            style={inputStyle}
            value={signupEndAt}
            onChange={e => setSignupEndAt(e.target.value)}
          />
          <p className="text-xs mt-1.5" style={{ color: C.sub }}>不填则报名一直开放至活动结束</p>
        </div>

        {/* 人数上限 */}
        <div className="bg-white rounded-2xl p-4" style={{ border: `1px solid ${C.border}` }}>
          <label className="flex items-center gap-2 text-sm font-semibold mb-3" style={{ color: C.text }}>
            <Users className="w-4 h-4" style={{ color: C.red }} />
            最大参与人数
            <span className="font-normal text-xs" style={{ color: C.sub }}>（选填）</span>
          </label>
          <input
            type="number"
            min={1}
            className={inputClass}
            style={inputStyle}
            placeholder="不填则不限制人数"
            value={maxParticipants}
            onChange={e => setMaxParticipants(e.target.value)}
          />
        </div>

        {/* 错误提示 */}
        {error && (
          <div
            className="rounded-xl px-4 py-3 text-sm"
            style={{ backgroundColor: C.redLight, color: C.red }}
          >
            {error}
          </div>
        )}

        {/* 成功提示 */}
        {success && (
          <div
            className="rounded-xl px-4 py-3 text-sm font-medium"
            style={{ backgroundColor: '#E8F5E9', color: '#2E7D32' }}
          >
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
