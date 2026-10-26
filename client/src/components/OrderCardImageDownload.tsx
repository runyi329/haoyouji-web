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
  outerPadding?: number;
  captureFullContent?: boolean;
  /** 长内容截图额外保留的横向安全留白；默认16px，传0可实现四边等宽。 */
  fullContentHorizontalBleed?: number;
  /** 长内容截图底部额外安全留白；默认16px，传0可与外侧白边严格等宽。 */
  fullContentBottomPadding?: number;
  exportBackground?: string;
  /** 卡片页眉使用无圆形容器的纯下载箭头；其他入口保持默认样式。 */
  variant?: "default" | "bare";
  /** 默认同时显示保存者和时间；可改为只显示截图时间。 */
  watermarkMode?: "user-and-time" | "time-only";
  /** 指定水印中的保存者名称；传入时始终与截图时间一起显示。旧版固定R1会自动回退为实际保存者。 */
  watermarkLabel?: string;
  /** 水印文字不透明度；默认保持卡片下载的轻量水印。 */
  watermarkOpacity?: number;
  /** 导出文件名前缀，默认沿用订单图片。 */
  filenamePrefix?: string;
  /** 图片预览窗口标题。 */
  previewTitle?: string;
  /** 图片预览窗口说明。 */
  previewHint?: string;
  /** 显示为带文字的下载按钮。 */
  buttonLabel?: string;
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
  // 水印重复铺满图片时只保留操作人的显示名，既可追溯又避免“姓名（用户名）”过长遮挡账目。
  return displayName;
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

function createExactSnapshotContainer(
  target: HTMLElement,
  watermarkText: string,
  outerPadding: number,
  measureAfterAssets: boolean,
  fullContentHorizontalBleed: number,
  exportBackground?: string,
  watermarkOpacity = 0.07,
  fullContentBottomPadding?: number,
) {
  const rect = target.getBoundingClientRect();
  const sourceFullHeight = Math.max(rect.height, target.scrollHeight);
  // 全内容账页导出额外保留水平出血区：移动端金额、分隔线或阴影即使贴近边缘，
  // 也不会在最终图片的左右两侧被画布裁掉。
  const resolvedHorizontalBleed = Number.isFinite(fullContentHorizontalBleed)
    ? Math.max(0, fullContentHorizontalBleed)
    : 16;
  const horizontalPadding = outerPadding + (measureAfterAssets ? resolvedHorizontalBleed : 0);
  const verticalPadding = outerPadding;
  const resolvedBottomPadding = measureAfterAssets
    ? (Number.isFinite(fullContentBottomPadding) ? Math.max(0, Number(fullContentBottomPadding)) : 16)
    : 0;
  const clonedTarget = target.cloneNode(true) as HTMLElement;
  copyRenderedStyles(target, clonedTarget);
  if (exportBackground) {
    clonedTarget.style.background = exportBackground;
    clonedTarget.style.boxShadow = "none";
  }

  // 导出图必须和用户端/预览态一致：管理、编辑及下载控件不仅不可见，也不能保留空白占位。
  // 先完成样式拷贝，再删除克隆节点，避免源卡片的交互区域被影响。
  const exportHiddenElements = Array.from(clonedTarget.querySelectorAll<HTMLElement>(`[${EXPORT_HIDE_ATTRIBUTE}]`));
  const hasCollapsedExportContent = exportHiddenElements.length > 0;
  exportHiddenElements.forEach(element => element.remove());

  // 固定当前卡片宽度，但先释放源节点计算出的固定高度，允许备注等展开内容完整撑开。
  clonedTarget.style.width = `${rect.width}px`;
  clonedTarget.style.minWidth = `${rect.width}px`;
  clonedTarget.style.maxWidth = `${rect.width}px`;
  clonedTarget.style.height = "auto";
  clonedTarget.style.minHeight = hasCollapsedExportContent ? "0" : `${sourceFullHeight}px`;
  clonedTarget.style.maxHeight = "none";
  clonedTarget.style.margin = "0";
  clonedTarget.style.position = "relative";
  clonedTarget.style.transform = "none";
  clonedTarget.style.transformOrigin = "top left";
  clonedTarget.style.overflow = "visible";

  const container = document.createElement("div");
  Object.assign(container.style, {
    position: "fixed",
    left: "0",
    top: "0",
    zIndex: "-2147483647",
    width: `${rect.width + horizontalPadding * 2}px`,
    height: "auto",
    padding: `${verticalPadding}px ${horizontalPadding}px`,
    boxSizing: "border-box",
    // 外侧安全边距使用与账页一致的底色，避免 PNG 透明区在预览棋盘背景上
    // 被误认为左右内容遭到裁切。
    background: exportBackground || "transparent",
    pointerEvents: "none",
    overflow: "visible",
  });
  container.appendChild(clonedTarget);
  document.body.appendChild(container);

  const finalizeSnapshot = () => {
    // 卡片模式在字体、图片和两帧布局稳定后再测量完整内容边界，避免底部控制行被过早测量裁切。
    const renderedRect = clonedTarget.getBoundingClientRect();
    const renderedContentBottom = measureAfterAssets
      ? Array.from(clonedTarget.querySelectorAll<HTMLElement>("*")).reduce((bottom, element) => {
          if (window.getComputedStyle(element).position === "fixed") return bottom;
          const elementRect = element.getBoundingClientRect();
          return Math.max(bottom, elementRect.bottom - renderedRect.top);
        }, renderedRect.height)
      : 0;
    // 全内容账页可能位于滚动弹窗内；以克隆后所有子元素的最远底部为准，
    // 并给底部账目留出安全空白，避免长流水在画布边缘被裁掉。
    const fullHeight = Math.ceil(Math.max(
      hasCollapsedExportContent ? 0 : sourceFullHeight,
      clonedTarget.scrollHeight,
      renderedRect.height,
      renderedContentBottom,
    ) + resolvedBottomPadding);

    if (measureAfterAssets) {
      // 全内容模式固定为已测得的完整高度，但不裁切溢出内容；
      // 这样滚动弹窗中的长流水也能全部进入导出画布。
      clonedTarget.style.height = `${fullHeight}px`;
      clonedTarget.style.minHeight = `${fullHeight}px`;
      clonedTarget.style.maxHeight = "none";
      clonedTarget.style.overflow = "visible";
    } else {
      // 订单模式沿用原来的固定尺寸镜像逻辑。
      clonedTarget.style.height = `${fullHeight}px`;
      clonedTarget.style.minHeight = `${fullHeight}px`;
      clonedTarget.style.maxHeight = "none";
      clonedTarget.style.overflow = "hidden";
    }
    container.style.height = `${fullHeight + verticalPadding * 2}px`;

    clonedTarget.querySelector<HTMLElement>("[data-card-export-watermark]")?.remove();
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

    const resolvedWatermarkOpacity = Number.isFinite(watermarkOpacity)
      ? Math.min(0.2, Math.max(0.01, watermarkOpacity))
      : 0.07;
    const rowStep = 78;
    const columnStep = 245;
    for (let y = -45, row = 0; y < fullHeight + 80; y += rowStep, row += 1) {
      const startX = row % 2 === 0 ? -120 : -245;
      for (let x = startX; x < rect.width + 180; x += columnStep) {
        const label = document.createElement("span");
        label.textContent = watermarkText;
        Object.assign(label.style, {
          position: "absolute",
          left: `${x}px`,
          top: `${y}px`,
          color: `rgba(51, 65, 85, ${resolvedWatermarkOpacity})`,
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

    return {
      width: rect.width + horizontalPadding * 2,
      height: fullHeight + verticalPadding * 2,
    };
  };

  const initialSize = measureAfterAssets ? null : finalizeSnapshot();
  return { container, clonedTarget, finalizeSnapshot, initialSize };
}

type SaveResult = "shared" | "downloaded" | "cancelled";

async function shareOrDownloadImage(blob: Blob, filename: string): Promise<SaveResult> {
  const file = new File([blob], filename, { type: "image/png" });
  const shareData: ShareData = { files: [file], title: filename.replace(/\.png$/i, "") };

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
  outerPadding = 16,
  captureFullContent = false,
  fullContentHorizontalBleed = 16,
  fullContentBottomPadding,
  exportBackground,
  variant = "default",
  watermarkMode = "user-and-time",
  watermarkLabel,
  watermarkOpacity = 0.07,
  filenamePrefix = "订单",
  previewTitle = "订单图片预览",
  previewHint = "预览与当前页面卡片使用同一张图片",
  buttonLabel,
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
    const requestedWatermarkLabel = String(watermarkLabel || "").trim();
    // 旧入口曾以“R1”覆盖操作者身份。所有账本截图都应记录实际保存者，
    // 因此保留业务自定义文字的兼容性，但不再接受固定R1作为水印主体。
    const saverLabel = requestedWatermarkLabel && requestedWatermarkLabel.toUpperCase() !== "R1"
      ? requestedWatermarkLabel
      : (watermarkMode === "time-only" ? "" : getSaverLabel(currentUser || getStoredSnapshotUser()));
    const watermarkText = saverLabel ? `${saverLabel}｜${timestamp}` : timestamp;
    const scale = 2;
    let snapshotContainer: HTMLElement | null = null;

    try {
      const snapshot = createExactSnapshotContainer(target, watermarkText, outerPadding, captureFullContent, fullContentHorizontalBleed, exportBackground, watermarkOpacity, fullContentBottomPadding);
      snapshotContainer = snapshot.container;
      await waitForSnapshotAssets(snapshot.clonedTarget);
      const snapshotSize = snapshot.initialSize ?? snapshot.finalizeSnapshot();

      const canvas = await html2canvas(snapshot.container, {
        backgroundColor: null,
        scale,
        logging: false,
        useCORS: true,
        allowTaint: false,
        imageTimeout: 8000,
        removeContainer: true,
        width: Math.ceil(snapshotSize.width),
        height: Math.ceil(snapshotSize.height),
        windowWidth: Math.max(window.innerWidth, Math.ceil(snapshotSize.width)),
        windowHeight: Math.max(window.innerHeight, Math.ceil(snapshotSize.height)),
        scrollX: 0,
        scrollY: 0,
      });

      const blob = await canvasToBlob(canvas);
      const compactTime = timestamp.replace(/[-:]/g, "").replace(" ", "-");
      const filename = `${sanitizeFilename(filenamePrefix || "快照")}-${sanitizeFilename(String(orderNo || "快照"))}-${compactTime}.png`;
      const url = URL.createObjectURL(blob);
      setPreview(current => {
        if (current?.url) URL.revokeObjectURL(current.url);
        return { blob, url, filename };
      });
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
            <div className="text-base font-semibold text-slate-800">{previewTitle}</div>
            <div className="mt-0.5 text-xs text-slate-400">{previewHint}</div>
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
        className={buttonLabel
          ? "inline-flex h-7 shrink-0 items-center justify-center gap-1 rounded-lg px-2 text-xs font-medium transition active:scale-95 disabled:opacity-60"
          : variant === "bare"
            ? "inline-flex h-5 w-5 shrink-0 items-center justify-center transition active:scale-95 disabled:opacity-60"
            : "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition active:scale-95 disabled:opacity-60"}
        style={buttonLabel || variant !== "bare"
          ? {
              color,
              background: "rgba(255,255,255,0.72)",
              border: "1px solid rgba(148,163,184,0.28)",
            }
          : { color }}
        title={buttonLabel || "预览并保存图片"}
        aria-label={buttonLabel || previewTitle}
      >
        {generating ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        {buttonLabel ? <span>{generating ? "生成中" : buttonLabel}</span> : null}
      </button>
      {previewModal}
    </>
  );
}
