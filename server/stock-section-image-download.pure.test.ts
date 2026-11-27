import { readFileSync } from 'node:fs';
import React from 'react';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Offline execution of the actual component with inert hooks/DOM/canvas.
// No application imports, backend, routers, database, HTTP, filesystem writes or browser launch.
const source = readFileSync(new URL('../client/src/components/StockSectionImageDownload.tsx', import.meta.url), 'utf8');
const syntax = ts.createSourceFile('section.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const imports = syntax.statements.filter(ts.isImportDeclaration).map(node => (node.moduleSpecifier as ts.StringLiteral).text);
const implementation = syntax.statements.filter(node => !ts.isImportDeclaration(node)).map(node => node.getText(syntax)).join('\n')
  .replace(/^export\s+/gm, '')
  .replace("await import('html2canvas-pro')", 'await captureModule');
const compiled = ts.transpileModule(implementation, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React },
}).outputText;

class Style {
  [key: string]: any;
  cssText = '';
  setProperty(name: string, value: string, priority: string) {
    this[name] = value;
    this[`${name}:priority`] = priority;
  }
}
class Element {
  style = new Style();
  attributes: Record<string, string> = {};
  children: Element[] = [];
  parent: Element | null = null;
  ownText = '';
  clientWidth = 400;
  scrollWidth = 400;
  clientHeight = 200;
  scrollHeight = 200;
  scrollLeft = 0;
  computed: Record<string, string> = { overflowX: 'visible', overflowY: 'visible', fontFamily: 'test-font' };
  src = '';
  width = 0;
  height = 0;
  download = '';
  href = '';
  clicked = false;
  constructor(public tagName = 'div') {}
  set textContent(value: string) { this.ownText = value; this.children = []; }
  get textContent(): string { return this.ownText + this.children.map(node => node.textContent).join(''); }
  setAttribute(name: string, value: string) { this.attributes[name] = value; }
  appendChild(node: Element) { node.remove(); node.parent = this; this.children.push(node); return node; }
  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter(node => node !== this);
    this.parent = null;
  }
  replaceWith(node: Element) {
    if (!this.parent) return;
    const parent = this.parent;
    parent.children[parent.children.indexOf(this)] = node;
    node.parent = parent;
    this.parent = null;
  }
  matches(selector: string) {
    return selector === '*' || selector.split(',').some(part => part.trim().match(/^\[([^\]]+)\]$/)?.[1] in this.attributes);
  }
  querySelectorAll(selector: string): Element[] {
    return this.children.flatMap(node => [...(node.matches(selector) ? [node] : []), ...node.querySelectorAll(selector)]);
  }
  closest(selector: string): Element | null { return this.matches(selector) ? this : this.parent?.closest(selector) ?? null; }
  getBoundingClientRect() { return { width: parseFloat(this.style.width) || this.clientWidth, height: this.scrollHeight }; }
  click() { this.clicked = true; }
  cloneNode(deep: boolean): Element {
    const clone = this instanceof Canvas ? new Canvas() : new Element(this.tagName);
    for (const key of ['ownText', 'clientWidth', 'scrollWidth', 'clientHeight', 'scrollHeight', 'scrollLeft', 'src', 'width', 'height'] as const) (clone as any)[key] = this[key];
    clone.attributes = { ...this.attributes };
    clone.computed = { ...this.computed };
    Object.assign(clone.style, this.style);
    if (deep) this.children.forEach(node => clone.appendChild(node.cloneNode(true)));
    return clone;
  }
}
class Canvas extends Element {
  constructor() { super('canvas'); }
  toDataURL() { return 'data:image/png;base64,chart'; }
}
const element = (text = '', attributes: Record<string, string> = {}) => {
  const node = new Element(); node.textContent = text; node.attributes = attributes; return node;
};
function nodes(tree: any): any[] {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
}
const treeText = (tree: any): string => Array.isArray(tree) ? tree.map(treeText).join('')
  : tree == null || typeof tree === 'boolean' ? '' : typeof tree === 'object' ? treeText(tree.props?.children) : String(tree);

function harness(identity: Record<string, any>, props: { title?: string; marketLabel?: string } = {}) {
  const body = new Element('body');
  const created: Element[] = [];
  const errors = vi.fn();
  const capture = vi.fn(async (_container: Element, _options: any) => ({
    toBlob: (callback: (blob: Blob) => void, type: string) => callback(new Blob(['png'], { type })),
  }));
  vi.stubGlobal('document', { body, fonts: { ready: Promise.resolve() }, createElement: (tag: string) => {
    const node = new Element(tag); created.push(node); return node;
  } });
  vi.stubGlobal('HTMLCanvasElement', Canvas);
  vi.stubGlobal('getComputedStyle', (node: Element) => node.computed);
  vi.stubGlobal('window', { innerWidth: 400, innerHeight: 800 });
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => callback());
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-preview');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const states: any[] = [];
  let cursor = 0;
  const scope = {
    createContext: (value: any) => ({ value, Provider: 'provider' }),
    useContext: () => provider.props.value,
    useState: (initial: any) => {
      const index = cursor++;
      if (!(index in states)) states[index] = initial;
      return [states[index], (value: any) => { states[index] = value; }];
    },
    useEffect: () => {}, createPortal: (tree: any) => tree,
    Download: 'download-icon', LoaderCircle: 'loader-icon', X: 'close-icon', toast: { error: errors },
    captureModule: { default: capture },
  };
  const actual = new Function('React', ...Object.keys(scope), `${compiled}\nreturn { StockSectionImageExportProvider, StockSectionImageDownload, prepareSectionClone, formatScreenshotTime };`)(React, ...Object.values(scope));
  const provider = actual.StockSectionImageExportProvider({ ...identity, children: null });
  const render = () => { cursor = 0; return actual.StockSectionImageDownload({ title: '当前板块', ...props }); };
  const button = () => nodes(render()).find(node => node.type === 'button' && node.props['data-stock-export-hide']);
  const generate = async (target: Element) => {
    const event = { currentTarget: target, preventDefault: vi.fn(), stopPropagation: vi.fn() };
    button().props.onClick(event);
    await vi.waitFor(() => expect(states[2]).toBeTruthy());
    return event;
  };
  return { ...actual, provider, render, button, generate, states, body, created, capture, errors };
}
function fixture() {
  const page = element('PAGE_ONLY', { 'data-stock-export-section': 'page' });
  const section = element('CURRENT_SECTION', { 'data-stock-export-section': 'section' });
  const target = element('DOWNLOAD_BUTTON', { 'data-stock-export-hide': 'true' });
  const details = element('EXPANDED_PERIOD_CONTENT', { open: '', 'data-selected-period': 'month' });
  const scroll = element('FULL_CHART_DATA');
  scroll.computed = { ...scroll.computed, overflowX: 'auto', overflowY: 'scroll' };
  scroll.scrollWidth = 900; scroll.scrollHeight = 600; scroll.scrollLeft = 80;
  scroll.appendChild(new Canvas());
  details.appendChild(scroll);
  section.appendChild(target); section.appendChild(details);
  section.appendChild(element('SUMMARY_CONTROL', { 'data-summary-export-hide': 'true' }));
  page.appendChild(section); page.appendChild(element('OTHER_SECTION', { 'data-stock-export-section': 'sibling' }));
  return { page, section, target, details, scroll };
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('单板块导出：实际组件安全离线执行', () => {
  it('仅包含前端依赖，不引入业务后台，也没有新增旧品牌', () => {
    expect(imports).toEqual(['react', 'react-dom', 'lucide-react', 'sonner']);
    expect(source.match(/import\('html2canvas-pro'\)/g)).toHaveLength(1);
    expect(source).not.toContain('脉' + '动');
    expect(source).toContain('marketOverview?: boolean');
    expect(source).toContain('marketLabel?: string');
  });

  it.each([{}, { latestPrice: 12.34, quoteDate: '20261127', priceChange: 1.23, percentChange: 2.34 }])('首页忽略个股报价字段，品牌头、PNG文件名及水印统一AI 股伴：%j', quoteFields => {
    const run = async () => {
      const h = harness({ stockName: 'AI 股伴', stockCode: '', marketOverview: true, ...quoteFields });
      const f = fixture();
      const event = await h.generate(f.target);
      expect(event.preventDefault).toHaveBeenCalledOnce(); expect(event.stopPropagation).toHaveBeenCalledOnce();
      expect(h.capture).toHaveBeenCalledOnce();
      const [container, options] = h.capture.mock.calls[0];
      expect(container.children[0].textContent).toBe('AI 股伴 · 当前板块');
      expect(container.textContent).toContain('CURRENT_SECTIONEXPANDED_PERIOD_CONTENTFULL_CHART_DATA');
      expect(container.textContent).not.toMatch(/PAGE_ONLY|OTHER_SECTION|DOWNLOAD_BUTTON|SUMMARY_CONTROL|最新收盘价|行情时间|待更新|涨跌|R1/);
      expect(container.textContent).toMatch(/AI 股伴｜截图时间 \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}（北京时间）/);
      const watermark = container.querySelectorAll('[data-card-export-watermark]')[0];
      expect(watermark.children.length).toBeGreaterThan(0);
      expect(watermark.children.every(node => /^AI 股伴｜/.test(node.textContent))).toBe(true);
      expect(options.backgroundColor).toBe('#F2F6FA'); expect(container.style.color).toBe('#142A3F');
      expect(container.parent).toBeNull(); expect(h.body.children).toHaveLength(0);
      expect(h.states[2].blob.type).toBe('image/png'); expect(h.states[2].url).toBe('blob:test-preview');
      expect(h.states[2].filename).toMatch(/^AI 股伴-当前板块-.*\.png$/);
      expect(h.errors).not.toHaveBeenCalled();
    };
    return run();
  });

  it.each([
    { providerLabel: '沪市', buttonLabel: undefined, effectiveLabel: '沪市' },
    { providerLabel: '沪市', buttonLabel: '全市场', effectiveLabel: '全市场' },
    { providerLabel: undefined, buttonLabel: '全市场', effectiveLabel: '全市场' },
    { providerLabel: ' 沪市 ', buttonLabel: undefined, effectiveLabel: '沪市' },
    { providerLabel: '沪市', buttonLabel: ' 全市场 ', effectiveLabel: '全市场' },
    { providerLabel: undefined, buttonLabel: undefined, effectiveLabel: undefined },
    { providerLabel: '   ', buttonLabel: undefined, effectiveLabel: undefined },
    { providerLabel: '沪市', buttonLabel: '', effectiveLabel: undefined },
    { providerLabel: '沪市', buttonLabel: '   ', effectiveLabel: undefined },
  ])('首页市场标签由Provider继承、按钮优先覆盖，头/文件名/分享/alt一致且水印不带标签：%j', async ({ providerLabel, buttonLabel, effectiveLabel }) => {
    const h = harness({ stockName: 'AI 股伴', stockCode: '', marketOverview: true, marketLabel: providerLabel }, { title: '涨跌统计', marketLabel: buttonLabel });
    expect(h.provider.props.value.marketLabel).toBe(providerLabel);
    const f = fixture(); const before = f.page.textContent;
    await h.generate(f.target);
    const container = h.capture.mock.calls[0][0];
    const expectedTitle = `AI 股伴${effectiveLabel ? ` · ${effectiveLabel}` : ''} · 涨跌统计`;
    expect(container.children[0].textContent).toBe(expectedTitle);
    expect(h.states[2].filename).toMatch(new RegExp(`^AI 股伴${effectiveLabel ? `-${effectiveLabel}` : ''}-涨跌统计-.*\\.png$`));
    const watermark = container.querySelectorAll('[data-card-export-watermark]')[0];
    expect(watermark.children.length).toBeGreaterThan(0);
    expect(watermark.children.every(node => /^AI 股伴｜\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(node.textContent))).toBe(true);
    const stamp = container.children.find(node => node.textContent.startsWith('AI 股伴｜截图时间'))!;
    expect(stamp.textContent).toMatch(/^AI 股伴｜截图时间 \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}（北京时间）$/);
    expect(container.textContent).not.toMatch(/PAGE_ONLY|OTHER_SECTION|DOWNLOAD_BUTTON|SUMMARY_CONTROL/);
    expect(f.page.textContent).toBe(before);
    expect(nodes(h.render()).find(node => node.type === 'img').props.alt).toBe(`AI 股伴${effectiveLabel ? ` ${effectiveLabel}` : ''} 涨跌统计区域图片`);
    expect(treeText(h.render())).toContain('手机也可长按上方图片保存');
    const share = vi.fn(async (_data: { files: File[]; title: string }) => {});
    vi.stubGlobal('navigator', { share, canShare: () => true });
    nodes(h.render()).find(node => node.type === 'button' && treeText(node) === '保存 / 分享图片').props.onClick();
    await vi.waitFor(() => expect(share).toHaveBeenCalledOnce());
    expect(share.mock.calls[0][0].title).toBe(expectedTitle);
    expect(share.mock.calls[0][0].files[0].name).toBe(h.states[2].filename);
    expect(share.mock.calls[0][0].files[0].type).toBe('image/png');
    await vi.waitFor(() => expect(h.states[1]).toBe(false));
    expect(h.errors).not.toHaveBeenCalled();
  });

  it('市场标签中的文件名特殊字符仍安全替换，不改变图片头部原文', async () => {
    const h = harness({ stockName: 'AI 股伴', stockCode: '', marketOverview: true, marketLabel: '沪/市:*?"<>|' });
    await h.generate(fixture().target);
    expect(h.capture.mock.calls[0][0].children[0].textContent).toBe('AI 股伴 · 沪/市:*?"<>| · 当前板块');
    expect(h.states[2].filename).not.toMatch(/[\\/:*?"<>|]/);
  });

  it('导出clone完整展开滚动内容与canvas，保留选中期和展开状态，不改动当前板块或跨板块', () => {
    const h = harness({ stockName: 'AI 股伴', stockCode: '', marketOverview: true });
    const f = fixture(); const before = f.page.textContent;
    const { clone, width } = h.prepareSectionClone(f.target.closest('[data-stock-export-section]'));
    expect(width).toBe(932);
    expect(clone.querySelectorAll('[data-stock-export-hide], [data-summary-export-hide]')).toHaveLength(0);
    expect(clone.textContent).not.toMatch(/PAGE_ONLY|OTHER_SECTION|DOWNLOAD_BUTTON|SUMMARY_CONTROL/);
    const details = clone.querySelectorAll('[open]')[0];
    expect(details.attributes['data-selected-period']).toBe('month');
    const scroll = details.children[0];
    expect(scroll.style['overflow-x']).toBe('visible'); expect(scroll.style.width).toBe('900px');
    expect(scroll.style['overflow-y']).toBe('visible'); expect(scroll.style.height).toBe('auto');
    expect(scroll.scrollLeft).toBe(0); expect(scroll.children[0].tagName).toBe('img');
    expect(scroll.children[0].src).toBe('data:image/png;base64,chart');
    expect(f.scroll.scrollLeft).toBe(80); expect(f.scroll.style.width).toBeUndefined();
    expect(f.page.textContent).toBe(before); expect(f.target.parent).toBe(f.section);
  });

  it.each([undefined, false])('默认个股路径继续输出价格、涨跌、报价时间与R1水印：marketOverview=%s', async marketOverview => {
    const h = harness({ stockName: '个股测试', stockCode: '600000.SH', marketOverview, latestPrice: 12.34, quoteDate: '20261127', priceChange: 1.23, percentChange: -2.34, asOf: '20261126' });
    await h.generate(fixture().target);
    const [container, options] = h.capture.mock.calls[0];
    expect(container.children[0].textContent).toBe('个股测试 · 600000.SH · 当前板块');
    for (const text of ['最新收盘价 12.34 元', '涨跌 +1.23元', '涨跌幅 -2.34%', '2026-11-27 15:00收盘（北京时间）', '统计截至 2026-11-26', 'R1｜截图时间']) expect(container.textContent).toContain(text);
    expect(container.children[1].children[1].style.color).toBe('#D32F2F');
    expect(container.children[1].children[2].style.color).toBe('#00B050');
    expect(options.backgroundColor).toBe('#FAF3ED'); expect(container.style.color).toBe('#44342C');
    expect(h.states[2].filename).toMatch(/^个股测试-600000.SH-当前板块-.*\.png$/);
  });

  it.each([undefined, false])('非市场模式忽略Provider及按钮的市场标签，个股头/文件名/分享/alt不变：marketOverview=%s', async marketOverview => {
    const h = harness({ stockName: '个股测试', stockCode: '600000.SH', marketOverview, marketLabel: '沪市' }, { marketLabel: '全市场' });
    await h.generate(fixture().target);
    const container = h.capture.mock.calls[0][0];
    expect(container.children[0].textContent).toBe('个股测试 · 600000.SH · 当前板块');
    expect(container.textContent).not.toMatch(/沪市|全市场|AI 股伴/);
    expect(h.states[2].filename).toMatch(/^个股测试-600000.SH-当前板块-.*\.png$/);
    expect(nodes(h.render()).find(node => node.type === 'img').props.alt).toBe('个股测试 当前板块区域图片');
    const share = vi.fn(async (_data: { files: File[]; title: string }) => {});
    vi.stubGlobal('navigator', { share, canShare: () => true });
    nodes(h.render()).find(node => node.type === 'button' && treeText(node) === '保存 / 分享图片').props.onClick();
    await vi.waitFor(() => expect(share).toHaveBeenCalledOnce());
    expect(share.mock.calls[0][0].title).toBe('个股测试 · 当前板块');
    await vi.waitFor(() => expect(h.states[1]).toBe(false));
  });

  it('默认个股缺行情时保留原有待更新和未知占位，不冒充零值', async () => {
    const h = harness({ stockName: '个股测试', stockCode: '600000.SH' });
    await h.generate(fixture().target);
    const container = h.capture.mock.calls[0][0];
    for (const text of ['最新收盘价待更新', '行情时间待更新', '涨跌 —', '涨跌幅 —']) expect(container.textContent).toContain(text);
    expect(container.textContent).not.toMatch(/最新收盘价 0|涨跌 0/);
  });

  it('无最近标记区域时只报错，不截图全页', () => {
    const h = harness({ stockName: 'AI 股伴', stockCode: '', marketOverview: true });
    h.button().props.onClick({ currentTarget: element('unmarked'), preventDefault: vi.fn(), stopPropagation: vi.fn() });
    expect(h.errors).toHaveBeenCalledWith('未找到可下载的区域');
    expect(h.capture).not.toHaveBeenCalled(); expect(h.states[2]).toBeNull();
  });

  it('首页保留PNG预览和长按提示，iOS文件分享与不支持分享的下载回退均使用AI 股伴', async () => {
    const h = harness({ stockName: 'AI 股伴', stockCode: '', marketOverview: true });
    await h.generate(fixture().target);
    expect(nodes(h.render()).find(node => node.props?.role === 'dialog').props['aria-label']).toBe('当前板块图片预览');
    expect(nodes(h.render()).find(node => node.type === 'img').props.alt).toBe('AI 股伴 当前板块区域图片');
    expect(treeText(h.render())).toContain('手机也可长按上方图片保存');
    const saveButton = () => nodes(h.render()).find(node => node.type === 'button' && treeText(node) === '保存 / 分享图片');
    const share = vi.fn(async (_data: { files: File[]; title: string }) => {});
    vi.stubGlobal('navigator', { share, canShare: () => true });
    saveButton().props.onClick();
    await vi.waitFor(() => expect(share).toHaveBeenCalledOnce());
    expect(share.mock.calls[0][0]).toMatchObject({ title: 'AI 股伴 · 当前板块' });
    const file = share.mock.calls[0][0].files[0];
    expect(file.type).toBe('image/png'); expect(file.name).toBe(h.states[2].filename);
    await vi.waitFor(() => expect(h.states[1]).toBe(false));
    vi.stubGlobal('navigator', {});
    saveButton().props.onClick();
    await vi.waitFor(() => expect(h.created.some(node => node.tagName === 'a' && node.clicked)).toBe(true));
    const link = h.created.find(node => node.tagName === 'a')!;
    expect(link.href).toBe('blob:test-preview'); expect(link.download).toBe(file.name); expect(link.parent).toBeNull();
  });

  it('时间脚注和水印使用北京时间精确到秒', () => {
    const h = harness({ stockName: 'AI 股伴', stockCode: '', marketOverview: true });
    expect(h.formatScreenshotTime(new Date('2026-11-27T01:02:03Z'))).toBe('2026-11-27 09:02:03');
  });
});
