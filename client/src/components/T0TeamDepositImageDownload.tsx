import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Download, LoaderCircle, X } from "lucide-react";
import { toast } from "sonner";

export type T0TeamDepositImageDownloadProps = {
  disabled?: boolean;
  getSnapshot: () => {
    memberName: string;
    avatar?: string;
    rows: Array<{ date: string; eth: string; u: string; note: string }>;
    ethTotal: string;
    uTotal: string;
    reconciled: boolean;
  };
};
type Snapshot = ReturnType<T0TeamDepositImageDownloadProps["getSnapshot"]>;
type ImagePreview = { blob: Blob; url: string; filename: string; title: string };
const IMAGE_WIDTH = 420;
const FONT = "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', 'Segoe UI', sans-serif";

function formatScreenshotTime(date: Date) {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: string) => parts.find(part => part.type === type)?.value || "";
  return `${value("year")}-${value("month")}-${value("day")} ${value("hour")}:${value("minute")}:${value("second")}`;
}

function textElement(tag: "div" | "span" | "p", text: string, css: string) {
  const element = document.createElement(tag);
  element.textContent = text;
  element.style.cssText = css;
  return element;
}

/** Anonymous loading + conversion to a data URL prevents a remote avatar tainting the export. */
function safeImageDataUrl(src: string | undefined): Promise<string | null> {
  if (!src) return Promise.resolve(null);
  return new Promise(resolve => {
    const image = new Image();
    let finished = false;
    const finish = (value: string | null) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      resolve(value);
    };
    const timer = window.setTimeout(() => { finish(null); image.src = ""; }, 3500);
    image.crossOrigin = "anonymous";
    image.onload = () => {
      const canvas = document.createElement("canvas");
      try {
        if (!image.naturalWidth || !image.naturalHeight) { finish(null); return; }
        const ratio = Math.min(1, 160 / Math.max(image.naturalWidth, image.naturalHeight));
        canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
        const context = canvas.getContext("2d");
        if (!context) { finish(null); return; }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        finish(canvas.toDataURL("image/png"));
      } catch { finish(null); }
      finally { canvas.width = 0; canvas.height = 0; }
    };
    image.onerror = () => finish(null);
    image.src = src;
  });
}

function replaceWithImage(element: HTMLElement, src: string | null, alt: string) {
  if (!src) return;
  const image = document.createElement("img");
  image.alt = alt;
  image.style.cssText = "display:block;width:100%;height:100%;object-fit:cover;border-radius:inherit;";
  image.crossOrigin = "anonymous";
  // Keep the initial/text brand if even the already-sanitized data image fails.
  image.onload = () => { element.replaceChildren(image); image.onload = null; image.onerror = null; };
  image.onerror = () => { image.onload = null; image.onerror = null; };
  image.src = src;
}

/** No live dialog DOM, subgrid, fixed height, truncation, or amount arithmetic. */
function prepareExport(snapshot: Snapshot, screenshotTime: string) {
  const container = document.createElement("div");
  container.setAttribute("data-t0-team-deposit-export", "true");
  container.style.cssText = `position:fixed;top:0;left:-10000px;width:${IMAGE_WIDTH}px;height:auto;padding:16px;box-sizing:border-box;background:#ffffff;color:#0f172a;font-family:${FONT};font-size:12px;line-height:1.5;pointer-events:none;z-index:-1;`;
  const header = document.createElement("div");
  header.style.cssText = "padding:14px;border-radius:12px;background:#f0f9ff;border:1px solid #e0f2fe;";
  const heading = document.createElement("div");
  heading.style.cssText = "display:flex;align-items:center;gap:8px;";
  const brand = textElement("span", "R1", "display:flex;flex-shrink:0;align-items:center;justify-content:center;width:28px;height:28px;border-radius:7px;background:#0f172a;color:#ffffff;font-size:13px;font-weight:700;");
  heading.append(brand, textElement("span", "团队成员充值明细", "font-size:16px;font-weight:700;color:#0f172a;"));
  const member = document.createElement("div");
  member.style.cssText = "display:flex;align-items:center;gap:10px;margin-top:12px;";
  const avatar = textElement("span", Array.from(snapshot.memberName)[0] || "姓", "display:flex;flex-shrink:0;align-items:center;justify-content:center;width:36px;height:36px;border-radius:50%;background:#1e293b;color:#ffffff;font-size:15px;font-weight:600;overflow:hidden;");
  const memberText = document.createElement("div");
  memberText.style.cssText = "min-width:0;flex:1;";
  memberText.append(
    textElement("div", snapshot.memberName, "font-size:14px;font-weight:700;white-space:pre-wrap;overflow-wrap:anywhere;"),
    textElement("div", `共 ${snapshot.rows.length} 笔充值 · 不含提现`, "margin-top:2px;font-size:11px;color:#64748b;"),
  );
  member.append(avatar, memberText);
  header.append(heading, member);

  const table = document.createElement("table");
  // Auto layout shares widths across all records. U's nowrap/1% grows to the
  // widest amount; ETH ends immediately before the shared vertical divider.
  table.style.cssText = "width:100%;table-layout:auto;border-collapse:collapse;border-spacing:0;margin:14px 0 0;font-size:12px;line-height:18px;font-variant-numeric:tabular-nums;";
  const head = table.createTHead().insertRow();
  for (const [index, label] of ["日期", "ETH", "U"].entries()) {
    const cell = document.createElement("th");
    cell.textContent = label;
    cell.style.cssText = `padding:8px 6px;border-bottom:1px solid #cbd5e1;color:#64748b;font-size:11px;font-weight:600;white-space:nowrap;text-align:${index === 0 ? "center" : "right"};`;
    if (index === 0) cell.style.width = "58px";
    if (index === 2) { cell.style.width = "1%"; cell.style.borderLeft = "1px solid #e2e8f0"; }
    head.appendChild(cell);
  }
  const body = table.createTBody();
  for (const row of snapshot.rows) {
    const values = body.insertRow();
    for (const [index, text] of [row.date, row.eth, row.u].entries()) {
      const cell = values.insertCell();
      cell.textContent = text;
      cell.style.cssText = `padding:9px 6px 3px;vertical-align:middle;white-space:nowrap;text-align:${index === 0 ? "center" : "right"};font-weight:${index === 0 ? "500" : "600"};color:${index === 0 ? "#334155" : "#0369a1"};`;
      if (index === 2) cell.style.borderLeft = "1px solid #e2e8f0";
    }
    const note = body.insertRow().insertCell();
    note.colSpan = 3;
    note.style.cssText = "padding:0 6px 9px;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:11px;line-height:17px;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;";
    note.textContent = row.note || "无备注";
  }
  const totals = document.createElement("div");
  totals.style.cssText = "margin-top:12px;padding:12px;border-radius:10px;background:#f8fafc;border:1px solid #e2e8f0;";
  totals.append(
    textElement("div", "充值汇总", "font-weight:700;font-size:12px;color:#334155;"),
    textElement("div", snapshot.ethTotal, "margin-top:5px;font-weight:600;font-variant-numeric:tabular-nums;white-space:pre-wrap;overflow-wrap:anywhere;color:#0369a1;"),
    textElement("div", snapshot.uTotal, "margin-top:3px;font-weight:600;font-variant-numeric:tabular-nums;white-space:pre-wrap;overflow-wrap:anywhere;color:#0369a1;"),
    textElement("div", "与总金额一致（U口径）", "margin-top:6px;font-size:10px;color:#64748b;"),
  );
  const footer = textElement("div", `R1｜生成时间 ${screenshotTime}（北京时间）`, "margin-top:12px;text-align:right;font-size:10px;line-height:16px;color:#64748b;");
  container.append(header, table, totals, footer);
  return { container, brand, avatar };
}

function appendWatermark(container: HTMLElement, text: string, height: number) {
  const watermark = document.createElement("div");
  watermark.style.cssText = "position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:2147483646;";
  for (let y = -45, row = 0; y < height + 80; y += 90, row++) {
    for (let x = row % 2 === 0 ? -100 : -230; x < IMAGE_WIDTH + 180; x += 265) {
      watermark.appendChild(textElement("span", text, `position:absolute;left:${x}px;top:${y}px;color:rgba(51,65,85,0.065);font-family:${FONT};font-size:11px;font-weight:600;line-height:1;white-space:nowrap;transform:rotate(-22deg);transform-origin:left top;`));
    }
  }
  container.appendChild(watermark);
}

/** Parent supplies all formatted amounts and disables loading/error/unreconciled/empty states. */
export function T0TeamDepositImageDownload({ disabled = false, getSnapshot }: T0TeamDepositImageDownloadProps) {
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<ImagePreview | null>(null);
  const generationLock = useRef(false);
  const saveLock = useRef(false);
  const mounted = useRef(true);
  const temporaryDom = useRef<HTMLElement | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; temporaryDom.current?.remove(); temporaryDom.current = null; };
  }, []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);
  useEffect(() => {
    if (!preview) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const focusPreview = () => (closeRef.current || previewRef.current)?.focus();
    const frame = requestAnimationFrame(focusPreview);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" && event.key !== "Tab") return;
      // Window capture runs before the parent modal's document Escape/Tab handlers.
      event.stopPropagation();
      event.preventDefault();
      if (event.key === "Escape") { setPreview(null); return; }
      const buttons = Array.from(previewRef.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") || []);
      if (!buttons.length) { focusPreview(); return; }
      const index = buttons.findIndex(button => button === document.activeElement);
      const next = index < 0 ? (event.shiftKey ? buttons.length - 1 : 0) : (index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    };
    const onFocus = (event: FocusEvent) => {
      if (event.target instanceof Node && previewRef.current?.contains(event.target)) return;
      event.stopPropagation();
      focusPreview();
    };
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("focusin", onFocus, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("focusin", onFocus, true);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [preview]);

  const generate = async () => {
    if (disabled || generationLock.current || preview) return;
    generationLock.current = true;
    setGenerating(true);
    let container: HTMLDivElement | null = null;
    let canvas: HTMLCanvasElement | null = null;
    try {
      // Capture real parent data and copy every row BEFORE the first await.
      const current = getSnapshot();
      const snapshot: Snapshot = { ...current, rows: current.rows.map(row => ({ ...row })) };
      if (!snapshot.reconciled || !snapshot.rows.length) {
        toast.error("请等待充值明细完整读取并核对一致后再下载");
        return;
      }
      const screenshotTime = formatScreenshotTime(new Date());
      const prepared = prepareExport(snapshot, screenshotTime);
      container = prepared.container;
      temporaryDom.current = container;
      document.body.appendChild(container);
      const [{ default: html2canvas }, brandUrl, avatarUrl] = await Promise.all([
        import("html2canvas-pro"), safeImageDataUrl("/bottomnav-avatar-r1.jpg"), safeImageDataUrl(snapshot.avatar),
      ]);
      if (!mounted.current) return;
      replaceWithImage(prepared.brand, brandUrl, "R1");
      replaceWithImage(prepared.avatar, avatarUrl, `${snapshot.memberName}头像`);
      await document.fonts.ready;
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      if (!mounted.current) return;
      const imageWidth = Math.ceil(Math.max(IMAGE_WIDTH, container.scrollWidth));
      const imageHeight = Math.ceil(Math.max(container.scrollHeight, container.getBoundingClientRect().height));
      if (!(imageHeight > 0)) throw new Error("充值明细图片布局未完成");
      appendWatermark(container, `R1｜${screenshotTime}（北京时间）`, imageHeight);
      const scale = Math.min(2, Math.sqrt(12_000_000 / Math.max(1, imageWidth * imageHeight)), 16000 / Math.max(imageWidth, imageHeight));
      canvas = await html2canvas(container, {
        scale, backgroundColor: "#ffffff", logging: false, useCORS: true, allowTaint: false,
        scrollX: 0, scrollY: 0, width: imageWidth, height: imageHeight,
        windowWidth: window.innerWidth, windowHeight: window.innerHeight,
      });
      if (!mounted.current) return;
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas!.toBlob(value => value ? resolve(value) : reject(new Error("图片生成失败")), "image/png");
      });
      if (!mounted.current) return;
      const title = `${snapshot.memberName} · 团队充值明细`;
      const filename = `${snapshot.memberName}-团队充值明细-${screenshotTime.replace(/[ :]/g, "-")}.png`.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-");
      setPreview({ blob, url: URL.createObjectURL(blob), filename, title });
    } catch (error) {
      console.error("团队充值明细图片生成失败", error);
      if (mounted.current) toast.error("图片生成失败，请稍后重试");
    } finally {
      container?.remove();
      if (temporaryDom.current === container) temporaryDom.current = null;
      if (canvas) { canvas.width = 0; canvas.height = 0; }
      generationLock.current = false;
      if (mounted.current) setGenerating(false);
    }
  };

  const save = async () => {
    if (!preview || saveLock.current) return;
    saveLock.current = true;
    setSaving(true);
    try {
      const file = new File([preview.blob], preview.filename, { type: "image/png" });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        try { await navigator.share({ files: [file], title: preview.title }); return; }
        catch (error) {
          if (typeof error === "object" && error !== null && "name" in error && error.name === "AbortError") return;
        }
      }
      if (!mounted.current) return;
      const link = document.createElement("a");
      link.href = preview.url;
      link.download = preview.filename;
      document.body.appendChild(link);
      try { link.click(); } finally { link.remove(); }
    } catch {
      if (mounted.current) toast.error("保存失败，可长按预览图片保存");
    } finally {
      saveLock.current = false;
      if (mounted.current) setSaving(false);
    }
  };

  return <>
    <button
      type="button" data-testid="t0-team-deposit-download"
      title="下载团队充值明细图片" aria-label="下载团队充值明细图片" aria-busy={generating}
      disabled={disabled || generating || Boolean(preview)}
      onClick={event => { event.preventDefault(); event.stopPropagation(); void generate(); }}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {generating ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
    </button>
    {preview && createPortal(<div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-3"
      onClick={event => { event.stopPropagation(); if (event.target === event.currentTarget) setPreview(null); }}
    >
      <div ref={previewRef} role="dialog" aria-modal="true" aria-label="团队充值明细图片预览" tabIndex={-1}
        className="mx-auto flex max-h-[90dvh] min-h-0 w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
        onClick={event => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <span className="min-w-0 truncate text-sm font-semibold text-slate-900">团队充值明细图片</span>
          <button ref={closeRef} type="button" data-testid="t0-team-deposit-image-close" aria-label="关闭图片预览"
            onClick={() => setPreview(null)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500"
          ><X className="h-4 w-4" /></button>
        </header>
        <div className="min-h-0 flex-1 overflow-auto overscroll-contain bg-slate-50 p-2">
          <img data-testid="t0-team-deposit-image-preview" src={preview.url} alt={preview.title} className="block h-auto w-full" />
        </div>
        <footer className="shrink-0 border-t border-slate-100 p-3">
          <button type="button" data-testid="t0-team-deposit-image-save" disabled={saving} aria-busy={saving}
            onClick={() => void save()} className="w-full rounded-lg bg-sky-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >{saving ? "保存中…" : "保存 / 分享图片"}</button>
          <p className="mt-2 text-center text-[10px] text-slate-500">手机也可长按上方图片保存</p>
        </footer>
      </div>
    </div>, document.body)}
  </>;
}

export default T0TeamDepositImageDownload;
