import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Download, LoaderCircle, X } from 'lucide-react';
import { toast } from 'sonner';

type ExportContext = { stockName: string; stockCode: string; asOf?: string | null; latestPrice?: number | null; quoteDate?: string | null; priceChange?: number | null; percentChange?: number | null };
type ImagePreview = { blob: Blob; url: string; filename: string };
const StockExportContext = createContext<ExportContext>({ stockName: '', stockCode: '' });

export function StockSectionImageExportProvider({ children, ...identity }: ExportContext & { children: ReactNode }) {
  return <StockExportContext.Provider value={identity}>{children}</StockExportContext.Provider>;
}

function readableDate(value?: string | null) {
  if (!value) return '';
  return /^\d{8}$/.test(value) ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}` : value;
}

/** Match the existing order-export R1 watermark: Beijing time to seconds, faint diagonal tiles. */
function formatScreenshotTime(date: Date) {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const value = (type: string) => parts.find(part => part.type === type)?.value || '';
  return `${value('year')}-${value('month')}-${value('day')} ${value('hour')}:${value('minute')}:${value('second')}`;
}

function appendR1TimeWatermark(container: HTMLElement, text: string, width: number, height: number) {
  const watermark = document.createElement('div');
  watermark.setAttribute('data-card-export-watermark', 'true');
  Object.assign(watermark.style, { position: 'absolute', inset: '0', overflow: 'hidden', pointerEvents: 'none', zIndex: '2147483646' });
  for (let y = -45, row = 0; y < height + 80; y += 78, row++) {
    for (let x = row % 2 === 0 ? -120 : -245; x < width + 180; x += 245) {
      const label = document.createElement('span');
      label.textContent = text;
      Object.assign(label.style, {
        position: 'absolute', left: `${x}px`, top: `${y}px`, color: 'rgba(51, 65, 85, 0.07)',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", fontSize: '11px',
        fontWeight: '600', letterSpacing: '0.02em', lineHeight: '1', whiteSpace: 'nowrap',
        textShadow: '0 1px 0 rgba(255,255,255,0.45)', transform: 'rotate(-22deg)', transformOrigin: 'left top',
      });
      watermark.appendChild(label);
    }
  }
  container.appendChild(watermark);
}

/** Expand scrollable charts only in the temporary export clone, without changing the live page. */
function prepareSectionClone(source: HTMLElement) {
  const clone = source.cloneNode(true) as HTMLElement;
  const originals = [source, ...Array.from(source.querySelectorAll<HTMLElement>('*'))];
  const copies = [clone, ...Array.from(clone.querySelectorAll<HTMLElement>('*'))];
  let width = Math.ceil(source.getBoundingClientRect().width);
  for (let index = 0; index < originals.length; index++) {
    const original = originals[index];
    const copy = copies[index];
    if (!copy) continue;
    copy.style.setProperty('animation', 'none', 'important');
    copy.style.setProperty('transition', 'none', 'important');
    const style = getComputedStyle(original);
    if (['auto', 'scroll'].includes(style.overflowX) && original.scrollWidth > original.clientWidth) {
      const expandedWidth = Math.ceil(original.scrollWidth);
      width = Math.max(width, expandedWidth + 32);
      copy.style.setProperty('overflow-x', 'visible', 'important');
      copy.style.setProperty('width', `${expandedWidth}px`, 'important');
      copy.style.setProperty('max-width', 'none', 'important');
      copy.scrollLeft = 0;
    }
    if (['auto', 'scroll'].includes(style.overflowY) && original.scrollHeight > original.clientHeight) {
      copy.style.setProperty('overflow-y', 'visible', 'important');
      copy.style.setProperty('height', 'auto', 'important');
      copy.style.setProperty('max-height', 'none', 'important');
    }
    if (original instanceof HTMLCanvasElement && copy instanceof HTMLCanvasElement) {
      const image = document.createElement('img');
      image.src = original.toDataURL('image/png');
      image.width = original.width;
      image.height = original.height;
      image.style.cssText = copy.style.cssText;
      copy.replaceWith(image);
    }
  }
  clone.querySelectorAll('[data-stock-export-hide], [data-summary-export-hide]').forEach(node => node.remove());
  clone.style.setProperty('width', '100%', 'important');
  clone.style.setProperty('max-width', 'none', 'important');
  clone.style.setProperty('margin', '0', 'important');
  return { clone, width };
}

/** Export only the nearest marked section, preserving the selected period and current expanded state. */
export function StockSectionImageDownload({ title }: { title: string }) {
  const identity = useContext(StockExportContext);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<ImagePreview | null>(null);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);

  const generate = async (source: HTMLElement) => {
    if (generating) return;
    setGenerating(true);
    const screenshotTime = formatScreenshotTime(new Date());
    let container: HTMLDivElement | null = null;
    try {
      const { default: html2canvas } = await import('html2canvas-pro');
      const { clone, width } = prepareSectionClone(source);
      container = document.createElement('div');
      Object.assign(container.style, {
        position: 'fixed', top: '0', left: '-10000px', width: `${width + 24}px`,
        padding: '12px', boxSizing: 'border-box', background: '#FAF3ED',
        color: '#44342C', fontFamily: getComputedStyle(source).fontFamily,
        pointerEvents: 'none', zIndex: '-1',
      });
      const header = document.createElement('div');
      header.style.cssText = 'font-size:13px;font-weight:600;line-height:1.5;margin-bottom:8px;';
      header.textContent = [identity.stockName, identity.stockCode, title].filter(Boolean).join(' · ');
      container.appendChild(header);
      const quote = document.createElement('div');
      quote.style.cssText = 'font-size:12px;line-height:1.5;color:#44342C;margin-bottom:4px;display:flex;flex-wrap:wrap;gap:4px 12px;';
      const hasPrice = typeof identity.latestPrice === 'number' && Number.isFinite(identity.latestPrice) && identity.latestPrice > 0;
      // This AI page uses completed daily candles, not a real-time intraday quote.
      const price = document.createElement('span');
      price.textContent = hasPrice ? `最新收盘价 ${identity.latestPrice!.toFixed(2)} 元` : '最新收盘价待更新';
      quote.appendChild(price);
      for (const metric of [
        { label: '涨跌', value: identity.priceChange, unit: '元' },
        { label: '涨跌幅', value: identity.percentChange, unit: '%' },
      ]) {
        const span = document.createElement('span');
        const known = typeof metric.value === 'number' && Number.isFinite(metric.value);
        const value = known ? Number(metric.value!.toFixed(2)) : null;
        span.style.color = value === null || value === 0 ? '#8A7B70' : value > 0 ? '#D32F2F' : '#00B050';
        span.style.fontWeight = '600';
        span.textContent = `${metric.label} ${value === null ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(2)}${metric.unit}`}`;
        quote.appendChild(span);
      }
      container.appendChild(quote);
      const quoteTime = document.createElement('div');
      quoteTime.style.cssText = 'font-size:11px;line-height:1.5;color:#8A7B70;margin-bottom:6px;';
      quoteTime.textContent = identity.quoteDate ? `${readableDate(identity.quoteDate)} 15:00收盘（北京时间）` : '行情时间待更新';
      container.appendChild(quoteTime);
      if (identity.asOf) {
        const cutoff = document.createElement('div');
        cutoff.style.cssText = 'font-size:11px;line-height:1.5;color:#8A7B70;margin-bottom:10px;';
        cutoff.textContent = `统计截至 ${readableDate(identity.asOf)}`;
        container.appendChild(cutoff);
      }
      container.appendChild(clone);
      const stamp = document.createElement('div');
      stamp.style.cssText = 'font-size:10px;line-height:1.5;color:#8A7B70;text-align:right;margin-top:6px;';
      stamp.textContent = `R1｜截图时间 ${screenshotTime}（北京时间）`;
      container.appendChild(stamp);
      document.body.appendChild(container);
      await document.fonts.ready;
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      const imageWidth = Math.ceil(container.getBoundingClientRect().width);
      const imageHeight = Math.ceil(container.scrollHeight);
      appendR1TimeWatermark(container, `R1｜${screenshotTime}`, imageWidth, imageHeight);
      const scale = Math.min(2, Math.sqrt(12_000_000 / Math.max(1, imageWidth * imageHeight)), 16000 / Math.max(imageWidth, imageHeight));
      const canvas = await html2canvas(container, {
        scale, backgroundColor: '#FAF3ED', logging: false, useCORS: true,
        scrollX: 0, scrollY: 0, width: imageWidth, height: imageHeight,
        windowWidth: Math.max(window.innerWidth, imageWidth),
        windowHeight: Math.max(window.innerHeight, imageHeight),
      });
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('图片生成失败')), 'image/png'));
      const timestamp = screenshotTime.replace(/[ :]/g, '-');
      const filename = `${identity.stockName}-${identity.stockCode}-${title}-${timestamp}.png`.replace(/[\\/:*?"<>|]/g, '-');
      setPreview({ blob, url: URL.createObjectURL(blob), filename });
    } catch (error) {
      console.error('个股区域图片生成失败', error);
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
        try { await navigator.share({ files: [file], title: `${identity.stockName} · ${title}` }); return; }
        catch (error) { if (error instanceof DOMException && error.name === 'AbortError') return; }
      }
      const link = document.createElement('a');
      link.href = preview.url;
      link.download = preview.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      toast.error('保存失败，可长按预览图片保存');
    } finally { setSaving(false); }
  };

  return <>
    <button
      type="button" data-stock-export-hide="true" title={`下载${title}图片`} aria-label={`下载${title}图片`}
      disabled={generating}
      onClick={event => {
        event.preventDefault();
        event.stopPropagation();
        const section = event.currentTarget.closest<HTMLElement>('[data-stock-export-section]');
        if (section) void generate(section);
        else toast.error('未找到可下载的区域');
      }}
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#AA9080] hover:bg-[#FAF3ED] disabled:opacity-50"
    >
      {generating ? <LoaderCircle size={15} className="animate-spin" /> : <Download size={15} />}
    </button>
    {preview && createPortal(<div role="dialog" aria-modal="true" aria-label={`${title}图片预览`} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-3" onClick={() => setPreview(null)}>
      <div className="mx-auto flex max-h-full min-h-0 w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white" onClick={event => event.stopPropagation()}>
        <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
          <span className="min-w-0 truncate text-sm font-semibold text-[#44342C]">{title}图片</span>
          <button type="button" onClick={() => setPreview(null)} aria-label="关闭图片预览"><X size={20} /></button>
        </div>
        <div className="min-h-0 overflow-auto bg-[#FAF3ED] p-2"><img src={preview.url} alt={`${identity.stockName} ${title}区域图片`} className="block h-auto w-full" /></div>
        <div className="shrink-0 border-t p-3">
          <button type="button" disabled={saving} onClick={() => void save()} className="w-full rounded-lg bg-[#C62828] py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? '保存中…' : '保存 / 分享图片'}</button>
          <p className="mt-2 text-center text-[10px] text-gray-400">手机也可长按上方图片保存</p>
        </div>
      </div>
    </div>, document.body)}
  </>;
}
