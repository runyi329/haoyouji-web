import { useEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Download, LoaderCircle, X } from 'lucide-react';
import { toast } from 'sonner';
import { AI_STOCK_THEME } from '@/lib/ai-stock-theme';

type Props = {
  targetRef: RefObject<HTMLElement | null>;
  disabled?: boolean;
  periodLabel: string;
  marketLabel: string;
  windowStart: string | null;
  asOf: string | null;
  topN: number;
  dataUpdatedAt?: string | null;
};
type ImagePreview = { blob: Blob; url: string; filename: string; title: string };

function readableDate(value: string | null) {
  if (!value) return '未提供';
  const match = value.match(/^(\d{4})-?(\d{2})-?(\d{2})(?:$|T|\s)/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : value;
}

/** Same Beijing-time, second-precision R1 stamp as the existing section export. */
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
  Object.assign(watermark.style, {
    position: 'absolute', inset: '0', overflow: 'hidden', pointerEvents: 'none', zIndex: '2147483646',
  });
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

/** Synchronous click-time snapshot: no import, query, or later live-DOM reads here. */
function prepareRankingClone(source: HTMLElement) {
  const width = source.getBoundingClientRect().width;
  if (!(width > 0)) throw new Error('排行结果区域不可见');
  const fontFamily = getComputedStyle(source).fontFamily;
  // Safari's computed logical offsets and grid/display:contents cloning can overlap
  // all cells. Snapshot actual displayed names/percentages into a native table instead.
  const rows = Array.from(source.querySelectorAll<HTMLElement>('[data-testid="stock-return-row"]')).map(row => ({
    rank: Number(row.dataset.rank), direction: row.dataset.direction,
    name: row.children[0]?.textContent ?? '', percent: row.children[1]?.textContent ?? '',
    highlighted: row.dataset.highlighted === 'true',
  }));
  if (!rows.length) throw new Error('没有可导出的排行结果');
  const indexed = new Map(rows.map(row => [`${row.direction}-${row.rank}`, row]));
  const count = Math.max(...rows.map(row => row.rank));
  const headings = Array.from(source.querySelectorAll('h2')).map(h => h.textContent ?? '');
  const clone = document.createElement('div');
  clone.setAttribute('data-stock-ranking-export-table', 'true');
  Object.assign(clone.style, { width: `${width}px`, boxSizing: 'border-box', overflow: 'hidden', border: `1px solid ${AI_STOCK_THEME.border}`, borderRadius: '10px', background: AI_STOCK_THEME.card });
  const table = document.createElement('table');
  table.style.cssText = 'width:100%;table-layout:fixed;border-collapse:collapse;border-spacing:0;margin:0;font-size:12px;line-height:18px;';
  const head = table.createTHead().insertRow();
  for (const [index, heading] of headings.entries()) {
    const cell = document.createElement('th');
    cell.textContent = heading;
    Object.assign(cell.style, { width: '50%', padding: '9px 7px', textAlign: 'left', fontSize: '11px', fontWeight: '600', borderBottom: `1px solid ${AI_STOCK_THEME.border}`, borderLeft: index ? `1px solid ${AI_STOCK_THEME.border}` : 'none', color: index ? AI_STOCK_THEME.fall : AI_STOCK_THEME.rise });
    head.appendChild(cell);
  }
  const body = table.createTBody();
  for (let rank = 1; rank <= count; rank++) {
    const tr = body.insertRow();
    for (const direction of ['up', 'down'] as const) {
      const row = indexed.get(`${direction}-${rank}`);
      const td = tr.insertCell();
      Object.assign(td.style, { width: '50%', padding: '0', verticalAlign: 'middle', borderTop: rank > 1 ? `1px solid ${AI_STOCK_THEME.border}` : 'none', borderLeft: direction === 'down' ? `1px solid ${AI_STOCK_THEME.border}` : 'none' });
      const line = document.createElement('div');
      line.setAttribute('data-highlighted', String(row?.highlighted ?? false));
      Object.assign(line.style, { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px', minHeight: '36px', padding: '4px 8px', boxSizing: 'border-box', background: row?.highlighted ? 'linear-gradient(100deg, #B9F0F3 0%, #DDF8FA 100%)' : AI_STOCK_THEME.card, boxShadow: row?.highlighted ? 'inset 3px 0 0 #13B9CD, inset 0 0 12px rgba(46,206,224,0.20)' : 'none' });
      if (row) {
        const name = document.createElement('span');
        name.textContent = row.name;
        Object.assign(name.style, { minWidth: '0', flex: '1', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: row.highlighted ? '700' : '500', color: row.highlighted ? AI_STOCK_THEME.accent : AI_STOCK_THEME.text });
        const percent = document.createElement('span');
        percent.textContent = row.percent;
        Object.assign(percent.style, { flexShrink: '0', whiteSpace: 'nowrap', fontWeight: '600', fontVariantNumeric: 'tabular-nums', color: direction === 'up' ? AI_STOCK_THEME.rise : AI_STOCK_THEME.fall });
        line.append(name, percent);
      }
      td.appendChild(line);
    }
  }
  clone.appendChild(table);
  return { clone, width, fontFamily };
}

/** Place beside the parent's interval-return heading; disabled must reflect both query states. */
export default function StockRankingImageDownload({
  targetRef, disabled = false, periodLabel, marketLabel, windowStart, asOf, topN, dataUpdatedAt,
}: Props) {
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<ImagePreview | null>(null);
  const generationLock = useRef(false);
  const saveLock = useRef(false);
  const mounted = useRef(true);
  const unavailable = disabled || !windowStart || !asOf || !periodLabel || !marketLabel || !Number.isInteger(topN) || topN < 1;
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);

  const generate = async () => {
    if (unavailable || generationLock.current) return;
    const source = targetRef.current;
    if (!source) { toast.error('未找到可下载的排行结果'); return; }
    if (source.getAttribute('aria-busy') === 'true' || source.closest('[data-pending="true"]') ||
      source.querySelector('[data-testid="stock-return-pending"], [data-testid="stock-return-loading"], [data-testid="stock-return-error"]')) {
      toast.error('请等待涨跌两榜查询成功后再下载');
      return;
    }
    generationLock.current = true;
    setGenerating(true);
    const screenshotTime = formatScreenshotTime(new Date());
    let container: HTMLDivElement | null = null;
    try {
      // Clone first: a market/query/highlight change while loading the library must not
      // change this click's image or mismatch the already captured header props.
      const { clone, width, fontFamily } = prepareRankingClone(source);
      const title = `区间涨跌幅 · ${periodLabel} · 前${topN} · ${marketLabel}`;
      container = document.createElement('div');
      Object.assign(container.style, {
        position: 'fixed', top: '0', left: '-10000px', width: `${width + 24}px`,
        padding: '12px', boxSizing: 'border-box', background: AI_STOCK_THEME.background,
        color: AI_STOCK_THEME.text, fontFamily, pointerEvents: 'none', zIndex: '-1',
      });
      const header = document.createElement('div');
      Object.assign(header.style, {
        padding: '10px 12px', marginBottom: '10px', borderRadius: '10px',
        background: AI_STOCK_THEME.headerGradient, color: '#FFFFFF',
      });
      const heading = document.createElement('div');
      heading.style.cssText = 'display:flex;align-items:center;gap:8px;font-size:14px;font-weight:700;line-height:1.5;';
      const brand = document.createElement('span');
      brand.textContent = 'R1';
      Object.assign(brand.style, {
        padding: '1px 6px', border: '1px solid rgba(103,232,249,0.45)', borderRadius: '5px', color: '#A5F3FC',
      });
      const label = document.createElement('span');
      label.textContent = '区间涨跌幅';
      heading.append(brand, label);
      const selection = document.createElement('div');
      selection.style.cssText = 'margin-top:4px;font-size:12px;line-height:1.5;';
      selection.textContent = `${periodLabel} · 前${topN} · ${marketLabel}`;
      const dates = document.createElement('div');
      dates.style.cssText = 'margin-top:4px;font-size:11px;line-height:1.5;color:#C9E4EF;';
      dates.textContent = `实际日期范围：${readableDate(windowStart)} 至 ${readableDate(asOf)}`;
      const cutoff = document.createElement('div');
      cutoff.style.cssText = 'font-size:11px;line-height:1.5;color:#C9E4EF;';
      cutoff.textContent = `行情截止：${readableDate(asOf)} · 非盘中实时`;
      header.append(heading, selection, dates, cutoff);
      if (dataUpdatedAt) {
        const updated = new Date(dataUpdatedAt);
        if (Number.isFinite(updated.getTime())) {
          const cacheTime = document.createElement('div');
          cacheTime.style.cssText = 'font-size:10px;line-height:1.5;color:#C9E4EF;';
          cacheTime.textContent = `缓存入库时间：${formatScreenshotTime(updated)}（北京时间）`;
          header.appendChild(cacheTime);
        }
      }
      const stamp = document.createElement('div');
      Object.assign(stamp.style, {
        fontSize: '10px', lineHeight: '1.5', color: AI_STOCK_THEME.muted, textAlign: 'right', marginTop: '8px',
      });
      stamp.textContent = `R1｜截图时间 ${screenshotTime}（北京时间）`;
      container.append(header, clone, stamp);
      document.body.appendChild(container);
      const { default: html2canvas } = await import('html2canvas-pro');
      await document.fonts.ready;
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      if (!mounted.current) return;
      const imageWidth = Math.ceil(container.getBoundingClientRect().width);
      const imageHeight = Math.ceil(Math.max(container.scrollHeight, container.getBoundingClientRect().height));
      if (!(imageHeight > 0)) throw new Error('排行图片布局未完成');
      appendR1TimeWatermark(container, `R1｜${screenshotTime}`, imageWidth, imageHeight);
      const scale = Math.min(2, Math.sqrt(12_000_000 / Math.max(1, imageWidth * imageHeight)), 16000 / Math.max(imageWidth, imageHeight));
      const canvas = await html2canvas(container, {
        scale, backgroundColor: AI_STOCK_THEME.background, logging: false,
        useCORS: false, allowTaint: false,
        scrollX: 0, scrollY: 0, width: imageWidth, height: imageHeight,
        // Preserve source viewport media queries; output height is independent of viewport.
        windowWidth: window.innerWidth, windowHeight: window.innerHeight,
      });
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(value => value ? resolve(value) : reject(new Error('图片生成失败')), 'image/png');
      });
      if (!mounted.current) return;
      const filename = `${title}-${screenshotTime.replace(/[ :]/g, '-')}.png`.replace(/[\\/:*?"<>|]/g, '-');
      setPreview({ blob, url: URL.createObjectURL(blob), filename, title });
    } catch (error) {
      console.error('区间涨跌幅图片生成失败', error);
      if (mounted.current) toast.error('图片生成失败，请稍后重试');
    } finally {
      container?.remove();
      generationLock.current = false;
      if (mounted.current) setGenerating(false);
    }
  };

  const save = async () => {
    if (!preview || saveLock.current) return;
    saveLock.current = true;
    setSaving(true);
    try {
      const file = new File([preview.blob], preview.filename, { type: 'image/png' });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        try { await navigator.share({ files: [file], title: preview.title }); return; }
        catch (error) { if (error instanceof DOMException && error.name === 'AbortError') return; }
      }
      const link = document.createElement('a');
      link.href = preview.url;
      link.download = preview.filename;
      document.body.appendChild(link);
      try { link.click(); } finally { link.remove(); }
    } catch {
      if (mounted.current) toast.error('保存失败，可长按预览图片保存');
    } finally {
      saveLock.current = false;
      if (mounted.current) setSaving(false);
    }
  };

  return <>
    <button
      type="button" data-testid="stock-ranking-download" data-stock-export-hide="true"
      title="下载区间涨跌幅图片" aria-label="下载区间涨跌幅图片" aria-busy={generating}
      disabled={unavailable || generating}
      onClick={event => { event.preventDefault(); event.stopPropagation(); void generate(); }}
      className="ml-auto inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md hover:bg-[#E4F4F6] disabled:cursor-not-allowed disabled:opacity-50"
      style={{ color: AI_STOCK_THEME.accent }}
    >
      {generating ? <LoaderCircle size={15} className="animate-spin" /> : <Download size={15} />}
    </button>
    {preview && createPortal(<div
      role="dialog" aria-modal="true" aria-label="区间涨跌幅图片预览"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-3"
      onClick={() => setPreview(null)}
    >
      <div className="mx-auto flex max-h-full min-h-0 w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white" onClick={event => event.stopPropagation()}>
        <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: AI_STOCK_THEME.border }}>
          <span className="min-w-0 truncate text-sm font-semibold" style={{ color: AI_STOCK_THEME.text }}>区间涨跌幅图片</span>
          <button type="button" data-testid="stock-ranking-image-close" onClick={() => setPreview(null)} aria-label="关闭图片预览" className="inline-flex h-7 w-7 shrink-0 items-center justify-center" style={{ color: AI_STOCK_THEME.muted }}><X size={20} /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-2" style={{ background: AI_STOCK_THEME.background }}>
          <img data-testid="stock-ranking-image-preview" src={preview.url} alt={preview.title} className="block h-auto w-full" />
        </div>
        <div className="shrink-0 border-t p-3" style={{ borderColor: AI_STOCK_THEME.border }}>
          <button type="button" data-testid="stock-ranking-image-save" disabled={saving} onClick={() => void save()} className="w-full rounded-lg py-2.5 text-sm font-semibold text-white disabled:opacity-50" style={{ background: AI_STOCK_THEME.accentGradient }}>{saving ? '保存中…' : '保存 / 分享图片'}</button>
          <p className="mt-2 text-center text-[10px]" style={{ color: AI_STOCK_THEME.dim }}>手机也可长按上方图片保存</p>
        </div>
      </div>
    </div>, document.body)}
  </>;
}
