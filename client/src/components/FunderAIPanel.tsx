import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import Lottie from "lottie-react";
import aiTagAnimData from "@/assets/aitag-blue.json";
import { X, Mail, Phone, Loader2, AlertTriangle, CheckCircle2, Info, ExternalLink } from "lucide-react";
import { centerToast as toast } from "@/components/ui/center-toast";
import { useLocation } from "wouter";

interface FunderAIPanelProps {
  orderId: number;
  ledgerId: number;
  orderInfo: {
    coin: string;
    qty: number;
    buyValue: number | null;
    accrued: number;
    paidInterest: number;
    collateralValue: number | null;
    floatPnl: number | null;
  };
  onClose: () => void;
}

type AlertLevel = 'none' | 'pct10' | 'pct20' | 'pct30';

// 预警级别配置：轻松语气，突出百分比
const ALERT_OPTIONS: {
  level: AlertLevel;
  pct: string;       // 大字显示的百分比
  label: string;     // 小字标题
  desc: string;      // 说明文字
  accent: string;    // 强调色
  bg: string;        // 背景色
  border: string;    // 边框色
}[] = [
  {
    level: 'none',
    pct: '—',
    label: '关闭提醒',
    desc: '暂不接收任何通知',
    accent: '#9CA3AF',
    bg: '#F9FAFB',
    border: '#E5E7EB',
  },
  {
    level: 'pct10',
    pct: '10%',
    label: '缺口提醒',
    desc: '担保缺口超过买入价值时',
    accent: '#F59E0B',
    bg: '#FFFBEB',
    border: '#FDE68A',
  },
  {
    level: 'pct20',
    pct: '20%',
    label: '缺口提醒',
    desc: '担保缺口超过买入价值时',
    accent: '#F97316',
    bg: '#FFF7ED',
    border: '#FED7AA',
  },
  {
    level: 'pct30',
    pct: '30%',
    label: '缺口提醒',
    desc: '担保缺口超过买入价值时',
    accent: '#EF4444',
    bg: '#FFF1F1',
    border: '#FECACA',
  },
];

// 简单 Toggle 开关组件
function Toggle({ enabled, onChange, disabled }: { enabled: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => !disabled && onChange(!enabled)}
      className="relative inline-flex flex-shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none"
      style={{
        width: 40,
        height: 22,
        background: enabled ? '#1A56DB' : '#D1D5DB',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <span
        className="inline-block rounded-full bg-white shadow transition-transform duration-200 ease-in-out"
        style={{
          width: 18,
          height: 18,
          marginTop: 2,
          transform: enabled ? 'translateX(20px)' : 'translateX(2px)',
        }}
      />
    </button>
  );
}

export function FunderAIPanel({ orderId, ledgerId, orderInfo, onClose }: FunderAIPanelProps) {
  const [activeTab, setActiveTab] = useState<'analysis' | 'notify'>('analysis');
  const [selectedLevel, setSelectedLevel] = useState<AlertLevel>('none');
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [phoneEnabled, setPhoneEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testConfirm, setTestConfirm] = useState<'email' | 'sms' | null>(null);
  const [testSending, setTestSending] = useState(false);
  const [, setLocation] = useLocation();

  const { data: alertState, isLoading: alertLoading, refetch } = trpc.ledger.funderGetAlertState.useQuery(
    { orderId, ledgerId },
    { refetchOnWindowFocus: false }
  );

  const sendTestNotification = trpc.ledger.funderSendTestNotification.useMutation({
    onSuccess: (data) => {
      setTestSending(false);
      setTestConfirm(null);
      const channelLabel = data.channel === 'email' ? `邮件已发送至 ${data.to}` : `短信已发送至 ${data.to}`;
      toast.success(`测试通知已发送！${channelLabel}`);
    },
    onError: (e) => {
      setTestSending(false);
      toast.error('发送失败：' + e.message);
    },
  });

  const handleSendTest = (channel: 'email' | 'sms') => {
    setTestConfirm(null); // 先关闭弹窗
    setTestSending(true);
    sendTestNotification.mutate({
      orderId,
      ledgerId,
      channel,
      coin: orderInfo.coin,
      buyValue: orderInfo.buyValue ?? 50000,
    });
  };

  const setAlertLevel = trpc.ledger.funderSetAlertLevel.useMutation({
    onSuccess: () => {
      refetch();
      setSaving(false);
    },
    onError: (e) => {
      toast.error('保存失败：' + e.message);
      setSaving(false);
    },
  });

  useEffect(() => {
    if (alertState) {
      // 兼容旧値映射
      const lvl = alertState.alertLevel as string;
      if (lvl === 'negative') setSelectedLevel('pct10');
      else if (lvl === 'pct5') setSelectedLevel('pct10');
      else if (['none', 'pct10', 'pct20', 'pct30'].includes(lvl)) setSelectedLevel(lvl as AlertLevel);
      else setSelectedLevel('none');
      // 恢复开关状态
      if (alertState.emailEnabled !== undefined) setEmailEnabled(alertState.emailEnabled);
      if (alertState.phoneEnabled !== undefined) setPhoneEnabled(alertState.phoneEnabled);
    }
  }, [alertState]);

  const hasAnyChannel = (emailEnabled && !!alertState?.userEmail) || (phoneEnabled && !!alertState?.userPhone);

  const handleSaveAlert = async (level: AlertLevel, emailEn?: boolean, phoneEn?: boolean) => {
    const eEnabled = emailEn !== undefined ? emailEn : emailEnabled;
    const pEnabled = phoneEn !== undefined ? phoneEn : phoneEnabled;
    const anyChannel = (eEnabled && !!alertState?.userEmail) || (pEnabled && !!alertState?.userPhone);
    if (level !== 'none' && !anyChannel) {
      toast.error('请先开启至少一个接收渠道（邮箱或手机）');
      return;
    }
    setSelectedLevel(level);
    setSaving(true);
    setAlertLevel.mutate({ orderId, ledgerId, alertLevel: level, emailEnabled: eEnabled, phoneEnabled: pEnabled });
  };

  const handleToggleEmail = (v: boolean) => {
    setEmailEnabled(v);
    // 如果当前已有选中的级别，同步保存开关状态
    if (selectedLevel !== 'none') {
      handleSaveAlert(selectedLevel, v, phoneEnabled);
    } else {
      setAlertLevel.mutate({ orderId, ledgerId, alertLevel: 'none', emailEnabled: v, phoneEnabled });
    }
  };

  const handleTogglePhone = (v: boolean) => {
    setPhoneEnabled(v);
    if (selectedLevel !== 'none') {
      handleSaveAlert(selectedLevel, emailEnabled, v);
    } else {
      setAlertLevel.mutate({ orderId, ledgerId, alertLevel: 'none', emailEnabled, phoneEnabled: v });
    }
  };

  // 计算当前担保缺口状态
  const { collateralValue, floatPnl, accrued, paidInterest, buyValue } = orderInfo;
  const exposure = collateralValue !== null && floatPnl !== null
    ? collateralValue + floatPnl - accrued + paidInterest
    : collateralValue !== null
      ? collateralValue - accrued + paidInterest
      : null;
  const exposurePct = exposure !== null && buyValue && buyValue > 0
    ? Math.abs(exposure) / buyValue * 100
    : null;

  const getRiskLevel = () => {
    if (exposure === null) return null;
    if (exposure >= 0) return 'safe';
    if (exposurePct && exposurePct >= 30) return 'pct30';
    if (exposurePct && exposurePct >= 20) return 'pct20';
    if (exposurePct && exposurePct >= 10) return 'pct10';
    return 'negative';
  };
  const riskLevel = getRiskLevel();

  return (
    <>
    {/* 测试通知确认弹窗 */}
    {testConfirm && (
      <div
        className="fixed inset-0 z-[400] flex items-center justify-center px-6"
        style={{ background: 'rgba(0,0,0,0.5)' }}
        onClick={() => !testSending && setTestConfirm(null)}
      >
        <div
          className="w-full max-w-xs rounded-2xl p-6"
          style={{ background: '#fff' }}
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: '#EFF6FF' }}>
            </div>
            <div className="text-sm font-bold" style={{ color: '#1A2340' }}>发送测试通知</div>
          </div>
          <p className="text-xs leading-relaxed mb-4" style={{ color: '#4B5563' }}>
            将向您的{testConfirm === 'email' ? `邮箱（${alertState?.userEmail}）` : `手机（${alertState?.userPhone}）`}发送一条<strong>模拟数据</strong>的测试{testConfirm === 'email' ? '邮件' : '短信'}，用于验证通知功能是否正常。是否继续？
          </p>
          <div className="flex gap-2">
            <button
              className="flex-1 py-2 rounded-xl text-sm font-medium transition-colors"
              style={{ background: '#F3F4F6', color: '#6B7280' }}
              onClick={() => setTestConfirm(null)}
              disabled={testSending}
            >
              取消
            </button>
            <button
              className="flex-1 py-2 rounded-xl text-sm font-medium flex items-center justify-center gap-1 transition-colors"
              style={{ background: '#1A56DB', color: '#fff' }}
              onClick={() => handleSendTest(testConfirm)}
              disabled={testSending}
            >
              {testSending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {testSending ? '发送中...' : '确认发送'}
            </button>
          </div>
        </div>
      </div>
    )}
    <div
      className="fixed inset-0 z-[300] flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-3xl overflow-hidden"
        style={{ background: '#fff', maxHeight: '85vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* 顶部拖拽条 */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ background: '#E5E7EB' }} />
        </div>

        {/* 标题栏 */}
        <div className="flex items-center justify-between px-5 py-3">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #1A56DB 0%, #3B82F6 100%)', boxShadow: '0 2px 8px rgba(26,86,219,0.35)' }}>
              <Lottie animationData={aiTagAnimData as any} loop autoplay style={{ width: 28, height: 28 }} />
            </div>
            <div>
              <div className="text-sm font-bold" style={{ color: '#1A2340' }}>AI 智能服务</div>
              <div className="text-xs" style={{ color: '#9CA3AF' }}>{orderInfo.coin} 订单</div>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: '#F3F4F6' }}>
            <X className="w-4 h-4" style={{ color: '#6B7280' }} />
          </button>
        </div>

        {/* Tab 切换 */}
        <div className="mx-5 mb-4 p-1 rounded-xl flex" style={{ background: '#F3F4F6' }}>
          {[
            { key: 'analysis', label: 'AI 智能分析' },
            { key: 'notify', label: 'AI 智能通知' },
          ].map(tab => (
            <button
              key={tab.key}
              className="flex-1 py-2 text-sm font-medium transition-all rounded-[10px]"
              style={{
                background: activeTab === tab.key ? '#fff' : 'transparent',
                color: activeTab === tab.key ? '#1A56DB' : '#6B7280',
                boxShadow: activeTab === tab.key ? '0 1px 4px rgba(0,0,0,0.10)' : 'none',
              }}
              onClick={() => setActiveTab(tab.key as any)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 内容区 */}
        <div className="px-5 pb-8 overflow-y-auto" style={{ maxHeight: '60vh' }}>

          {/* ── AI 智能分析 ── */}
          {activeTab === 'analysis' && (
            <div className="space-y-3">
              {/* 风险状态卡片 */}
              <div className="rounded-2xl p-4" style={{
                background: riskLevel === 'safe' ? '#F0FDF4' :
                  riskLevel === 'pct30' ? '#FFF1F1' :
                    riskLevel === 'pct20' ? '#FFF7ED' :
                      riskLevel === 'pct10' ? '#FFFBEB' :
                        riskLevel === 'negative' ? '#FFF7ED' : '#F9FAFB',
                border: `1px solid ${riskLevel === 'safe' ? '#BBF7D0' : riskLevel === 'pct30' ? '#FECACA' : riskLevel === 'pct20' ? '#FED7AA' : riskLevel === 'pct10' ? '#FDE68A' : riskLevel === 'negative' ? '#FED7AA' : '#E5E7EB'}`
              }}>
                <div className="flex items-center gap-2 mb-2">
                  {riskLevel === 'safe' && <CheckCircle2 className="w-4 h-4" style={{ color: '#16A34A' }} />}
                  {riskLevel !== 'safe' && riskLevel !== null && <AlertTriangle className="w-4 h-4" style={{ color: riskLevel === 'pct30' ? '#EF4444' : riskLevel === 'pct20' ? '#F97316' : '#F59E0B' }} />}
                  {riskLevel === null && <Info className="w-4 h-4" style={{ color: '#9CA3AF' }} />}
                  <span className="text-sm font-semibold" style={{
                    color: riskLevel === 'safe' ? '#15803D' : riskLevel === 'pct30' ? '#DC2626' : riskLevel === 'pct20' ? '#C2410C' : riskLevel === 'pct10' ? '#B45309' : riskLevel === 'negative' ? '#C2410C' : '#6B7280'
                  }}>
                    {riskLevel === 'safe' ? '担保充足' : riskLevel === 'pct30' ? '缺口较大' : riskLevel === 'pct20' ? '缺口偏大' : riskLevel === 'pct10' ? '缺口提示' : riskLevel === 'negative' ? '轻微缺口' : '暂无数据'}
                  </span>
                </div>
                {exposure !== null ? (
                  <div className="text-xs space-y-1" style={{ color: '#4B5563' }}>
                    <div className="flex justify-between">
                      <span>风险敞口</span>
                      <span className="font-semibold" style={{ color: exposure >= 0 ? '#16A34A' : '#DC2626' }}>
                        {exposure >= 0 ? '+' : ''}{exposure.toFixed(2)} U
                      </span>
                    </div>
                    {exposurePct !== null && exposure < 0 && (
                      <div className="flex justify-between">
                        <span>缺口占比</span>
                        <span className="font-semibold" style={{ color: '#DC2626' }}>{exposurePct.toFixed(1)}%</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span>待结利息</span>
                      <span>{accrued.toFixed(2)} U</span>
                    </div>
                    {collateralValue !== null && (
                      <div className="flex justify-between">
                        <span>担保物价值</span>
                        <span>{collateralValue.toFixed(2)} U</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-xs" style={{ color: '#9CA3AF' }}>暂无实时价格，无法计算风险敞口</div>
                )}
              </div>

              {/* AI 分析说明 */}
              <div className="rounded-2xl p-4" style={{ background: '#F0F4FF', border: '1px solid #DBEAFE' }}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg, #1A56DB 0%, #3B82F6 100%)' }}>
                    <span className="text-white text-[9px] font-bold">AI</span>
                  </div>
                  <span className="text-xs font-semibold" style={{ color: '#1A56DB' }}>AI 分析建议</span>
                </div>
                <p className="text-xs leading-relaxed" style={{ color: '#374151' }}>
                  {riskLevel === 'safe'
                    ? `当前担保充足，风险敞口为正值 ${exposure?.toFixed(2)} U，整体状况良好。建议持续关注 ${orderInfo.coin} 价格走势，若价格出现较大回调可提前与对方沟通。`
                    : riskLevel === 'pct30'
                      ? `担保缺口已达买入价值的 ${exposurePct?.toFixed(1)}%，建议尽快与对方沟通，协商补充担保物或安排付息，以保持良好的合作关系。`
                      : riskLevel === 'pct20'
                        ? `担保缺口达到 ${exposurePct?.toFixed(1)}%，建议关注 ${orderInfo.coin} 后续走势，并适时与对方保持沟通，必要时补充担保物。`
                        : riskLevel === 'pct10'
                          ? `担保缺口约 ${exposurePct?.toFixed(1)}%，目前处于轻微缺口区间，建议留意价格变化，与对方保持正常沟通即可。`
                          : riskLevel === 'negative'
                            ? `担保物略低于待结利息，建议与对方确认后续安排，保持良好的沟通节奏。`
                            : `当前无实时价格数据，无法进行风险评估。建议手动确认 ${orderInfo.coin} 当前价格并评估担保充足性。`
                  }
                </p>
              </div>
            </div>
          )}

          {/* ── AI 智能通知 ── */}
          {activeTab === 'notify' && (
            <div className="space-y-3">
              {/* 接收渠道 */}
              <div className="text-xs font-medium" style={{ color: '#6B7280' }}>接收渠道</div>

              {/* 邮箱行 */}
              <div className="rounded-2xl p-4 flex items-center gap-3" style={{ background: '#F9FAFB', border: '1px solid #E5E7EB' }}>
                <Mail className="w-5 h-5 flex-shrink-0" style={{ color: alertState?.userEmail ? '#1A56DB' : '#9CA3AF' }} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium" style={{ color: '#374151' }}>接收邮箱</div>
                  {alertLoading ? (
                    <div className="text-xs" style={{ color: '#9CA3AF' }}>加载中...</div>
                  ) : alertState?.userEmail ? (
                    <div className="text-xs truncate" style={{ color: '#6B7280' }}>{alertState.userEmail}</div>
                  ) : (
                    <button
                      className="flex items-center gap-1 text-xs font-medium mt-0.5"
                      style={{ color: '#1A56DB' }}
                      onClick={() => { onClose(); setLocation('/profile/edit'); }}
                    >
                      去绑定 <ExternalLink className="w-3 h-3" />
                    </button>
                  )}
                </div>
                {alertState?.userEmail && (
                  <button
                    className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg mr-1 transition-colors"
                    style={{ background: '#EFF6FF', color: '#1A56DB', border: '1px solid #DBEAFE' }}
                    onClick={() => setTestConfirm('email')}
                  >
                    测试
                  </button>
                )}
                <Toggle
                  enabled={emailEnabled && !!alertState?.userEmail}
                  onChange={handleToggleEmail}
                  disabled={!alertState?.userEmail}
                />
              </div>

              {/* 手机行 */}
              <div className="rounded-2xl p-4 flex items-center gap-3" style={{ background: '#F9FAFB', border: '1px solid #E5E7EB' }}>
                <Phone className="w-5 h-5 flex-shrink-0" style={{ color: alertState?.userPhone ? '#1A56DB' : '#9CA3AF' }} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium" style={{ color: '#374151' }}>接收手机</div>
                  {alertLoading ? (
                    <div className="text-xs" style={{ color: '#9CA3AF' }}>加载中...</div>
                  ) : alertState?.userPhone ? (
                    <div className="text-xs truncate" style={{ color: '#6B7280' }}>{alertState.userPhone}</div>
                  ) : (
                    <button
                      className="flex items-center gap-1 text-xs font-medium mt-0.5"
                      style={{ color: '#1A56DB' }}
                      onClick={() => { onClose(); setLocation('/profile/edit'); }}
                    >
                      去绑定 <ExternalLink className="w-3 h-3" />
                    </button>
                  )}
                </div>
                {alertState?.userPhone && (
                  <button
                    className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg mr-1 transition-colors"
                    style={{ background: '#EFF6FF', color: '#1A56DB', border: '1px solid #DBEAFE' }}
                    onClick={() => setTestConfirm('sms')}
                  >
                    测试
                  </button>
                )}
                <Toggle
                  enabled={phoneEnabled && !!alertState?.userPhone}
                  onChange={handleTogglePhone}
                  disabled={!alertState?.userPhone}
                />
              </div>

              {/* 预警级别 —— 一排 4 个紧凑按鈕 */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs font-medium" style={{ color: '#6B7280' }}>缺口提醒</span>
                {saving && <Loader2 className="w-3 h-3 animate-spin" style={{ color: '#9CA3AF' }} />}
              </div>
              <div className="flex gap-2">
                {ALERT_OPTIONS.map(opt => {
                  const isSelected = selectedLevel === opt.level;
                  const isDisabled = saving || (!hasAnyChannel && opt.level !== 'none');
                  return (
                    <button
                      key={opt.level}
                      className="flex-1 rounded-xl py-2 text-center transition-all"
                      style={{
                        background: isSelected ? opt.bg : '#F9FAFB',
                        border: isSelected ? `1.5px solid ${opt.accent}` : '1.5px solid #E5E7EB',
                        opacity: isDisabled ? 0.45 : 1,
                      }}
                      onClick={() => !isDisabled && handleSaveAlert(opt.level)}
                      disabled={isDisabled}
                    >
                      <span
                        className="text-sm font-semibold leading-none block"
                        style={{ color: isSelected ? opt.accent : '#6B7280' }}
                      >
                        {opt.pct}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* 规则说明 */}
              <div className="rounded-xl px-3 py-2.5" style={{ background: '#F0F4FF', border: '1px solid #DBEAFE' }}>
                <p className="text-xs leading-relaxed" style={{ color: '#4B5563' }}>
                  每个阈值只提醒一次，缺口在同一区间内波动不重复通知。缺口完全恢复或跌破更高阈值时，将再次发送提醒。
                </p>
              </div>

              {/* 上次触发记录 */}
              {alertState?.lastTriggeredAt && alertState.lastTriggeredState && alertState.lastTriggeredState !== 'none' && (
                <div className="rounded-xl p-3" style={{ background: '#FFFBEB', border: '1px solid #FDE68A' }}>
                  <div className="text-xs" style={{ color: '#92400E' }}>
                    上次提醒：缺口超过{alertState.lastTriggeredState === 'pct10' ? '10%' : alertState.lastTriggeredState === 'pct20' ? '20%' : '30%'}
                    &nbsp;·&nbsp;{alertState.lastTriggeredAt}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
    </>
  );
}
