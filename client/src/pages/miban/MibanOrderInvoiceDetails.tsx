import type { MibanInvoiceRequest } from "@shared/miban-invoice";
export type { MibanInvoiceRequest } from "@shared/miban-invoice";

export function MibanOrderInvoiceDetails({
  invoiceRequest,
}: {
  invoiceRequest?: MibanInvoiceRequest | null;
}) {
  if (!invoiceRequest) return null;

  return (
    <details
      data-card-export-hide="true"
      className="mt-2 border-t border-gray-100 pt-2.5 text-[11px] leading-4"
      onClick={event => event.stopPropagation()}
    >
      <summary className="cursor-pointer font-medium text-gray-500">
        发票申请
      </summary>
      <dl className="mt-2 space-y-1.5">
        <div className="grid grid-cols-[58px_minmax(0,1fr)] items-start gap-x-2">
          <dt className="font-medium text-gray-400">类型</dt>
          <dd className="min-w-0 text-right font-medium text-gray-700">
            {invoiceRequest.type === "company" ? "公司" : "个人"}
          </dd>
        </div>
        <div className="grid grid-cols-[58px_minmax(0,1fr)] items-start gap-x-2">
          <dt className="font-medium text-gray-400">抬头</dt>
          <dd className="min-w-0 break-words text-right font-medium text-gray-700">
            {invoiceRequest.title}
          </dd>
        </div>
        {invoiceRequest.type === "company" && (
          <div className="grid grid-cols-[58px_minmax(0,1fr)] items-start gap-x-2">
            <dt className="font-medium text-gray-400">税号</dt>
            <dd className="min-w-0 break-all text-right font-medium text-gray-700">
              {invoiceRequest.taxNo}
            </dd>
          </div>
        )}
      </dl>
    </details>
  );
}
