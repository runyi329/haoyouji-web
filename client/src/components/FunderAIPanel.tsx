import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import Lottie from "lottie-react";
import aiTagAnimData from "@/assets/aitag-blue.json";
import { X, Mail, Phone, Loader2, AlertTriangle, CheckCircle2, Info, ExternalLink } from "lucide-react";
import { toast } from "sonner";
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

type AlertLevel = 'none' | 'negative' | 'pct5' | 'pct10';

const ALERT_OPTIONS: { level: AlertLevel; label: string; desc: string; color: string }[] = [
  { level: 'none', label: '关闭预警', desc: '不发送任何提醒', color: '#9CA3AF' },
  { level: 'negative', label: '担保缺口为负', desc: '担保物不足以覆盖待结利息时提醒', color: '#F59E0B' },
  { level: 'pct5', label: '缺口超过 5%', desc: '缺口超过买入价值 5% 时提醒', color: '#EF4444' },
  { level: 'pct10', label: '缺口超过 10%', desc: '缺口超过买入价值 10% 时提醒（高危）', color: '#DC2626' },
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
  const [, setLocation] = useLocation();

  const { data: alertState, isLoading: alertLoading, refetch } = trpc.ledger.funderGetAlertState.useQuery(
    { orderId, ledgerId },
    { refetchOnWindowFocus: false }
  );

  const setAlertLevel = trpc.ledger.funderSetAlertLevel.useMutation({
    onSuccess: () => {
      refetch();
      toast.success('预警设置已保存');
      setSaving(false);
    },
    onError: (e) => {
      toast.error('保存失败：' + e.message);
      setSaving(false);
    },
  });

  useEffect(() => {
    if (alertState) {
      setSelectedLevel(alertState.alertLevel as AlertLevel);
    }
  }, [alertState]);

  const hasAnyChannel = (emailEnabled && !!alertState?.userEmail) || (phoneEnabled && !!alertState?.userPhone);

  const handleSaveAlert = async (level: AlertLevel) => {
    if (level !== 'none' && !hasAnyChannel) {
      toast.error('请先开启至少一个接收渠道（邮箱或手机）');
      return;
    }
    setSelectedLevel(level);
    setSaving(true);
    setAlertLevel.mutate({ orderId, ledgerId, alertLevel: level });
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
    if (exposurePct && exposurePct >= 10) return 'critical';
    if (exposurePct && exposurePct >= 5) return 'warning';
    return 'negative';
  };
  const riskLevel = getRiskLevel();

  return (
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

        {/* Tab 切换 —— 背景容器与按钮统一圆角 */}
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
          {activeTab === 'analysis' && (
            <div className="space-y-3">
              {/* 风险状态卡片 */}
              <div className="rounded-2xl p-4" style={{
                background: riskLevel === 'safe' ? '#F0FDF4' :
                  riskLevel === 'critical' ? '#FFF1F1' :
                    riskLevel === 'warning' ? '#FFFBEB' :
                      riskLevel === 'negative' ? '#FFF7ED' : '#F9FAFB',
                border: `1px solid ${riskLevel === 'safe' ? '#BBF7D0' : riskLevel === 'critical' ? '#FECACA' : riskLevel === 'warning' ? '#FDE68A' : riskLevel === 'negative' ? '#FED7AA' : '#E5E7EB'}`
              }}>
                <div className="flex items-center gap-2 mb-2">
                  {riskLevel === 'safe' && <CheckCircle2 className="w-4 h-4" style={{ color: '#16A34A' }} />}
                  {(riskLevel === 'critical' || riskLevel === 'warning' || riskLevel === 'negative') && <AlertTriangle className="w-4 h-4" style={{ color: riskLevel === 'critical' ? '#DC2626' : riskLevel === 'warning' ? '#D97706' : '#EA580C' }} />}
                  {riskLevel === null && <Info className="w-4 h-4" style={{ color: '#9CA3AF' }} />}
                  <span className="text-sm font-semibold" style={{
                    color: riskLevel === 'safe' ? '#15803D' : riskLevel === 'critical' ? '#DC2626' : riskLevel === 'warning' ? '#B45309' : riskLevel === 'negative' ? '#C2410C' : '#6B7280'
                  }}>
                    {riskLevel === 'safe' ? '担保充足' : riskLevel === 'critical' ? '高危预警' : riskLevel === 'warning' ? '风险预警' : riskLevel === 'negative' ? '担保缺口' : '暂无数据'}
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
                    ? `当前担保充足，风险敞口为正值 ${exposure?.toFixed(2)} U，资产安全边际良好。建议持续关注 ${orderInfo.coin} 价格走势，若价格大幅下跌需及时补充担保物。`
                    : riskLevel === 'critical'
                      ? `⚠️ 高危预警！担保缺口已超过买入价值的 ${exposurePct?.toFixed(1)}%，建议立即联系资金方补充担保物，或协商提前结算，避免损失扩大。`
                      : riskLevel === 'warning'
                        ? `担保缺口已达 ${exposurePct?.toFixed(1)}%，处于预警区间。建议密切关注 ${orderInfo.coin} 价格，并与资金方保持沟通，必要时补充担保物。`
                        : riskLevel === 'negative'
                          ? `担保物已不足以覆盖待结利息，建议尽快与资金方沟通，补充担保物或安排付息。`
                          : `当前无实时价格数据，无法进行风险评估。建议手动确认 ${orderInfo.coin} 当前价格并评估担保充足性。`
                  }
                </p>
              </div>
            </div>
          )}

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
                <Toggle
                  enabled={emailEnabled && !!alertState?.userEmail}
                  onChange={setEmailEnabled}
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
                <Toggle
                  enabled={phoneEnabled && !!alertState?.userPhone}
                  onChange={setPhoneEnabled}
                  disabled={!alertState?.userPhone}
                />
              </div>

              {/* 预警级别选择 */}
              <div className="text-xs font-medium pt-1" style={{ color: '#6B7280' }}>选择预警级别</div>
              <div className="space-y-2">
                {ALERT_OPTIONS.map(opt => (
                  <button
                    key={opt.level}
                    className="w-full rounded-2xl p-4 flex items-center gap-3 transition-all text-left"
                    style={{
                      background: selectedLevel === opt.level ? '#EFF6FF' : '#F9FAFB',
                      border: selectedLevel === opt.level ? '1.5px solid #3B82F6' : '1.5px solid #E5E7EB',
                      opacity: !hasAnyChannel && opt.level !== 'none' ? 0.45 : 1,
                    }}
                    onClick={() => handleSaveAlert(opt.level)}
                    disabled={saving || (!hasAnyChannel && opt.level !== 'none')}
                  >
                    <div className="w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center"
                      style={{ background: opt.color }}>
                      {selectedLevel === opt.level && (
                        <div className="w-2 h-2 rounded-full bg-white" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium" style={{ color: '#1A2340' }}>{opt.label}</div>
                      <div className="text-xs" style={{ color: '#6B7280' }}>{opt.desc}</div>
                    </div>
                    {saving && selectedLevel === opt.level && (
                      <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" style={{ color: '#3B82F6' }} />
                    )}
                    {!saving && selectedLevel === opt.level && (
                      <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: '#3B82F6' }} />
                    )}
                  </button>
                ))}
              </div>

              {/* 上次触发记录 */}
              {alertState?.lastTriggeredAt && alertState.lastTriggeredState !== 'none' && (
                <div className="rounded-xl p-3 mt-2" style={{ background: '#FFFBEB', border: '1px solid #FDE68A' }}>
                  <div className="text-xs" style={{ color: '#92400E' }}>
                    上次触发：{alertState.lastTriggeredState === 'negative' ? '担保缺口为负' : alertState.lastTriggeredState === 'pct5' ? '缺口超5%' : '缺口超10%'}
                    &nbsp;·&nbsp;{alertState.lastTriggeredAt}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
