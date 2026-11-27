import type { MibanInvoiceDraft } from "./MibanInvoiceRequestForm";

/** 支付确认只读展示；修改地址、币种和发票需返回确认订单页。 */
export function MibanCheckoutConfirmationDetails({
  receiverName,
  receiverPhone,
  receiverAddress,
  invoiceDraft,
  userNote,
}: {
  receiverName: string;
  receiverPhone: string;
  receiverAddress: string;
  invoiceDraft: MibanInvoiceDraft;
  userNote?: string;
}) {
  return (
    <section aria-label="收货与发票确认" className="mt-4 min-w-0 rounded-[4px] border border-gray-200 bg-white p-3">
      <dl className="space-y-2 text-[12px] leading-5">
        <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-3">
          <dt className="text-gray-500">收货人</dt>
          <dd className="min-w-0 break-words text-gray-800">{receiverName.trim()} <span className="break-all">{receiverPhone.trim()}</span></dd>
        </div>
        <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-3">
          <dt className="text-gray-500">收货地址</dt>
          <dd className="min-w-0 break-words text-gray-800">{receiverAddress.trim()}</dd>
        </div>
        <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-3">
          <dt className="text-gray-500">索取发票</dt>
          <dd className="min-w-0 text-gray-800">{invoiceDraft.enabled ? (invoiceDraft.type === "company" ? "公司发票" : "个人发票") : "不索取发票"}</dd>
        </div>
        {invoiceDraft.enabled && (
          <>
            <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-3">
              <dt className="text-gray-500">发票抬头</dt>
              <dd className="min-w-0 break-words text-gray-800">{invoiceDraft.title.trim()}</dd>
            </div>
            {invoiceDraft.type === "company" && (
              <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-3">
                <dt className="text-gray-500">税号</dt>
                <dd className="min-w-0 break-all text-gray-800">{invoiceDraft.taxNo.trim()}</dd>
              </div>
            )}
          </>
        )}
        {userNote?.trim() && (
          <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-3">
            <dt className="text-gray-500">顾客备注</dt>
            <dd className="min-w-0 break-words text-gray-800">{userNote.trim()}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}
