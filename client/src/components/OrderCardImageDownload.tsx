import React, { useState } from "react";
import html2canvas from "html2canvas";
import { Download, LoaderCircle } from "lucide-react";
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

function addTransparentShadow(source: HTMLCanvasElement, scale: number): HTMLCanvasElement {
  const padding = Math.round(14 * scale);
  const output = document.createElement("canvas");
  output.width = source.width + padding * 2;
  output.height = source.height + padding * 2;
  const context = output.getContext("2d");
  if (!context) return source;

  context.clearRect(0, 0, output.width, output.height);
  context.save();
  context.shadowColor = "rgba(15, 23, 42, 0.22)";
  context.shadowBlur = 10 * scale;
  context.shadowOffsetY = 4 * scale;
  context.drawImage(source, padding, padding);
  context.restore();
  return output;
}

async function shareOrDownloadImage(blob: Blob, filename: string): Promise<void> {
  const file = new File([blob], filename, { type: "image/png" });
  const shareData: ShareData = { files: [file], title: "订单快照" };

  if (navigator.share && navigator.canShare?.(shareData)) {
    try {
      await navigator.share(shareData);
      toast.success("图片已生成");
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
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
  toast.success("图片已下载，请在下载内容中保存到相册");
}

export function OrderCardImageDownload({
  targetRef,
  currentUser,
  orderNo,
  color = "#64748B",
}: OrderCardImageDownloadProps) {
  const [saving, setSaving] = useState(false);

  const handleSave = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const target = targetRef.current;
    if (!target || saving) return;

    setSaving(true);
    const token = `order-card-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    target.setAttribute("data-card-export-target", token);
    const timestamp = formatBeijingTime(new Date());
    const watermarkText = `${getSaverLabel(currentUser || getStoredSnapshotUser())}｜${timestamp}`;
    const rect = target.getBoundingClientRect();
    const scale = 2;

    try {
      if (document.fonts?.ready) await document.fonts.ready;
      const canvas = await html2canvas(target, {
        backgroundColor: null,
        scale,
        logging: false,
        useCORS: true,
        allowTaint: false,
        imageTimeout: 4000,
        ignoreElements: element => element instanceof HTMLElement && element.hasAttribute(EXPORT_HIDE_ATTRIBUTE),
        onclone: clonedDocument => {
          const clonedTarget = clonedDocument.querySelector(`[data-card-export-target="${token}"]`) as HTMLElement | null;
          if (!clonedTarget) return;
          clonedTarget.querySelectorAll(`[${EXPORT_HIDE_ATTRIBUTE}]`).forEach(element => element.remove());
          if (getComputedStyle(clonedTarget).position === "static") clonedTarget.style.position = "relative";

          const watermark = clonedDocument.createElement("div");
          watermark.setAttribute("data-card-export-watermark", "true");
          Object.assign(watermark.style, {
            position: "absolute",
            inset: "0",
            overflow: "hidden",
            borderRadius: "inherit",
            pointerEvents: "none",
            zIndex: "1000",
          });

          const rowStep = 78;
          const columnStep = 245;
          for (let y = -45, row = 0; y < rect.height + 80; y += rowStep, row += 1) {
            const startX = row % 2 === 0 ? -120 : -245;
            for (let x = startX; x < rect.width + 180; x += columnStep) {
              const label = clonedDocument.createElement("span");
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
        },
      });

      const output = addTransparentShadow(canvas, scale);
      const blob = await canvasToBlob(output);
      const compactTime = timestamp.replace(/[-:]/g, "").replace(" ", "-");
      const filename = `订单-${sanitizeFilename(String(orderNo || "快照"))}-${compactTime}.png`;
      await shareOrDownloadImage(blob, filename);
    } catch (error) {
      console.error("保存订单图片失败", error);
      toast.error("图片生成失败，请重试");
    } finally {
      target.removeAttribute("data-card-export-target");
      setSaving(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleSave}
      disabled={saving}
      data-card-export-hide="true"
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition active:scale-95 disabled:opacity-60"
      style={{
        color,
        background: "rgba(255,255,255,0.35)",
        border: "1px solid rgba(148,163,184,0.28)",
      }}
      title="保存为图片"
      aria-label="保存订单图片"
    >
      {saving ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
    </button>
  );
}
