import { useEffect, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Download, LoaderCircle, X } from 'lucide-react';
import { toast } from 'sonner';

type ImagePreview = { blob: Blob; url: string; filename: string };

/** Rasterize the existing numeric conic charts, which canvas screenshot libraries do not support. */
function prepareChartBackgrounds(root: HTMLElement) {
  for (const node of [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))]) {
    const background = getComputedStyle(node).backgroundImage;
    if (!background.startsWith('conic-gradient(')) continue;
    const stops = Array.from(background.matchAll(/(#[\da-fA-F]{3,8}|rgba?\([^)]*\))\s+([\d.e+\-]+)%\s+([\d.e+\-]+)%/g));
    if (!stops.length) continue;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 384;
    const context = canvas.getContext('2d');
    if (!context) continue;
    const from = Number(background.match(/from\s+([\d.\-]+)deg/)?.[1] || 0);
    const offset = (from - 90) * Math.PI / 180;
    for (const stop of stops) {
      context.beginPath();
      context.moveTo(192, 192);
      context.arc(192, 192, 192, Number(stop[2]) / 100 * Math.PI * 2 + offset, Number(stop[3]) / 100 * Math.PI * 2 + offset);
      context.closePath();
      context.fillStyle = stop[1];
      context.fill();
    }
    node.style.backgroundImage = `url("${canvas.toDataURL('image/png')}")`;
    node.style.backgroundSize = '100% 100%';
    node.style.backgroundRepeat = 'no-repeat';
  }
}

export function StockSummaryImageDownload({ targetRef, title }: { targetRef: RefObject<HTMLDetailsElement | null>; title: string }) {
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<ImagePreview | null>(null);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);

  const generate = async () => {
    const target = targetRef.current;
    if (!target || generating) return;
    setGenerating(true);
    let container: HTMLDivElement | null = null;
    try {
      const { default: html2canvas } = await import('html2canvas-pro');
      container = document.createElement('div');
      Object.assign(container.style, { position: 'fixed', top: '0', left: '-10000px', width: `${Math.ceil(target.getBoundingClientRect().width) + 24}px`, padding: '12px', boxSizing: 'border-box', background: '#FAF3ED', pointerEvents: 'none', zIndex: '-1' });
      const clone = target.cloneNode(true) as HTMLDetailsElement;
      clone.open = true;
      clone.querySelectorAll('[data-summary-export-hide]').forEach(node => node.remove());
      clone.querySelectorAll('details').forEach(node => { node.open = true; });
      clone.querySelectorAll<HTMLElement>('*').forEach(node => { node.style.transition = 'none'; node.style.animation = 'none'; });
      container.appendChild(clone);
      document.body.appendChild(container);
      await document.fonts.ready;
      prepareChartBackgrounds(clone);
      const canvas = await html2canvas(container, { scale: 2, backgroundColor: '#FAF3ED', logging: false, useCORS: true, scrollX: 0, scrollY: 0, width: container.offsetWidth, height: container.scrollHeight, windowHeight: Math.max(window.innerHeight, container.scrollHeight) });
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('图片生成失败')), 'image/png'));
      const timestamp = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(new Date()).replace(/[ :]/g, '-');
      setPreview({ blob, url: URL.createObjectURL(blob), filename: `${title}-${timestamp}.png` });
    } catch (error) {
      console.error('汇总图片生成失败', error);
      toast.error('图片生成失败，请稍后重试');
    } finally {
      container?.remove();
      setGenerating(false);
    }
  };

  const save = async () => {
    if (!preview || saving) return;
    setSaving(true);
    try {
      const file = new File([preview.blob], preview.filename, { type: 'image/png' });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        try { await navigator.share({ files: [file], title }); return; }
        catch (error) { if (error instanceof DOMException && error.name === 'AbortError') return; }
      }
      const link = document.createElement('a');
      link.href = preview.url;
      link.download = preview.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } finally { setSaving(false); }
  };

  return <>
    <button type="button" data-summary-export-hide="true" title="下载汇总图片" aria-label={`下载${title}图片`} disabled={generating} onClick={event => { event.preventDefault(); event.stopPropagation(); void generate(); }} className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#AA9080] hover:bg-[#FAF3ED] disabled:opacity-50">
      {generating ? <LoaderCircle size={15} className="animate-spin" /> : <Download size={15} />}
    </button>
    {preview && createPortal(<div role="dialog" aria-modal="true" aria-label={`${title}图片预览`} className="fixed inset-0 z-[100] flex flex-col bg-black/70 p-3" onClick={() => setPreview(null)}>
      <div className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col overflow-hidden rounded-xl bg-white" onClick={event => event.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3"><span className="text-sm font-semibold text-[#44342C]">{title}图片</span><button type="button" onClick={() => setPreview(null)} aria-label="关闭图片预览"><X size={20} /></button></div>
        <div className="min-h-0 flex-1 overflow-y-auto bg-[#FAF3ED] p-2"><img src={preview.url} alt={`${title}完整汇总图片`} className="h-auto w-full" /></div>
        <div className="border-t p-3"><button type="button" disabled={saving} onClick={() => void save()} className="w-full rounded-lg bg-[#C62828] py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? '保存中…' : '保存 / 分享图片'}</button><p className="mt-2 text-center text-[10px] text-gray-400">手机也可长按上方图片保存</p></div>
      </div>
    </div>, document.body)}
  </>;
}
