import { useEffect, useRef, useState, type ReactNode } from "react";
import { trpc as mtrpc } from "@/lib/trpc";
import { mibanInvoiceRequestSchema, type MibanInvoiceRequest } from "@shared/miban-invoice";
import type { MibanInvoiceDraft } from "./MibanInvoiceRequestForm";

export const MIBAN_INVOICE_MEMORY_FAILURE = "常用发票暂未记录，不影响本次发票申请";

type Scope = {
  userId: number;
  active: boolean;
  abort: AbortController;
  readVersion: number;
  saveVersion: number;
  saved: Set<string>;
  pending: Set<string>;
};
type History = { scope: Scope; entries: MibanInvoiceRequest[]; loading: boolean; failed: boolean };
const identity = (invoice: MibanInvoiceRequest) => JSON.stringify([
  invoice.type, invoice.title, invoice.type === "company" ? invoice.taxNo : "",
]);
const isInvoiceInput = (target: EventTarget | null): target is HTMLInputElement => {
  const input = target as HTMLInputElement | null;
  return input?.tagName === "INPUT" && (input.dataset.invoiceField === "title" || input.dataset.invoiceField === "taxNo");
};

/** 只在已登录且开启索取发票时挂载；不使用无输入query的跨用户共享缓存。 */
export function MibanInvoiceMemory({ userId, draft, onChange, disabled = false, children }: {
  userId: number;
  draft: MibanInvoiceDraft;
  onChange: (draft: MibanInvoiceDraft) => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  const client = mtrpc.useUtils().client;
  const scopeRef = useRef<Scope | null>(null);
  const current = useRef({ userId, draft, disabled, onChange });
  current.current = { userId, draft, disabled, onChange };
  const dirty = useRef(false);
  const [history, setHistory] = useState<History | null>(null);
  const [notice, setNotice] = useState<{ scope: Scope; text: string } | null>(null);

  const isCurrent = (scope: Scope) => scope.active && scopeRef.current === scope
    && current.current.userId === scope.userId && current.current.draft.enabled;

  const readHistory = async (scope: Scope) => {
    if (!isCurrent(scope)) return;
    const version = ++scope.readVersion;
    try {
      // 直接query每次真实请求，既不读缓存，也不与旧用户的in-flight fetch共享结果。
      const response = await client.limitedProduct.invoiceFavorites.query(undefined, { signal: scope.abort.signal });
      if (!isCurrent(scope) || version !== scope.readVersion) return;
      const entries: MibanInvoiceRequest[] = [];
      const seen = new Set<string>();
      for (const item of response) {
        const result = mibanInvoiceRequestSchema.safeParse(item);
        if (!result.success || seen.has(identity(result.data))) continue;
        seen.add(identity(result.data));
        entries.push(result.data);
      }
      setHistory({ scope, entries, loading: false, failed: false });
    } catch {
      if (!isCurrent(scope) || version !== scope.readVersion) return;
      setHistory(previous => ({ scope, entries: previous?.scope === scope ? previous.entries : [], loading: false, failed: true }));
    }
  };

  useEffect(() => {
    dirty.current = false;
    if (!Number.isSafeInteger(userId) || userId <= 0 || !draft.enabled) return;
    const scope: Scope = {
      userId, active: true, abort: new AbortController(), readVersion: 0, saveVersion: 0,
      saved: new Set(), pending: new Set(),
    };
    scopeRef.current = scope;
    setHistory({ scope, entries: [], loading: true, failed: false });
    setNotice(null);
    void readHistory(scope);
    return () => {
      scope.active = false;
      scope.abort.abort();
      if (scopeRef.current === scope) scopeRef.current = null;
      dirty.current = false;
    };
    // draft内容不触发加载，保持父级当前草稿；开关关闭时父级卸载本组件。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, draft.enabled, client]);

  useEffect(() => { dirty.current = false; }, [draft.type]);

  const remember = async () => {
    const scope = scopeRef.current;
    const latest = current.current;
    if (!scope || !isCurrent(scope) || latest.disabled || !dirty.current) return;
    const result = mibanInvoiceRequestSchema.safeParse({
      type: latest.draft.type,
      title: latest.draft.title,
      ...(latest.draft.type === "company" ? { taxNo: latest.draft.taxNo } : {}),
    });
    if (!result.success) return;
    const invoice = result.data;
    const key = identity(invoice);
    if (scope.saved.has(key)) { dirty.current = false; return; }
    if (scope.pending.has(key)) return;
    dirty.current = false;
    scope.pending.add(key);
    const version = ++scope.saveVersion;
    try {
      // 输出DTO的税号是可选字段；接口输入按已校验的类型明确区分个人/公司。
      const response = await client.limitedProduct.rememberInvoice.mutate(invoice.type === "company"
        ? { type: "company", title: invoice.title, taxNo: invoice.taxNo ?? "" }
        : { type: "personal", title: invoice.title });
      if (!isCurrent(scope)) return;
      if (response.saved !== true) throw new Error("Invoice memory was not acknowledged");
      // 只有真实成功才能去重；失败仍可通过再次编辑重试。
      scope.saved.add(key);
      if (version === scope.saveVersion) setNotice(null);
      // 仅刷新常用列表，异步回包绝不回写父draft或覆盖随后输入。
      void readHistory(scope);
    } catch {
      if (isCurrent(scope) && version === scope.saveVersion) setNotice({ scope, text: MIBAN_INVOICE_MEMORY_FAILURE });
    } finally {
      scope.pending.delete(key);
    }
  };

  const scope = scopeRef.current;
  const visible = scope && isCurrent(scope) && history?.scope === scope ? history : null;
  return (
    <div
      className="min-w-0"
      onChangeCapture={event => {
        if (!current.current.disabled && isInvoiceInput(event.target)) dirty.current = true;
      }}
      onClickCapture={event => {
        // 切换类型不算真实input编辑，不能将旧dirty写成默认个人资料。
        if ((event.target as HTMLElement).closest?.("[data-invoice-type]")) dirty.current = false;
      }}
      onBlurCapture={event => {
        if (!isInvoiceInput(event.target)) return;
        const next = event.relatedTarget as HTMLElement | null;
        if (next && event.currentTarget.contains(next)) return;
        // 关闭开关不触发资料记忆。
        if (next?.closest?.("[data-invoice-toggle]")) { dirty.current = false; return; }
        void remember();
      }}
    >
      <div aria-label="常用发票" className="mt-3 min-w-0 rounded-[4px] border border-gray-100 bg-gray-50 p-2" data-card-export-hide="true">
        <p className="text-[12px] font-semibold text-gray-600">常用发票</p>
        {!visible || visible.loading ? <p role="status" className="mt-1 text-[11px] text-gray-400">正在读取常用发票…</p>
          : visible.entries.length ? (
            <div className="mt-1.5 max-h-40 min-w-0 space-y-1 overflow-y-auto">
              {visible.entries.map(invoice => (
                <button
                  key={identity(invoice)}
                  type="button"
                  disabled={disabled}
                  className="block w-full min-w-0 rounded-[4px] border border-gray-200 bg-white px-2 py-1.5 text-left disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => {
                    const latest = current.current;
                    if (!scope || !isCurrent(scope) || latest.disabled) return;
                    dirty.current = false;
                    latest.onChange({ enabled: true, type: invoice.type, title: invoice.title, taxNo: invoice.type === "company" ? invoice.taxNo || "" : "" });
                  }}
                >
                  <span className="block break-words text-[11px] leading-4 text-gray-700 [overflow-wrap:anywhere]">{invoice.type === "company" ? "公司" : "个人"} · {invoice.title}</span>
                  {invoice.type === "company" && <span className="mt-0.5 block text-[10px] text-gray-400">税号尾号 · {invoice.taxNo?.slice(-4)}</span>}
                </button>
              ))}
            </div>
          ) : !visible.failed && <p className="mt-1 text-[11px] text-gray-400">暂无常用发票，填写完整后离开输入区域将自动记录</p>}
        {visible?.failed && <p role="status" className="mt-1 text-[11px] text-gray-400">常用发票暂未读取，不影响本次发票申请</p>}
        {scope && notice?.scope === scope && isCurrent(scope) && <p role="status" className="mt-1 break-words text-[11px] text-amber-700">{notice.text}</p>}
      </div>
      {children}
    </div>
  );
}
