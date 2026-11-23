import { useEffect, useId, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ClipboardPaste,
  Download,
  Loader2,
  RotateCcw,
  Search,
  Truck,
  Upload,
  X,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import {
  applyFulfillmentBatches,
  FULFILLMENT_CARRIERS,
  fulfillmentModeError,
  isFulfillmentOrderQuery,
  normalizeFulfillmentCarrier,
  onlyFailedFulfillmentRows,
  previewFulfillmentBatches,
  validateFulfillmentDrafts,
  type FulfillmentCandidate,
  type FulfillmentDraft,
  type FulfillmentMode,
  type FulfillmentOutcome,
  type FulfillmentPreviewRow,
} from "./fulfillmentModel";
import {
  downloadFulfillmentFile,
  fulfillmentFailuresCsv,
  fulfillmentShippingCsv,
  fulfillmentShippingXlsx,
  parseFulfillmentCsv,
  parseFulfillmentFile,
  splitUnfilledFulfillmentRows,
} from "./fulfillmentFiles";

const inputClass =
  "w-full min-w-0 max-w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs outline-none focus:border-orange-400";
const buttonClass =
  "inline-flex min-h-10 min-w-0 items-center justify-center gap-1.5 rounded-xl border border-orange-200 px-3 py-2 text-xs font-semibold text-orange-600 disabled:opacity-40";
function message(reason: unknown): string {
  return reason instanceof Error ? reason.message : "操作失败，请重新核验。";
}

export type FulfillmentPanelProps = {
  orders: readonly FulfillmentCandidate[];
  supplierId?: number;
  /** Identity + supplier + all effective filters. Any change drops drafts/revisions. */
  scopeKey: string;
  initialMode?: FulfillmentMode;
  single?: boolean;
  onChanged?: () => void;
  onClose?: () => void;
};
export default function FulfillmentPanel({
  orders,
  supplierId,
  scopeKey,
  initialMode = "ship",
  single = false,
  onChanged,
  onClose,
}: FulfillmentPanelProps) {
  const [open, setOpen] = useState(single);
  const [mode, setMode] = useState<FulfillmentMode>(initialMode);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(single ? orders.map(order => order.orderNo) : [])
  );
  const [drafts, setDrafts] = useState<FulfillmentDraft[]>([]);
  const [commonCarrier, setCommonCarrier] = useState("");
  const [paste, setPaste] = useState("");
  const [csvSource, setCsvSource] = useState("");
  const [preview, setPreview] = useState<FulfillmentPreviewRow[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [outcomes, setOutcomes] = useState<FulfillmentOutcome[] | null>(null);
  const [busy, setBusy] = useState<
    "read" | "preview" | "apply" | "download" | null
  >(null);
  const [progress, setProgress] = useState(0);
  const [unfilledCount, setUnfilledCount] = useState(0);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  const busyRef = useRef(false);
  const finished = useRef(new Set<string>());
  const outcomeHistory = useRef(new Map<string, FulfillmentOutcome>());
  const carrierId = useId();
  const queryClient = useQueryClient();
  const previewMutation = trpc.supplier.fulfillmentPreview.useMutation();
  const applyMutation = trpc.supplier.fulfillmentApply.useMutation();
  useEffect(() => {
    generation.current++;
    setSelected(new Set(single ? orders.map(order => order.orderNo) : []));
    setMode(initialMode);
    setDrafts([]);
    setPreview([]);
    setOutcomes(null);
    setConfirmed(false);
    setPaste("");
    setCsvSource("");
    setUnfilledCount(0);
    setError("");
    setBusy(null);
    busyRef.current = false;
    finished.current.clear();
    outcomeHistory.current.clear();
    // orders refreshes do not reset in-flight results or successful-row replay protection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, single]);
  useEffect(
    () => () => {
      generation.current++;
    },
    []
  );
  useEffect(() => {
    if (!busyRef.current && !outcomes && preview.length) {
      setPreview([]);
      setConfirmed(false);
    }
    // A foreground refresh may reveal address/status edits; require a fresh revision.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders]);
  const byNo = new Map(orders.map(order => [order.orderNo, order]));
  const selectedOrders = orders.filter(order => selected.has(order.orderNo));
  const exportOrders = selectedOrders.length ? selectedOrders : orders;
  const locked = !!busy || outcomes !== null;
  function dropPreview() {
    setPreview([]);
    setConfirmed(false);
    setError("");
  }
  function changeMode(next: FulfillmentMode) {
    if (busyRef.current || next === mode) return;
    setMode(next);
    setSelected(new Set(single ? orders.map(order => order.orderNo) : []));
    setDrafts([]);
    setPreview([]);
    setOutcomes(null);
    setConfirmed(false);
    setPaste("");
    setCsvSource("");
    setUnfilledCount(0);
    setError("");
    outcomeHistory.current.clear();
  }
  function setPlan(rows: FulfillmentDraft[]) {
    if (busyRef.current || outcomes) return;
    dropPreview();
    setDrafts(rows);
  }
  function editableSelection() {
    if (!selectedOrders.length)
      return setError("请先勾选当前授权列表中的订单。");
    if (selectedOrders.length > 500) return setError("最多勾选 500 笔订单。");
    setPlan(
      selectedOrders.map(order => ({
        orderNo: order.orderNo,
        trackingCompany:
          commonCarrier ||
          (mode === "correct" ? (order.trackingCompany ?? "") : ""),
        trackingNo: mode === "correct" ? (order.trackingNo ?? "") : "",
      }))
    );
  }
  function edit(
    index: number,
    field: "trackingCompany" | "trackingNo",
    value: string
  ) {
    setPlan(
      drafts.map((row, i) =>
        i === index ? { ...row, [field]: value, error: undefined } : row
      )
    );
  }
  function pasteTrackingColumn() {
    const lines = paste.replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n");
    if (
      !drafts.length ||
      lines.length !== drafts.length ||
      lines.some(line => !line.trim() || /\t/.test(line))
    )
      return setError(
        "请只复制一列单号，行数必须与下方订单一致；空行或多列不允许自动对应。"
      );
    setPlan(
      drafts.map((row, index) => ({
        ...row,
        trackingNo: lines[index].trim(),
        error: undefined,
      }))
    );
    setPaste("");
  }
  function loadedRows(rows: FulfillmentDraft[]) {
    const { filled, unfilled } = splitUnfilledFulfillmentRows(rows);
    setUnfilledCount(unfilled.length);
    setDrafts(filled);
    setPreview([]);
    setConfirmed(false);
    if (!filled.length)
      setError("没有填写物流的数据：请填写快递公司及单号后重新载入。");
  }
  async function importFile(file: File) {
    if (busyRef.current || outcomes) return;
    const token = generation.current;
    busyRef.current = true;
    setBusy("read");
    dropPreview();
    try {
      const rows = await parseFulfillmentFile(file);
      if (token === generation.current) loadedRows(rows);
    } catch (reason) {
      if (token === generation.current) {
        setDrafts([]);
        setError(message(reason));
      }
    } finally {
      if (token === generation.current) {
        busyRef.current = false;
        setBusy(null);
      }
    }
  }
  async function download(kind: "xlsx" | "csv") {
    if (busyRef.current) return;
    const token = generation.current;
    busyRef.current = true;
    setBusy("download");
    setError("");
    try {
      const filename = `米伴-${mode === "ship" ? "发货" : "更正"}-表-${new Date().toISOString().slice(0, 10)}`;
      if (kind === "csv")
        downloadFulfillmentFile(
          fulfillmentShippingCsv(exportOrders),
          `${filename}.csv`,
          "text/csv;charset=utf-8"
        );
      else {
        const bytes = await fulfillmentShippingXlsx(exportOrders);
        if (token === generation.current)
          downloadFulfillmentFile(
            bytes.slice().buffer,
            `${filename}.xlsx`,
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          );
      }
    } catch (reason) {
      if (token === generation.current) setError(message(reason));
    } finally {
      if (token === generation.current) {
        busyRef.current = false;
        setBusy(null);
      }
    }
  }
  async function serverPreview() {
    if (busyRef.current || outcomes || !drafts.length) return;
    dropPreview();
    const checked = validateFulfillmentDrafts(drafts, orders, mode).map(row =>
      finished.current.has(`${mode}:${row.orderNo}`)
        ? { ...row, error: "本轮该订单已成功或结果不明，禁止重放；先人工核验" }
        : row
    );
    setDrafts(checked);
    if (checked.some(row => row.error))
      return setError("请修正下方所有本地错误再预览；不会跳过错误行静默发货。");
    const token = generation.current;
    busyRef.current = true;
    setBusy("preview");
    setProgress(0);
    try {
      const rows = await previewFulfillmentBatches(
        checked.map(({ orderNo, trackingCompany, trackingNo }) => ({
          orderNo,
          trackingCompany,
          trackingNo,
        })),
        async rows => {
          if (token !== generation.current)
            throw new Error("身份/筛选已改变，本轮预览已失效");
          return previewMutation.mutateAsync({ ...(supplierId !== undefined ? { supplierId } : {}), mode, rows });
        },
        done => {
          if (token === generation.current) setProgress(done);
        }
      );
      if (token === generation.current) {
        setPreview(rows);
        setConfirmed(false);
      }
    } catch (reason) {
      if (token === generation.current) setError(message(reason));
    } finally {
      if (token === generation.current) {
        busyRef.current = false;
        setBusy(null);
      }
    }
  }
  const ready =
    preview.length === drafts.length &&
    preview.length > 0 &&
    preview.every(row => row.ok && row.revision && row.order);
  async function apply() {
    if (busyRef.current || !ready || !confirmed || outcomes) return;
    const token = generation.current;
    busyRef.current = true;
    setBusy("apply");
    setProgress(0);
    setError("");
    setConfirmed(false);
    const rows = preview.map(row => ({
      orderNo: row.orderNo,
      trackingCompany: row.trackingCompany,
      trackingNo: row.trackingNo,
      revision: row.revision!,
    }));
    const result = await applyFulfillmentBatches(
      rows,
      async rows => {
        if (token !== generation.current)
          throw new Error("身份/筛选已改变，剩余批次停止；请人工核验");
        return applyMutation.mutateAsync({ ...(supplierId !== undefined ? { supplierId } : {}), mode, rows });
      },
      done => {
        if (token === generation.current) setProgress(done);
      }
    );
    // Invalidation is read-only, including after unmount or partially successful batches.
    await queryClient.invalidateQueries({
      predicate: query => isFulfillmentOrderQuery(query.queryKey),
    });
    if (token === generation.current) {
      result
        .filter(row => row.state !== "failed")
        .forEach(row => finished.current.add(`${mode}:${row.orderNo}`));
      result.forEach(row => outcomeHistory.current.set(row.orderNo, row));
      setOutcomes(Array.from(outcomeHistory.current.values()));
      setPreview([]);
      busyRef.current = false;
      setBusy(null);
      onChanged?.();
    }
  }
  function retryFailed() {
    if (busyRef.current || !outcomes) return;
    const rows = onlyFailedFulfillmentRows(outcomes);
    setOutcomes(null);
    setPreview([]);
    setConfirmed(false);
    setDrafts(rows);
    setError("");
  }
  const successCount =
    outcomes?.filter(row => row.state === "success").length ?? 0;
  const failedCount =
    outcomes?.filter(row => row.state === "failed").length ?? 0;
  const unknownCount =
    outcomes?.filter(row => row.state === "unknown").length ?? 0;
  return (
    <section
      className="min-w-0 max-w-full space-y-3 overflow-x-clip rounded-2xl border border-orange-100 bg-white p-3"
      aria-label="统一订单物流处理"
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <button
          type="button"
          disabled={!!busy}
          onClick={() => setOpen(value => !value)}
          className="flex min-w-0 items-center gap-2 text-left text-sm font-semibold"
        >
          <Truck className="h-4 w-4 shrink-0 text-orange-500" />
          {single
            ? mode === "ship"
              ? "单笔发货核验"
              : "单笔物流更正"
            : "统一发货 / 物流更正"}
        </button>
        {onClose && (
          <button
            type="button"
            aria-label="关闭物流处理"
            disabled={!!busy}
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {open && (
        <>
          <div className="grid min-w-0 grid-cols-2 gap-2" aria-label="物流模式">
            <button
              type="button"
              aria-pressed={mode === "ship"}
              disabled={!!busy}
              onClick={() => changeMode("ship")}
              className={`${buttonClass} ${mode === "ship" ? "bg-orange-500 text-white" : "bg-white"}`}
            >
              正常发货
            </button>
            <button
              type="button"
              aria-pressed={mode === "correct"}
              disabled={!!busy}
              onClick={() => changeMode("correct")}
              className={`${buttonClass} ${mode === "correct" ? "bg-orange-500 text-white" : "bg-white"}`}
            >
              <RotateCcw className="h-3.5 w-3.5 shrink-0" />
              更正已发货
            </button>
          </div>
          <p className="break-words rounded-xl bg-orange-50 p-3 text-[11px] leading-5 text-orange-700">
            {mode === "ship"
              ? "正常发货不覆盖已有运单；取消、已收货不可发货。"
              : "仅更正已发货订单，保留首次发货与自动收货时间。"}{" "}
            最多500笔，分100笔服务端预览并核验版本；确认后才真正提交。
          </p>
          {!single && (
            <>
              <p className="text-[11px] leading-5 text-gray-500">
                当前授权/筛选范围 {orders.length} 笔；已勾选{" "}
                {selectedOrders.length}{" "}
                笔。未勾选时下载当前筛选列表，勾选后只下载勾选订单。下载含客户隐私，请妥善保存；只填写快递公司和单号，识别码按文本保留。
              </p>
              <div className="grid min-w-0 grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={!!busy || !exportOrders.length}
                  onClick={() => void download("xlsx")}
                  className={buttonClass}
                >
                  <Download className="h-3.5 w-3.5 shrink-0" />
                  下载 XLSX 发货表
                </button>
                <button
                  type="button"
                  disabled={!!busy || !exportOrders.length}
                  onClick={() => void download("csv")}
                  className={buttonClass}
                >
                  <Download className="h-3.5 w-3.5 shrink-0" />
                  下载 CSV 发货表
                </button>
              </div>
              <fieldset disabled={locked} className="min-w-0 space-y-2">
                <div className="flex flex-wrap gap-2 text-[11px]">
                  <button
                    type="button"
                    onClick={() => {
                      dropPreview();
                      setSelected(
                        new Set(
                          orders
                            .filter(order => !fulfillmentModeError(order, mode))
                            .slice(0, 500)
                            .map(order => order.orderNo)
                        )
                      );
                    }}
                    className="rounded-lg border px-2 py-2"
                  >
                    勾选可处理订单（最多500）
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      dropPreview();
                      setSelected(new Set());
                    }}
                    className="rounded-lg border px-2 py-2"
                  >
                    清空勾选
                  </button>
                </div>
                <div className="max-h-64 space-y-2 overflow-y-auto rounded-xl border border-gray-100 p-2">
                  {orders.slice(0, 500).map(order => {
                    const reason = fulfillmentModeError(order, mode);
                    return (
                      <label
                        key={order.orderNo}
                        className="flex min-w-0 items-start gap-2 rounded-lg bg-gray-50 p-2 text-[11px] leading-5"
                      >
                        <input
                          type="checkbox"
                          disabled={!!reason}
                          checked={selected.has(order.orderNo)}
                          onChange={event => {
                            dropPreview();
                            setSelected(previous => {
                              const next = new Set(previous);
                              if (event.target.checked) next.add(order.orderNo);
                              else next.delete(order.orderNo);
                              return next;
                            });
                          }}
                          className="mt-1 shrink-0 accent-orange-500"
                        />
                        <span className="min-w-0 break-words">
                          <span className="break-all font-semibold">
                            {order.orderNo}
                          </span>{" "}
                          · {order.receiverName} ·{" "}
                          <span className="break-all">
                            {order.receiverPhone}
                          </span>
                          <span className="block break-words text-gray-500">
                            {order.products} · {order.specifications} ·{" "}
                            {order.quantities}
                          </span>
                          {reason && (
                            <span className="block text-gray-400">
                              {reason}
                            </span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                  {!orders.length && (
                    <p className="text-xs text-gray-400">
                      当前筛选没有授权订单。
                    </p>
                  )}
                </div>
                {orders.length > 500 && (
                  <p className="text-[11px] text-orange-600">
                    当前仅显示前500笔，请缩小筛选以处理后续订单。
                  </p>
                )}
              </fieldset>
            </>
          )}
          <fieldset disabled={locked} className="min-w-0 space-y-3">
            <label className="block min-w-0 text-xs text-gray-600">
              <span className="flex items-center gap-1">
                <Search className="h-3.5 w-3.5" />
                公共快递公司（搜索 / 选择，也可填写其他公司）
              </span>
              <input
                list={carrierId}
                value={commonCarrier}
                maxLength={32}
                onChange={event => {
                  setCommonCarrier(event.target.value);
                  dropPreview();
                }}
                placeholder="搜索顺丰、中通、圆通等"
                className={`${inputClass} mt-1`}
              />
            </label>
            <datalist id={carrierId}>
              {FULFILLMENT_CARRIERS.map(name => (
                <option key={name} value={name} />
              ))}
            </datalist>
            <div className="grid min-w-0 grid-cols-2 gap-2">
              <button
                type="button"
                onClick={editableSelection}
                disabled={!selectedOrders.length}
                className={buttonClass}
              >
                {single ? "填写此订单" : "填写勾选订单"}
              </button>
              <button
                type="button"
                disabled={!drafts.length || !commonCarrier.trim()}
                onClick={() =>
                  setPlan(
                    drafts.map(row => ({
                      ...row,
                      trackingCompany:
                        normalizeFulfillmentCarrier(commonCarrier),
                      error: undefined,
                    }))
                  )
                }
                className={buttonClass}
              >
                公共快递应用全部
              </button>
            </div>
            {!single && (
              <>
                <input
                  type="file"
                  accept=".xlsx,.csv"
                  ref={fileRef}
                  className="hidden"
                  onChange={event => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void importFile(file);
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className={`${buttonClass} w-full`}
                >
                  <Upload className="h-3.5 w-3.5" />
                  导入 XLSX / UTF-8 CSV
                </button>
                <p className="text-[11px] leading-5 text-gray-400">
                  CSV最大1MB，XLSX最大5MB，仅一张工作表、最多500行。按表头匹配，不按固定列。拒绝公式、科学计数或丢失精度的长数字、宏及不安全压缩包；单号务必设置文本。
                </p>
                <label className="block min-w-0 text-xs text-gray-500">
                  或粘贴带表头CSV
                  <textarea
                    value={csvSource}
                    maxLength={1024 * 1024}
                    onChange={event => {
                      setCsvSource(event.target.value);
                      dropPreview();
                    }}
                    rows={3}
                    placeholder="订单号,快递公司,快递单号"
                    className={`${inputClass} mt-1 resize-y`}
                  />
                </label>
                <button
                  type="button"
                  disabled={!csvSource.trim()}
                  onClick={() => {
                    try {
                      dropPreview();
                      loadedRows(parseFulfillmentCsv(csvSource));
                    } catch (reason) {
                      setDrafts([]);
                      dropPreview();
                      setError(message(reason));
                    }
                  }}
                  className={buttonClass}
                >
                  解析粘贴CSV
                </button>
              </>
            )}
            {!single && drafts.length > 0 && (
              <>
                <label className="block min-w-0 text-xs text-gray-500">
                  Excel复制一列单号（按下方明确订单列表对应，填入后须逐笔核对客户）
                  <textarea
                    value={paste}
                    onChange={event => {
                      setPaste(event.target.value);
                      dropPreview();
                    }}
                    rows={3}
                    maxLength={33000}
                    placeholder="每行一个单号，不能含空行或其他列"
                    className={`${inputClass} mt-1 resize-y`}
                  />
                </label>
                <button
                  type="button"
                  disabled={!paste.trim()}
                  onClick={pasteTrackingColumn}
                  className={buttonClass}
                >
                  <ClipboardPaste className="h-3.5 w-3.5" />
                  填入并核对下方对应客户
                </button>
              </>
            )}
            {drafts.length > 0 && (
              <div
                className="max-h-96 space-y-2 overflow-y-auto"
                aria-label="逐单物流填写"
              >
                {drafts.map((row, index) => {
                  const order = byNo.get(row.orderNo);
                  return (
                    <div
                      key={`${index}:${row.orderNo}`}
                      className="min-w-0 space-y-2 rounded-xl border border-gray-100 bg-gray-50 p-3 text-[11px]"
                    >
                      <div className="flex min-w-0 items-start justify-between gap-2">
                        <p className="min-w-0 break-all font-semibold">
                          {index + 1}. {row.orderNo || "缺少订单号"}
                          {row.line ? `（文件第${row.line}行）` : ""}
                        </p>
                        <button
                          type="button"
                          aria-label={`移除第${index + 1}行`}
                          onClick={() =>
                            setPlan(drafts.filter((_, i) => i !== index))
                          }
                        >
                          <X className="h-3.5 w-3.5 shrink-0" />
                        </button>
                      </div>
                      <p className="break-words">
                        对应收货人：
                        {order
                          ? `${order.receiverName} · ${order.receiverPhone}`
                          : "未匹配当前授权列表"}
                      </p>
                      {order && (
                        <p className="break-words leading-5 text-gray-500">
                          {order.receiverAddress}
                          <br />
                          {order.products} · {order.specifications} ·{" "}
                          {order.quantities}
                          <br />
                          旧物流：{order.trackingCompany || "无"} ·{" "}
                          <span className="break-all">
                            {order.trackingNo || "无"}
                          </span>
                        </p>
                      )}
                      <label className="block">
                        新快递公司
                        <input
                          list={carrierId}
                          value={row.trackingCompany}
                          maxLength={32}
                          onChange={event =>
                            edit(index, "trackingCompany", event.target.value)
                          }
                          className={`${inputClass} mt-1`}
                        />
                      </label>
                      <label className="block">
                        新快递单号
                        <input
                          type="text"
                          inputMode="text"
                          autoComplete="off"
                          value={row.trackingNo}
                          maxLength={64}
                          onChange={event =>
                            edit(index, "trackingNo", event.target.value)
                          }
                          className={`${inputClass} mt-1 font-mono`}
                        />
                      </label>
                      {row.error && (
                        <p role="alert" className="break-words text-red-600">
                          {row.error}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </fieldset>
          {unfilledCount > 0 && (
            <p
              role="status"
              className="break-words rounded-xl bg-gray-50 p-3 text-xs leading-5 text-gray-600"
            >
              已跳过 {unfilledCount} 行未填写物流的模板订单，仅保留{" "}
              {drafts.length}{" "}
              行填写数据；仍按订单号匹配服务端客户，不依赖文件行序。
            </p>
          )}
          {error && (
            <p
              role="alert"
              className="break-words rounded-xl bg-red-50 p-3 text-xs leading-5 text-red-700"
            >
              {error}
            </p>
          )}
          {busy && (
            <p
              role="status"
              className="flex items-center gap-2 text-xs text-gray-500"
            >
              <Loader2 className="h-4 w-4 animate-spin" />
              {busy === "read"
                ? "安全解析文件…"
                : busy === "download"
                  ? "生成发货表…"
                  : `${busy === "preview" ? "服务端预览" : "提交处理"} ${progress}/${drafts.length} 行…`}
            </p>
          )}
          {!outcomes && (
            <button
              type="button"
              disabled={!!busy || !drafts.length}
              onClick={() => void serverPreview()}
              className={`${buttonClass} w-full`}
            >
              <Search className="h-3.5 w-3.5" />
              服务端预览（不写入）{drafts.length ? ` ${drafts.length} 行` : ""}
            </button>
          )}
          {preview.length > 0 && !outcomes && (
            <>
              <p className="text-xs font-semibold">
                服务端预览：可提交 {preview.filter(row => row.ok).length} /{" "}
                {preview.length} 行
              </p>
              <div
                className="max-h-96 space-y-2 overflow-y-auto"
                aria-label="服务端客户与物流核验"
              >
                {preview.map(row => (
                  <div
                    key={`${row.index}:${row.orderNo}`}
                    className={`min-w-0 space-y-1 rounded-xl border p-3 text-xs leading-5 ${row.ok ? "border-green-100 bg-green-50/40" : "border-red-100 bg-red-50"}`}
                  >
                    <p className="break-all font-semibold">{row.orderNo}</p>
                    {row.order && (
                      <>
                        <p className="break-words">
                          服务端收货人：{row.order.receiverName} ·{" "}
                          {row.order.receiverPhone}
                        </p>
                        <p className="break-words text-gray-500">
                          {row.order.receiverAddress} · 状态 {row.order.status}
                        </p>
                        <p className="break-words">
                          旧：{row.order.trackingCompany || "无"} ·{" "}
                          <span className="break-all">
                            {row.order.trackingNo || "无"}
                          </span>
                        </p>
                      </>
                    )}
                    <p className="break-words">
                      新：{row.trackingCompany} ·{" "}
                      <span className="break-all">{row.trackingNo}</span>
                    </p>
                    <p
                      className={
                        row.ok ? "text-green-700" : "break-words text-red-600"
                      }
                    >
                      {row.ok
                        ? "已取得服务端版本，等待核对确认"
                        : row.error || "服务端拒绝"}
                    </p>
                  </div>
                ))}
              </div>
              {!ready && (
                <p className="text-xs leading-5 text-red-600">
                  有失败预览行，不能提交。修改或移除错误行后必须重新获取全部预览。
                </p>
              )}
              <label className="flex min-w-0 items-start gap-2 text-xs leading-5">
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={!ready || !!busy}
                  onChange={event => setConfirmed(event.target.checked)}
                  className="mt-1 shrink-0 accent-orange-500"
                />
                <span className="min-w-0 break-words">
                  我已按订单号逐笔核对服务端客户、地址、旧新物流，确认本次是「
                  {mode === "ship" ? "正常发货" : "更正已发货物流"}
                  」。粘贴单号与对应客户一致。
                </span>
              </label>
              <button
                type="button"
                disabled={!ready || !confirmed || !!busy}
                onClick={() => void apply()}
                className={`${buttonClass} w-full bg-orange-500 text-white`}
              >
                <Check className="h-3.5 w-3.5" />
                确认{mode === "ship" ? "发货" : "更正"} {preview.length} 行
              </button>
            </>
          )}
          {outcomes && (
            <>
              <p
                role="status"
                className="break-words rounded-xl bg-orange-50 p-3 text-xs leading-5"
              >
                本轮共 {outcomes.length} 行：成功 {successCount} · 失败{" "}
                {failedCount} · 结果不明/未返回 {unknownCount}
                。成功行不会再次提交；结果不明请先核验订单，不能自动重试。
              </p>
              <div className="max-h-64 space-y-2 overflow-y-auto">
                {outcomes.map((row, index) => (
                  <p
                    key={`${index}:${row.orderNo}`}
                    className={`break-words rounded-xl p-2 text-xs leading-5 ${row.state === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}
                  >
                    <span className="break-all">{row.orderNo}</span>：
                    {row.state === "success" ? "成功" : row.error || "失败"}
                  </p>
                ))}
              </div>
              <div className="grid min-w-0 grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={!failedCount && !unknownCount}
                  onClick={() =>
                    downloadFulfillmentFile(
                      fulfillmentFailuresCsv(outcomes, orders),
                      "米伴发货失败及待核验.csv",
                      "text/csv;charset=utf-8"
                    )
                  }
                  className={buttonClass}
                >
                  <Download className="h-3.5 w-3.5 shrink-0" />
                  导出失败/待核验行
                </button>
                <button
                  type="button"
                  disabled={!failedCount}
                  onClick={retryFailed}
                  className={buttonClass}
                >
                  <RotateCcw className="h-3.5 w-3.5 shrink-0" />
                  仅失败行重新预览
                </button>
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
