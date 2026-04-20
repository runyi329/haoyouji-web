import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import Lottie from "lottie-react";
import aiTagAnimData from "@/assets/aitag-blue.json";
import { X, Mail, Phone, Loader2, AlertTriangle, CheckCircle2, Info, ExternalLink, Wallet, CreditCard, Copy } from "lucide-react";
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

// 角色标签
const ROLE_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  funder: { label: '资方', color: '#1A56DB', bg: '#EFF6FF' },
  borrower: { label: '借款方', color: '#059669', bg: '#ECFDF5' },
  broker: { label: '中间人', color: '#7C3AED', bg: '#F5F3FF' },
};

// 钱包类型标签
const WALLET_TYPE_LABELS: Record<string, string> = {
  blockchain: '链上钱包',
  alipay: '支付宝',
  wechat: '微信',
  other: '其他',
};

// 复制到剪贴板
function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).then(() => {
    toast.success('已复制');
  }).catch(() => {
    toast.error('复制失败');
  });
}

// 脱敏显示卡号（保留前4后4）
function maskCardNumber(num: string): string {
  if (!num) return '';
  if (num.length <= 8) return num;
  return num.slice(0, 4) + ' **** **** ' + num.slice(-4);
}

// 脱敏显示账号（保留前3后3）
function maskAccount(acc: string): string {
  if (!acc) return '';
  if (acc.length <= 6) return acc;
  return acc.slice(0, 3) + '****' + acc.slice(-3);
}

export function FunderAIPanel({ orderId, ledgerId, orderInfo, onClose }: FunderAIPanelProps) {
  const [activeTab, setActiveTab] = useState<'analysis' | 'notify' | 'wallet'>('analysis');
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

  // AI 智能钱包：获取参与者收款方式
  const { data: paymentInfo, isLoading: paymentLoading } = trpc.ledger.funderGetParticipantsPaymentInfo.useQuery(
    { orderId, ledgerId },
    { enabled: activeTab === 'wallet', refetchOnWindowFocus: false }
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
    // 将 selectedLevel 转换为具体的百分比数字
    const levelPctMap: Record<string, number> = { pct10: 10, pct20: 20, pct30: 30 };
    const gapPct = levelPctMap[selectedLevel] ?? 20;
    sendTestNotification.mutate({
      orderId,
      ledgerId,
      channel,
      coin: orderInfo.coin,
      buyValue: orderInfo.buyValue ?? 50000,
      gapPct,
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
  // 是否有担保物
  const hasCollateral = collateralValue !== null;
  const exposure = collateralValue !== null && floatPnl !== null
    ? collateralValue + floatPnl - accrued + paidInterest
    : collateralValue !== null
      ? collateralValue - accrued + paidInterest
      : null;
  const exposurePct = exposure !== null && buyValue && buyValue > 0
    ? Math.abs(exposure) / buyValue * 100
    : null;

  const getRiskLevel = () => {
    if (exposure === null) {
      // 无担保物时，根据待结利息和买入价值判断
      if (accrued > 0) return 'no_collateral';
      return 'no_collateral';
    }
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
        className="w-full max-w-md rounded-t-3xl overflow-hidden flex flex-col"
        style={{ background: '#fff', maxHeight: '85vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* 顶部拖拽条 */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full" style={{ background: '#E5E7EB' }} />
        </div>

        {/* 标题栏 */}
        <div className="flex items-center justify-between px-5 py-3 flex-shrink-0">
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
        <div className="mx-5 mb-4 p-1 rounded-xl flex flex-shrink-0" style={{ background: '#F3F4F6' }}>
          {[
            { key: 'analysis', label: 'AI 智能分析' },
            { key: 'notify', label: 'AI 智能通知' },
            { key: 'wallet', label: 'AI 智能钱包' },
          ].map(tab => (
            <button
              key={tab.key}
              className="flex-1 py-2 text-xs font-medium transition-all rounded-[10px]"
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
        <div className="px-5 pb-8 overflow-y-auto flex-1">
          {/* ── AI 智能分析 ── */}
          {activeTab === 'analysis' && (
            <div className="space-y-3">
              {/* 风险状态卡片 */}
              <div className="rounded-2xl p-4" style={{
                background: riskLevel === 'safe' ? '#F0FDF4' :
                  riskLevel === 'pct30' ? '#FFF1F1' :
                    riskLevel === 'pct20' ? '#FFF7ED' :
                      riskLevel === 'pct10' ? '#FFFBEB' :
                        riskLevel === 'negative' ? '#FFF7ED' :
                          '#F9FAFB',
                border: `1px solid ${riskLevel === 'safe' ? '#BBF7D0' :
                  riskLevel === 'pct30' ? '#FECACA' :
                    riskLevel === 'pct20' ? '#FED7AA' :
                      riskLevel === 'pct10' ? '#FDE68A' :
                        riskLevel === 'negative' ? '#FED7AA' :
                          '#E5E7EB'}`,
              }}>
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-0.5">
                    {riskLevel === 'safe' ? (
                      <CheckCircle2 className="w-5 h-5" style={{ color: '#059669' }} />
                    ) : riskLevel === 'no_collateral' ? (
                      <Info className="w-5 h-5" style={{ color: '#6B7280' }} />
                    ) : (
                      <AlertTriangle className="w-5 h-5" style={{
                        color: riskLevel === 'pct30' ? '#EF4444' :
                          riskLevel === 'pct20' ? '#F97316' : '#F59E0B'
                      }} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold mb-1" style={{
                      color: riskLevel === 'safe' ? '#065F46' :
                        riskLevel === 'pct30' ? '#991B1B' :
                          riskLevel === 'pct20' ? '#9A3412' :
                            riskLevel === 'pct10' ? '#92400E' :
                              riskLevel === 'negative' ? '#9A3412' :
                                '#374151'
                    }}>
                      {riskLevel === 'safe' ? '担保充足，风险可控' :
                        riskLevel === 'pct30' ? '⚠️ 担保严重不足' :
                          riskLevel === 'pct20' ? '担保缺口较大' :
                            riskLevel === 'pct10' ? '担保缺口预警' :
                              riskLevel === 'negative' ? '担保轻微不足' :
                                '暂无担保物'}
                    </div>
                    <div className="text-xs leading-relaxed" style={{
                      color: riskLevel === 'safe' ? '#065F46' :
                        riskLevel === 'pct30' ? '#7F1D1D' :
                          riskLevel === 'pct20' ? '#7C2D12' :
                            riskLevel === 'pct10' ? '#78350F' :
                              '#6B7280'
                    }}>
                      {riskLevel === 'safe' ? (
                        `担保净值 ${exposure !== null ? `+${exposure.toFixed(2)} U` : '—'}，覆盖待结利息后仍有盈余`
                      ) : riskLevel === 'no_collateral' ? (
                        `当前订单无担保物，待结利息 ${accrued.toFixed(2)} U`
                      ) : (
                        `担保缺口约 ${exposure !== null ? Math.abs(exposure).toFixed(2) : '—'} U，占买入价值 ${exposurePct !== null ? exposurePct.toFixed(1) : '—'}%`
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* 数据摘要 */}
              <div className="rounded-2xl p-4 space-y-2.5" style={{ background: '#F9FAFB', border: '1px solid #E5E7EB' }}>
                <div className="text-xs font-semibold mb-1" style={{ color: '#374151' }}>订单数据摘要</div>
                {[
                  { label: '持有数量', value: `${orderInfo.qty} ${orderInfo.coin}` },
                  { label: '买入价值', value: buyValue ? `${buyValue.toFixed(2)} U` : '—' },
                  { label: '待结利息', value: `${accrued.toFixed(2)} U` },
                  { label: '已结利息', value: `${paidInterest.toFixed(2)} U` },
                  { label: '担保市值', value: collateralValue !== null ? `${collateralValue.toFixed(2)} U` : '无' },
                  { label: '浮动盈亏', value: floatPnl !== null ? `${floatPnl >= 0 ? '+' : ''}${floatPnl.toFixed(2)} U` : '—' },
                ].map(item => (
                  <div key={item.label} className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: '#9CA3AF' }}>{item.label}</span>
                    <span className="text-xs font-medium" style={{ color: '#374151' }}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── AI 智能通知 ── */}
          {activeTab === 'notify' && (
            <div className="space-y-3">
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

          {/* ── AI 智能钱包 ── */}
          {activeTab === 'wallet' && (
            <div className="space-y-4">
              {paymentLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#1A56DB' }} />
                </div>
              ) : !paymentInfo?.participants || paymentInfo.participants.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 space-y-2">
                  <Wallet className="w-10 h-10" style={{ color: '#D1D5DB' }} />
                  <div className="text-sm font-medium" style={{ color: '#9CA3AF' }}>暂无参与者收款信息</div>
                  <div className="text-xs text-center" style={{ color: '#D1D5DB' }}>请先在订单中配置参与方，参与方在个人中心添加收款方式后即可在此查看</div>
                </div>
              ) : (
                paymentInfo.participants.map((participant: any) => {
                  const roleInfo = ROLE_LABELS[participant.participantRole] || { label: participant.participantRole, color: '#6B7280', bg: '#F3F4F6' };
                  const hasAnyPayment = (participant.bankCards?.length > 0) || (participant.digitalWallets?.length > 0);
                  return (
                    <div key={participant.userId} className="rounded-2xl overflow-hidden" style={{ border: '1px solid #E5E7EB' }}>
                      {/* 参与者头部 */}
                      <div className="flex items-center gap-3 px-4 py-3" style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                        {participant.avatar ? (
                          <img src={participant.avatar} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold"
                            style={{ background: roleInfo.bg, color: roleInfo.color }}>
                            {participant.userName.slice(0, 1)}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold truncate" style={{ color: '#1A2340' }}>{participant.userName}</div>
                        </div>
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0"
                          style={{ background: roleInfo.bg, color: roleInfo.color }}>
                          {roleInfo.label}
                        </span>
                      </div>

                      {/* 收款方式列表 */}
                      <div className="px-4 py-3 space-y-3">
                        {!hasAnyPayment ? (
                          <div className="text-xs text-center py-3" style={{ color: '#9CA3AF' }}>该用户暂未添加收款方式</div>
                        ) : (
                          <>
                            {/* 银行卡 */}
                            {participant.bankCards?.map((card: any) => (
                              <div key={card.id} className="rounded-xl p-3 space-y-1.5" style={{ background: '#F0F4FF', border: '1px solid #DBEAFE' }}>
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-1.5">
                                    <CreditCard className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#1A56DB' }} />
                                    <span className="text-xs font-semibold" style={{ color: '#1A56DB' }}>
                                      {card.bankName} · {card.cardType === 'credit' ? '信用卡' : '储蓄卡'}
                                    </span>
                                  </div>
                                  {card.isDefault && (
                                    <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: '#DBEAFE', color: '#1A56DB' }}>默认</span>
                                  )}
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-mono" style={{ color: '#374151' }}>{maskCardNumber(card.cardNumber)}</span>
                                  <button onClick={() => copyToClipboard(card.cardNumber)} className="p-1 rounded">
                                    <Copy className="w-3 h-3" style={{ color: '#9CA3AF' }} />
                                  </button>
                                </div>
                                {card.cardHolder && (
                                  <div className="text-xs" style={{ color: '#6B7280' }}>持卡人：{card.cardHolder}</div>
                                )}
                                {card.notes && (
                                  <div className="text-xs" style={{ color: '#9CA3AF' }}>{card.notes}</div>
                                )}
                              </div>
                            ))}

                            {/* 数字钱包 */}
                            {participant.digitalWallets?.map((wallet: any) => (
                              <div key={wallet.id} className="rounded-xl p-3 space-y-1.5" style={{ background: '#F0FDF4', border: '1px solid #BBF7D0' }}>
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-1.5">
                                    <Wallet className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#059669' }} />
                                    <span className="text-xs font-semibold" style={{ color: '#059669' }}>
                                      {WALLET_TYPE_LABELS[wallet.walletType] || wallet.walletType}
                                      {wallet.network && ` · ${wallet.network}`}
                                      {wallet.currency && ` · ${wallet.currency}`}
                                    </span>
                                  </div>
                                  {wallet.isDefault && (
                                    <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: '#D1FAE5', color: '#059669' }}>默认</span>
                                  )}
                                </div>
                                {wallet.walletAddress && (
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-xs font-mono truncate" style={{ color: '#374151' }}>
                                      {wallet.walletAddress.length > 20
                                        ? wallet.walletAddress.slice(0, 10) + '...' + wallet.walletAddress.slice(-8)
                                        : wallet.walletAddress}
                                    </span>
                                    <button onClick={() => copyToClipboard(wallet.walletAddress)} className="p-1 rounded flex-shrink-0">
                                      <Copy className="w-3 h-3" style={{ color: '#9CA3AF' }} />
                                    </button>
                                  </div>
                                )}
                                {wallet.account && (
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-xs" style={{ color: '#374151' }}>账号：{maskAccount(wallet.account)}</span>
                                    <button onClick={() => copyToClipboard(wallet.account)} className="p-1 rounded flex-shrink-0">
                                      <Copy className="w-3 h-3" style={{ color: '#9CA3AF' }} />
                                    </button>
                                  </div>
                                )}
                                {wallet.accountName && (
                                  <div className="text-xs" style={{ color: '#6B7280' }}>收款人：{wallet.accountName}</div>
                                )}
                                {wallet.notes && (
                                  <div className="text-xs" style={{ color: '#9CA3AF' }}>{wallet.notes}</div>
                                )}
                              </div>
                            ))}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}

              {/* 说明 */}
              {paymentInfo?.participants && paymentInfo.participants.length > 0 && (
                <div className="rounded-xl px-3 py-2.5" style={{ background: '#F9FAFB', border: '1px solid #E5E7EB' }}>
                  <p className="text-xs leading-relaxed" style={{ color: '#9CA3AF' }}>
                    收款信息来自各参与者的个人中心，仅供参考。请在转账前与对方确认最新收款方式。
                  </p>
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
