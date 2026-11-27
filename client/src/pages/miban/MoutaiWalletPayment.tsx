import { MibanWalletAvailableSummary, MibanPaymentConfirmation, useMibanMixedPayment } from './MibanMixedPayment';

/** 贵州精选与柚子、康宝莱及购物车共用同一付款币种区。
 * 人民币/数字币均按本人真实可用余额展示，不能另建余额或币种下拉。
 * 后续精品茅台、15年陈年同样复用；此审核入口只查询、不下单扣款。 */
export default function MoutaiWalletPayment({ totalCny }: { totalCny: number }) {
  const payment = useMibanMixedPayment(totalCny, true);
  return <section data-testid="wallet-payment-preview" className="space-y-4">
    <MibanWalletAvailableSummary payment={payment} accent="#9E2528" />
    <MibanPaymentConfirmation payment={payment} accent="#9E2528" />
    <p role="status" className="text-center text-[10px] leading-5 text-[var(--mt-muted)]">暂不可结算</p>
  </section>;
}
