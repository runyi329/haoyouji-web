import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import html2canvas from "html2canvas-pro";
import { Download, LoaderCircle, Share2, X } from "lucide-react";
import { toast } from "sonner";

type SnapshotUser = {
  id?: number | string;
  name?: string | null;
  nickname?: string | null;
  displayName?: string | null;
  username?: string | null;
};

interface OrderCardImageDownloadProps {
  targetRef: React.RefObject<HTMLElement | null>;
  currentUser?: SnapshotUser | null;
  orderNo?: string | number | null;
  color?: string;
}

type ImagePreview = {
  blob: Blob;
  url: string;
  filename: string;
};

const EXPORT_HIDE_ATTRIBUTE = "data-card-export-hide";

function formatBeijingTime(date: Date): string {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: "year" | "month" | "day" | "hour" | "minute" | "second") => parts.find(part => part.type === type)?.value || "";
  return `${value("year")}-${value("month")}-${value("day")} ${value("hour")}:${value("minute")}:${value("second")}`;
}

function getStoredSnapshotUser(): SnapshotUser | null {
  try {
    const raw = localStorage.getItem("manus-runtime-user-info");
    return raw ? JSON.parse(raw) as SnapshotUser : null;
  } catch {
    return null;
  }
}

function getSaverLabel(user?: SnapshotUser | null): string {
  if (!user) return "当前用户";
  const username = String(user.username || "").trim();
  const displayName = String(user.name || user.nickname || user.displayName || username || `用户${user.id || ""}`).trim();
  return username && username !== displayName ? `${displayName}（${username}）` : displayName;
}

function sanitizeFilename(value: string): string {
  return value.replace(/[\\/:*?"<>|\s]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("PNG生成失败")), "image/png");
  });
}

function copyRenderedStyles(sourceRoot: HTMLElement, clonedRoot: HTMLElement) {
  const sourceNodes = [sourceRoot, ...Array.from(sourceRoot.querySelectorAll<HTMLElement>("*"))];
  const clonedNodes = [clonedRoot, ...Array.from(clonedRoot.querySelectorAll<HTMLElement>("*"))];
  const count = Math.min(sourceNodes.length, clonedNodes.length);

  for (let index = 0; index < count; index += 1) {
    const source = sourceNodes[index];
    const cloned = clonedNodes[index];
    const computed = window.getComputedStyle(source);

    for (let propertyIndex = 0; propertyIndex < computed.length; propertyIndex += 1) {
      const property = computed.item(propertyIndex);
      const value = computed.getPropertyValue(property);
      if (value) cloned.style.setProperty(property, value, computed.getPropertyPriority(property));
    }

    cloned.style.animation = "none";
    cloned.style.transition = "none";
    cloned.style.caretColor = "transparent";

    if (source instanceof HTMLInputElement && cloned instanceof HTMLInputElement) {
      cloned.value = source.value;
      cloned.checked = source.checked;
    } else if (source instanceof HTMLTextAreaElement && cloned instanceof HTMLTextAreaElement) {
      cloned.value = source.value;
      cloned.textContent = source.value;
    } else if (source instanceof HTMLSelectElement && cloned instanceof HTMLSelectElement) {
      cloned.value = source.value;
    }

    if (source.scrollTop) cloned.scrollTop = source.scrollTop;
    if (source.scrollLeft) cloned.scrollLeft = source.scrollLeft;
  }
}

async function waitForSnapshotAssets(root: HTMLElement) {
  if (document.fonts?.ready) await document.fonts.ready;
  const images = Array.from(root.querySelectorAll<HTMLImageElement>("img"));
  await Promise.all(images.map(async image => {
    if (image.complete) {
      try { await image.decode(); } catch { /* 已完成但浏览器不支持decode */ }
      return;
    }
    await new Promise<void>(resolve => {
      const done = () => resolve();
      image.addEventListener("load", done, { once: true });
      image.addEventListener("error", done, { once: true });
      window.setTimeout(done, 5000);
    });
  }));
  await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

function createExactSnapshotContainer(target: HTMLElement, watermarkText: string) {
  const rect = target.getBoundingClientRect();
  const clonedTarget = target.cloneNode(true) as HTMLElement;
  copyRenderedStyles(target, clonedTarget);

  clonedTarget.querySelectorAll<HTMLElement>(`[${EXPORT_HIDE_ATTRIBUTE}]`).forEach(element => {
    element.style.visibility = "hidden";
    element.style.pointerEvents = "none";
  });

  clonedTarget.style.width = `${rect.width}px`;
  clonedTarget.style.minWidth = `${rect.width}px`;
  clonedTarget.style.maxWidth = `${rect.width}px`;
  clonedTarget.style.height = `${rect.height}px`;
  clonedTarget.style.minHeight = `${rect.height}px`;
  clonedTarget.style.maxHeight = `${rect.height}px`;
  clonedTarget.style.margin = "0";
  clonedTarget.style.position = "relative";
  clonedTarget.style.transform = "none";
  clonedTarget.style.transformOrigin = "top left";

  const watermark = document.createElement("div");
  watermark.setAttribute("data-card-export-watermark", "true");
  Object.assign(watermark.style, {
    position: "absolute",
    inset: "0",
    overflow: "hidden",
    borderRadius: window.getComputedStyle(target).borderRadius,
    pointerEvents: "none",
    zIndex: "2147483646",
  });

  const rowStep = 78;
  const columnStep = 245;
  for (let y = -45, row = 0; y < rect.height + 80; y += rowStep, row += 1) {
    const startX = row % 2 === 0 ? -120 : -245;
    for (let x = startX; x < rect.width + 180; x += columnStep) {
      const label = document.createElement("span");
      label.textContent = watermarkText;
      Object.assign(label.style, {
        position: "absolute",
        left: `${x}px`,
        top: `${y}px`,
        color: "rgba(51, 65, 85, 0.14)",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        fontSize: "11px",
        fontWeight: "600",
        letterSpacing: "0.02em",
        lineHeight: "1",
        whiteSpace: "nowrap",
        textShadow: "0 1px 0 rgba(255,255,255,0.45)",
        transform: "rotate(-22deg)",
        transformOrigin: "left top",
      });
      watermark.appendChild(label);
    }
  }
  clonedTarget.appendChild(watermark);

  const padding = 16;
  const container = document.createElement("div");
  Object.assign(container.style, {
    position: "fixed",
    left: "0",
    top: "0",
    zIndex: "-2147483647",
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    padding: `${padding}px`,
    boxSizing: "content-box",
    background: "transparent",
    pointerEvents: "none",
    overflow: "visible",
  });
  container.appendChild(clonedTarget);
  document.body.appendChild(container);

  return { container, clonedTarget, width: rect.width + padding * 2, height: rect.height + padding * 2 };
}

type SaveResult = "shared" | "downloaded" | "cancelled";

async function shareOrDownloadImage(blob: Blob, filename: string): Promise<SaveResult> {
  const file = new File([blob], filename, { type: "image/png" });
  const shareData: ShareData = { files: [file], title: "订单快照" };

  if (navigator.share) {
    try {
      const canShareFile = typeof navigator.canShare !== "function" || navigator.canShare(shareData);
      if (canShareFile) {
        await navigator.share(shareData);
        return "shared";
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return "downloaded";
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message.slice(0, 80);
  return "未知错误";
}

export function OrderCardImageDownload({
  targetRef,
  currentUser,
  orderNo,
  color = "#64748B",
}: OrderCardImageDownloadProps) {
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<ImagePreview | null>(null);

  const closePreview = () => {
    setPreview(current => {
      if (current?.url) URL.revokeObjectURL(current.url);
      return null;
    });
  };

  useEffect(() => () => {
    if (preview?.url) URL.revokeObjectURL(preview.url);
  }, [preview?.url]);

  const handleGeneratePreview = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const target = targetRef.current;
    if (!target || generating) return;

    setGenerating(true);
    const timestamp = formatBeijingTime(new Date());
    const watermarkText = `${getSaverLabel(currentUser || getStoredSnapshotUser())}｜${timestamp}`;
    const scale = 2;
    let snapshotContainer: HTMLElement | null = null;

    try {
      const snapshot = createExactSnapshotContainer(target, watermarkText);
      snapshotContainer = snapshot.container;
      await waitForSnapshotAssets(snapshot.clonedTarget);

      const canvas = await html2canvas(snapshot.container, {
        backgroundColor: null,
        scale,
        logging: false,
        useCORS: true,
        allowTaint: false,
        imageTimeout: 8000,
        removeContainer: true,
        width: Math.ceil(snapshot.width),
        height: Math.ceil(snapshot.height),
        windowWidth: Math.max(window.innerWidth, Math.ceil(snapshot.width)),
        windowHeight: Math.max(window.innerHeight, Math.ceil(snapshot.height)),
        scrollX: 0,
        scrollY: 0,
      });

      const blob = await canvasToBlob(canvas);
      const compactTime = timestamp.replace(/[-:]/g, "").replace(" ", "-");
      const filename = `订单-${sanitizeFilename(String(orderNo || "快照"))}-${compactTime}.png`;
      const url = URL.createObjectURL(blob);
      setPreview(current => {
        if (current?.url) URL.revokeObjectURL(current.url);
        return { blob, url, filename };
      });
      toast.success("图片预览已生成");
    } catch (error) {
      console.error("生成订单图片预览失败", error);
      toast.error(`图片生成失败：${getErrorMessage(error)}`);
    } finally {
      snapshotContainer?.remove();
      setGenerating(false);
    }
  };

  const handleConfirmSave = async () => {
    if (!preview || saving) return;
    setSaving(true);
    try {
      const result = await shareOrDownloadImage(preview.blob, preview.filename);
      if (result === "cancelled") return;
      toast.success(result === "shared" ? "已打开系统分享" : "图片已下载，请在下载内容中保存到相册");
      closePreview();
    } catch (error) {
      console.error("保存订单图片失败", error);
      toast.error(`图片保存失败：${getErrorMessage(error)}`);
    } finally {
      setSaving(false);
    }
  };

  const previewModal = preview && typeof document !== "undefined" ? createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/65 px-4 py-6"
      onClick={closePreview}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-[440px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={event => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div>
            <div className="text-base font-semibold text-slate-800">订单图片预览</div>
            <div className="mt-0.5 text-xs text-slate-400">预览与当前页面卡片使用同一张图片</div>
          </div>
          <button
            type="button"
            onClick={closePreview}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500"
            aria-label="关闭图片预览"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div
          className="min-h-0 flex-1 overflow-auto p-4"
          style={{
            backgroundColor: "#E2E8F0",
            backgroundImage: "linear-gradient(45deg, rgba(255,255,255,0.45) 25%, transparent 25%), linear-gradient(-45deg, rgba(255,255,255,0.45) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.45) 75%), linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.45) 75%)",
            backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px",
            backgroundSize: "16px 16px",
          }}
        >
          <img src={preview.url} alt="订单图片预览" className="mx-auto block h-auto max-w-full" />
        </div>
        <div className="grid grid-cols-2 gap-3 border-t border-slate-100 p-4">
          <button
            type="button"
            onClick={closePreview}
            disabled={saving}
            className="h-11 rounded-xl bg-slate-100 text-sm font-medium text-slate-600 disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleConfirmSave}
            disabled={saving}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
            {saving ? "保存中" : "保存／分享"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  ) : null;

  return (
    <>
      <button
        type="button"
        onClick={handleGeneratePreview}
        disabled={generating}
        data-card-export-hide="true"
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition active:scale-95 disabled:opacity-60"
        style={{
          color,
          background: "rgba(255,255,255,0.35)",
          border: "1px solid rgba(148,163,184,0.28)",
        }}
        title="预览并保存图片"
        aria-label="预览订单图片"
      >
        {generating ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
      </button>
      {previewModal}
    </>
  );
}
