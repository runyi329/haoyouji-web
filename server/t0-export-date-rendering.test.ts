import { readFileSync } from "node:fs";
import React from "react";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 只读取生产 AST 并 transpile 执行原声明；不 import 页面/应用/DB/资金接口。
// 内存桩仅提供浏览器和 React 边界，不复制日期、收益、绘制或导出业务算法。
function source(relative: string) {
  return ts.createSourceFile(relative, readFileSync(new URL(relative, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}
const exportAst = source("../client/src/components/OrderCardImageDownload.tsx");
const pageAst = source("../client/src/pages/T0Journal.tsx");
function nodes<T extends ts.Node>(root: ts.Node, predicate: (node: ts.Node) => node is T): T[] {
  const result: T[] = [];
  const visit = (node: ts.Node) => { if (predicate(node)) result.push(node); ts.forEachChild(node, visit); };
  visit(root);
  return result;
}
function production(root: ts.SourceFile, name: string, deps: Record<string, any> = {}): any {
  const declaration = nodes(root, ts.isFunctionDeclaration).find(node => node.name?.text === name);
  if (!declaration) throw new Error(`Missing production declaration: ${name}`);
  const output = ts.transpileModule(declaration.getText(root), {
    fileName: "isolated.tsx", compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  }).outputText;
  return new Function(...Object.keys(deps), "exports", `${output}\nreturn ${name};`)(...Object.values(deps), {});
}
function elements(value: any, result: any[] = []): any[] {
  if (Array.isArray(value)) value.forEach(item => elements(item, result));
  else if (React.isValidElement(value)) { result.push(value); elements((value.props as any).children, result); }
  return result;
}
function content(value: any): string {
  if (Array.isArray(value)) return value.map(content).join("");
  if (React.isValidElement(value)) return content((value.props as any).children);
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}
// 仓库使用 Vitest 2；通过完整calls数组同时检查单次调用及所有参数。
function calledOnceWith(mock: any, ...args: any[]) { expect(mock.mock.calls).toEqual([args]); }
function markedText(tree: any) { return elements(tree).filter(node => node.props["data-card-export-text"] === "true").map(content); }
function assertAmountsUnmarked(tree: any) {
  const amounts = elements(tree).filter(node => "data-t0-fit" in node.props);
  expect(amounts.length).toBeGreaterThan(0);
  expect(amounts.every(node => !node.props["data-card-export-text"] && elements(node).every(child => !child.props["data-card-export-text"]))).toBe(true);
}
function styleObject(values: any = {}) {
  const style: any = { ...values };
  Object.defineProperty(style, "setProperty", { enumerable: false, value: (key: string, value: string) => { style[key.replace(/-([a-z])/g, (_, char) => char.toUpperCase())] = value; } });
  return style;
}
class MemoryElement {
  children: MemoryElement[] = [];
  parentElement: MemoryElement | null = null;
  attributes: Record<string, string> = {};
  style: any = styleObject();
  computed: any = {};
  ownText = "";
  className = "";
  scrollTop = 0;
  scrollLeft = 0;
  scrollHeight = 0;
  rect = { width: 0, height: 0, top: 0, bottom: 0 };
  naturalWidth = 0;
  complete = false;
  decode = vi.fn(async () => {});
  constructor(public tagName = "DIV") {}
  get textContent(): string { return this.ownText + this.children.map(child => child.textContent).join(""); }
  set textContent(value: string) { this.replaceChildren(); this.ownText = value; }
  get src() { return this.getAttribute("src") || ""; }
  set src(value: string) { this.setAttribute("src", value); this.naturalWidth = value.startsWith("data:") ? 1 : 0; this.complete = this.naturalWidth > 0; }
  get alt() { return this.getAttribute("alt") || ""; }
  set alt(value: string) { this.setAttribute("alt", value); }
  get currentSrc() { return this.src; }
  appendChild(child: MemoryElement) { child.remove(); this.children.push(child); child.parentElement = this; return child; }
  replaceChildren(...children: MemoryElement[]) { this.children.forEach(child => { child.parentElement = null; }); this.children = []; this.ownText = ""; children.forEach(child => this.appendChild(child)); }
  replaceWith(child: MemoryElement) { const parent = this.parentElement; if (!parent) return; const index = parent.children.indexOf(this); this.remove(); parent.children.splice(index, 0, child); child.parentElement = parent; }
  setAttribute(name: string, value: string) { this.attributes[name] = value; }
  getAttribute(name: string) { return this.attributes[name] ?? null; }
  hasAttribute(name: string) { return name in this.attributes; }
  removeAttribute(name: string) { delete this.attributes[name]; }
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this); this.parentElement = null; }
  querySelectorAll(selector: string): MemoryElement[] {
    const matches = (element: MemoryElement) => selector === "*" || (selector.startsWith("[") ? element.hasAttribute(selector.slice(1, -1)) : element.tagName === selector.toUpperCase());
    return this.children.flatMap(child => [...(matches(child) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  querySelector(selector: string) { return this.querySelectorAll(selector)[0] ?? null; }
  cloneNode(deep: boolean) {
    const clone = new MemoryElement(this.tagName);
    clone.attributes = { ...this.attributes }; clone.style = styleObject(this.style); clone.computed = { ...this.computed };
    clone.ownText = this.ownText; clone.className = this.className; clone.rect = { ...this.rect };
    clone.scrollHeight = this.scrollHeight; clone.scrollTop = this.scrollTop; clone.scrollLeft = this.scrollLeft;
    clone.naturalWidth = this.naturalWidth; clone.complete = this.complete; clone.decode = this.decode;
    if (deep) this.children.forEach(child => clone.appendChild(child.cloneNode(true)));
    return clone;
  }
  getBoundingClientRect() { return this.rect; }
  addEventListener = vi.fn();
}
type Metrics = { width: number; actualBoundingBoxAscent?: number; actualBoundingBoxDescent?: number };
function browserHarness(metrics: Metrics = { width: 42.25, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 }) {
  const events: string[] = [];
  const canvases: any[] = [];
  const images: MemoryElement[] = [];
  const h = { metrics, noContext: false, fontReady: () => Promise.resolve(), events, canvases, images };
  let fontReads = 0;
  let fontPromise: Promise<void>;
  const document = {
    body: new MemoryElement("BODY"),
    fonts: { get ready() {
      // 生产每次先truthy检查再await；两次属性读取必须引用同一个promise，不能启动第二个加载。
      if (fontReads++ % 2 === 0) { events.push("fonts:wait"); fontPromise = h.fontReady().then(() => { events.push("fonts:ready"); }); }
      return fontPromise;
    } },
    createElement(tag: string): any {
      if (tag !== "canvas") {
        const element = new MemoryElement(tag.toUpperCase());
        if (tag === "img") { images.push(element); element.decode = vi.fn(async () => { events.push(`decode:${element.alt || "product"}`); }); }
        return element;
      }
      let width = 0, height = 0;
      const context: any = {
        font: "10px sans-serif", fillStyle: "#000", textAlign: "start", textBaseline: "alphabetic",
        measureText: vi.fn((text: string) => { events.push(`measure:${text}`); context.measuredFont = context.font; return { ...h.metrics }; }),
        scale: vi.fn((x: number, y: number) => { events.push(`scale:${x},${y}`); }),
        fillText: vi.fn((text: string, x: number, y: number) => { events.push(`fill:${text}`); context.painted = { text, x, y, font: context.font, color: context.fillStyle, align: context.textAlign, baseline: context.textBaseline }; }),
      };
      const reset = () => { context.font = "10px sans-serif"; context.fillStyle = "#000"; context.textAlign = "start"; context.textBaseline = "alphabetic"; };
      const canvas: any = {
        context,
        get width() { return width; }, set width(value: number) { width = value; events.push(`width:${value}`); reset(); },
        get height() { return height; }, set height(value: number) { height = value; events.push(`height:${value}`); reset(); },
        getContext: vi.fn((kind: string) => kind === "2d" && !h.noContext ? context : null),
        toDataURL: vi.fn((mime: string) => { events.push(`dataURL:${mime}`); return `data:image/png;base64,memory-${canvases.length}`; }),
      };
      canvases.push(canvas);
      return canvas;
    },
  };
  const window = {
    innerWidth: 400, innerHeight: 800, location: { href: "https://isolated.invalid/" },
    setTimeout: vi.fn(() => 1), clearTimeout: vi.fn(),
    getComputedStyle(element: MemoryElement) {
      const values: Record<string, any> = { fontSize: "12px", lineHeight: "normal", color: "rgb(100, 116, 139)", fontStyle: "normal", fontWeight: "400", fontFamily: "sans-serif", ...element.computed, ...element.style };
      const entries = Object.entries(values);
      return { ...values, length: entries.length, item: (index: number) => entries[index][0], getPropertyValue: (key: string) => values[key], getPropertyPriority: () => "" };
    },
  };
  const requestAnimationFrame = (callback: () => void) => { events.push("frame"); callback(); return 1; };
  const deps = { document, window, requestAnimationFrame, HTMLInputElement: class {}, HTMLTextAreaElement: class {}, HTMLSelectElement: class {} };
  const createSnapshotTextImage = production(exportAst, "createSnapshotTextImage", deps);
  const prepareSnapshotText = production(exportAst, "prepareSnapshotText", { ...deps, createSnapshotTextImage });
  const copyRenderedStyles = production(exportAst, "copyRenderedStyles", deps);
  const createExactSnapshotContainer = production(exportAst, "createExactSnapshotContainer", { ...deps, createSnapshotTextImage, copyRenderedStyles, EXPORT_HIDE_ATTRIBUTE: "data-card-export-hide" });
  const waitForSnapshotImage = production(exportAst, "waitForSnapshotImage", { ...deps, SNAPSHOT_IMAGE_LOAD_TIMEOUT_MS: 12_000 });
  const retryProxiedSnapshotImage = production(exportAst, "retryProxiedSnapshotImage");
  const replaceFailedSnapshotImages = production(exportAst, "replaceFailedSnapshotImages", deps);
  const waitForSnapshotAssets = production(exportAst, "waitForSnapshotAssets", { ...deps, waitForSnapshotImage, retryProxiedSnapshotImage, replaceFailedSnapshotImages });
  const prepareSnapshotImages = production(exportAst, "prepareSnapshotImages", { getExportImageProxyUrl: production(exportAst, "getExportImageProxyUrl", { ...deps, COS_EXPORT_IMAGE_HOST: "haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com", EXPORT_IMAGE_PROXY_PATH: "/api/miban/export-image" }) });
  return Object.assign(h, { document, window, createSnapshotTextImage, prepareSnapshotText, createExactSnapshotContainer, waitForSnapshotAssets, prepareSnapshotImages });
}
function targetWithDate(h: ReturnType<typeof browserHarness>, date = "11/2–11/8") {
  const target = new MemoryElement(); target.rect = { width: 320, height: 120, top: 0, bottom: 120 }; target.scrollHeight = 120;
  const label = target.appendChild(new MemoryElement("SPAN")); label.textContent = date; label.setAttribute("data-card-export-text", "true");
  h.document.body.appendChild(target);
  return { target, label };
}
function pageHarness() {
  const getT0CalendarDateUtc = production(pageAst, "getT0CalendarDateUtc");
  const formatT0WeeklySettlementPeriod = production(pageAst, "formatT0WeeklySettlementPeriod", { getT0CalendarDateUtc });
  const deps = { React, getT0CalendarDateUtc, formatT0WeeklySettlementPeriod,
    formatT0WeeklySettlementPeriodChinese: production(pageAst, "formatT0WeeklySettlementPeriodChinese", { getT0CalendarDateUtc, formatT0WeeklySettlementPeriod }),
    getT0WeeklySettlementPeriodFromWeekStart: production(pageAst, "getT0WeeklySettlementPeriodFromWeekStart", { getT0CalendarDateUtc }),
    formatT0WeeklySettlementCountdown: production(pageAst, "formatT0WeeklySettlementCountdown"),
    formatT0SettlementAmount: production(pageAst, "formatT0SettlementAmount"),
    useMemo: (callback: any) => callback(), useCallback: (callback: any) => callback, useState: (value: any) => [value, vi.fn()],
    ChevronLeft: "mock-left", ChevronRight: "mock-right", T0WeeklySettlementDailyIncomeProgressList: "mock-daily",
  };
  return Object.fromEntries(["T0WeeklySettlementDailyIncomeProgressList", "T0MemberWeeklySettlementCurrentCard", "T0TeamWeeklySettlementCard", "T0HistoricalSettlementWeekCalendar", "T0AdminWeeklySettlementOverviewCard"].map(name => [name, production(pageAst, name, deps)]));
}
function sampleReport() {
  return { status: "frozen", calculationVersion: "frozen-v1", period: { weekStartBjt: "2026-11-02", weekEndExclusiveBjt: "2026-11-09" },
    summary: { participantCount: 1, income: { total: 1099.123456, order: 1200.123456, commission: -101, shared: 0, orderCount: 2, commissionCount: 1, sharedCount: 0 } }, members: [] };
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
function previewHarness(h: ReturnType<typeof browserHarness>, props: any = {}, overrides: Record<string, any> = {}) {
  const { target, label } = targetWithDate(h);
  const callbacks: any[] = [], effects: any[] = [];
  const states: any[] = [false, false, null];
  let stateIndex = 0;
  const setGenerating = vi.fn((value: any) => { states[0] = value; });
  const setters = [setGenerating, vi.fn(), vi.fn((value: any) => { states[2] = typeof value === "function" ? value(states[2]) : value; })];
  const revokeObjectURL = vi.fn();
  const url = { createObjectURL: vi.fn(() => "blob:memory-preview"), revokeObjectURL };
  const toast = { error: vi.fn(), success: vi.fn() };
  const html2canvas = vi.fn(async (_container: any, _options: any) => { h.events.push("capture"); return { toBlob: (callback: any, mime: string) => { h.events.push(`blob:${mime}`); callback(new Blob(["PNG"], { type: mime })); } }; });
  let snapshot: any;
  const createExactSnapshotContainer = vi.fn((...args: any[]) => {
    snapshot = h.createExactSnapshotContainer(...args);
    const finalize = snapshot.finalizeSnapshot;
    snapshot.finalizeSnapshot = vi.fn(() => { h.events.push("finalize"); return finalize(); });
    const remove = snapshot.container.remove.bind(snapshot.container);
    snapshot.container.remove = vi.fn(() => { h.events.push("cleanup"); remove(); });
    return snapshot;
  });
  const prepareSnapshotText = vi.fn((root: any) => { h.events.push("prepare"); h.prepareSnapshotText(root); });
  const prepareSnapshotImages = vi.fn((root: any) => { h.events.push("proxy"); h.prepareSnapshotImages(root); });
  const deps = { React, window: h.window, document: h.document, URL: url, toast, html2canvas, createExactSnapshotContainer, prepareSnapshotText, prepareSnapshotImages, waitForSnapshotAssets: h.waitForSnapshotAssets,
    formatBeijingTime: production(exportAst, "formatBeijingTime"), sanitizeFilename: production(exportAst, "sanitizeFilename"), getErrorMessage: production(exportAst, "getErrorMessage"), canvasToBlob: production(exportAst, "canvasToBlob"),
    useState: (value: any) => { const index = stateIndex++; states[index] = value; return [value, setters[index]]; },
    useCallback: (callback: any) => { callbacks.push(callback); return callback; }, useEffect: (callback: any) => { effects.push(callback); },
    createPortal: vi.fn(), X: "mock-x", Download: "mock-download", Share2: "mock-share", LoaderCircle: "mock-loader", ...overrides,
  };
  const component = production(exportAst, "OrderCardImageDownload", deps);
  const tree = component({ targetRef: { current: target }, orderNo: "周/报", filenamePrefix: "T+0 导出", ...props });
  return { run: () => callbacks[0](), tree, target, label, states, effects, setters, setGenerating, toast, html2canvas, url, createExactSnapshotContainer, prepareSnapshotText, prepareSnapshotImages, snapshot: () => snapshot };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-07T16:05:06Z")); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("T+0整段日期像素化：真实Canvas声明", () => {
  it("周期/逐日/倒计时/水印均整段measure一次、fill一次，不拆字且使用原字号和颜色", () => {
    const h = browserHarness();
    const cases = [
      ["11/2–11/8", "normal 700 15px sans-serif", "rgb(255, 255, 255)", 15, 15],
      ["11月2日—11月8日", "normal 600 13px sans-serif", "rgb(30, 41, 59)", 17, 13],
      ["11/08", "normal 400 9px sans-serif", "rgb(148, 163, 184)", 12, 9],
      ["周日", "normal 600 10px sans-serif", "rgb(71, 85, 105)", 14, 10],
      ["1天 02:03:04", "normal 700 15px sans-serif", "#ffffff", 15, 15],
      ["R1｜2026-11-08 00:05:06", "600 11px sans-serif", "rgba(51, 65, 85, 0.07)", 15, 11],
    ] as const;
    for (const [text, font, color, lineHeight, fontSize] of cases) {
      const image = h.createSnapshotTextImage(text, font, color, lineHeight, fontSize);
      const canvas = h.canvases.at(-1);
      calledOnceWith(canvas.context.measureText, text);
      expect(canvas.context.measuredFont).toBe(font);
      expect(canvas.context.fillText).toHaveBeenCalledOnce();
      expect(canvas.context.painted).toMatchObject({ text, font, color, baseline: "alphabetic", align: "left" });
      expect(image.alt).toBe(text);
    }
  });

  it("先measure再设置2x尺寸，尺寸重置后重设font，PNG dataURL与CSS尺寸独立且共用alphabetic基线/padding2", () => {
    const h = browserHarness();
    const image = h.createSnapshotTextImage("11/2–11/8", "italic 700 16px serif", "#123456", 20, 16);
    const canvas = h.canvases[0];
    expect(h.events).toEqual(["measure:11/2–11/8", "width:94", "height:40", "scale:2,2", "fill:11/2–11/8", "dataURL:image/png"]);
    calledOnceWith(canvas.getContext, "2d");
    calledOnceWith(canvas.context.scale, 2, 2);
    calledOnceWith(canvas.context.fillText, "11/2–11/8", 2, 13);
    expect(canvas.context.painted).toMatchObject({ font: "italic 700 16px serif", color: "#123456", baseline: "alphabetic" });
    calledOnceWith(canvas.toDataURL, "image/png");
    expect(image.src).toMatch(/^data:image\/png;base64,/);
    expect(image.attributes).toMatchObject({ "data-card-export-raster-text": "true", alt: "11/2–11/8" });
    expect(image.style).toMatchObject({ width: "47px", height: "20px", display: "inline-block", maxWidth: "none", verticalAlign: "middle", objectFit: "contain" });
    const small = h.createSnapshotTextImage("11/8", "400 16px serif", "#000", 8, 16);
    expect(small.style.height).toBe("14px");
    calledOnceWith(h.canvases[1].context.fillText, "11/8", 2, 10);
  });

  it("缺省/非有限边界指标回退fontSize及0.25下降部；负指标钳0，空串仍保留安全padding", () => {
    for (const metrics of [{ width: 42.25 }, { width: 42.25, actualBoundingBoxAscent: NaN, actualBoundingBoxDescent: Infinity }]) {
      const h = browserHarness(metrics);
      const image = h.createSnapshotTextImage("日期", "400 16px serif", "#000", 10, 16);
      expect(image.style.height).toBe("24px");
      calledOnceWith(h.canvases[0].context.fillText, "日期", 2, 18);
    }
    const negative = browserHarness({ width: 42.25, actualBoundingBoxAscent: -8, actualBoundingBoxDescent: -2 });
    expect(negative.createSnapshotTextImage("日期", "400 16px serif", "#000", 10, 16).style.height).toBe("10px");
    calledOnceWith(negative.canvases[0].context.fillText, "日期", 2, 5);
    const empty = browserHarness({ width: 0, actualBoundingBoxAscent: 0, actualBoundingBoxDescent: 0 });
    expect(empty.createSnapshotTextImage("", "400 12px serif", "#000", 0, 12).style).toMatchObject({ width: "4px", height: "4px" });
    expect([empty.canvases[0].width, empty.canvases[0].height]).toEqual([8, 8]);
  });

  it("canvas上下文不可用抛可读错误，不产生伪图片", () => {
    const h = browserHarness(); h.noContext = true;
    expect(() => h.createSnapshotTextImage("日期", "12px serif", "#000", 16, 12)).toThrow("浏览器暂不支持日期图片渲染");
    expect(h.canvases[0].context.measureText).not.toHaveBeenCalled();
    expect(h.images).toHaveLength(0);
  });
});

describe("只处理导出克隆内显式日期，不改变页面/收益", () => {
  it("prepare使用computed字体颜色、整段replaceChildren，保留容器布局，仅修改clone和letterSpacing/lineHeight", () => {
    const h = browserHarness(); const { target, label } = targetWithDate(h, " 11/2–11/8 ");
    label.style = styleObject({ display: "flex", gap: "4px", transform: "translateX(1px)", letterSpacing: "-0.02em", marginLeft: "3px" });
    label.computed = { fontSize: "15px", lineHeight: "18px", fontStyle: "italic", fontWeight: "700", fontFamily: "'System Font', serif", color: "rgb(255, 255, 255)" };
    const child = label.appendChild(new MemoryElement("B")); child.textContent = " 周日";
    const amount = target.appendChild(new MemoryElement()); amount.textContent = "-1,099.123456 U"; amount.setAttribute("data-t0-fit", ""); amount.style = styleObject({ color: "green", letterSpacing: "-0.04em" });
    const snapshot = h.createExactSnapshotContainer(target, "R1", 8, true, 0, "#fff", 0.07, 0);
    const clonedLabel = snapshot.clonedTarget.querySelector("[data-card-export-text]");
    h.prepareSnapshotText(snapshot.clonedTarget);
    expect(clonedLabel.children).toHaveLength(1);
    expect(clonedLabel.children[0].tagName).toBe("IMG");
    expect(clonedLabel.children[0].alt).toBe(" 11/2–11/8  周日");
    expect(h.canvases[0].context.painted).toMatchObject({ font: "italic 700 15px 'System Font', serif", color: "rgb(255, 255, 255)" });
    expect(clonedLabel.style).toMatchObject({ display: "flex", gap: "4px", transform: "translateX(1px)", marginLeft: "3px", letterSpacing: "0px", lineHeight: "18px" });
    expect(label.textContent).toBe(" 11/2–11/8  周日"); expect(label.children).toEqual([child]); expect(label.style.letterSpacing).toBe("-0.02em");
    const clonedAmount = snapshot.clonedTarget.querySelector("[data-t0-fit]");
    expect(clonedAmount.textContent).toBe(amount.textContent); expect(clonedAmount.children).toHaveLength(0);
    expect(clonedAmount.style).toMatchObject({ color: "green", letterSpacing: "-0.04em" });
    snapshot.container.remove(); expect(h.document.body.children).toEqual([target]);
  });

  it("缺省computed字体与normal行高回退12/1.35，跳过空白标记及root自身，不误处理非标记日期", () => {
    const h = browserHarness(); const root = new MemoryElement(); root.setAttribute("data-card-export-text", "true"); root.ownText = "root";
    const label = root.appendChild(new MemoryElement()); label.textContent = "11/08"; label.setAttribute("data-card-export-text", "true");
    label.computed = { fontSize: "", lineHeight: "normal", fontStyle: "", fontWeight: "", fontFamily: "", color: "#abc" };
    const blank = root.appendChild(new MemoryElement()); blank.textContent = " \n "; blank.setAttribute("data-card-export-text", "true"); blank.style.letterSpacing = "2px";
    const unmarked = root.appendChild(new MemoryElement()); unmarked.textContent = "2026-11-08";
    h.prepareSnapshotText(root);
    expect(h.canvases).toHaveLength(1);
    expect(h.canvases[0].context.painted).toMatchObject({ text: "11/08", font: "normal 400 12px sans-serif", color: "#abc" });
    expect(label.style).toMatchObject({ lineHeight: "16.200000000000003px", letterSpacing: "0px" });
    expect(blank.textContent).toBe(" \n "); expect(blank.style.letterSpacing).toBe("2px");
    expect(unmarked.textContent).toBe("2026-11-08"); expect(root.ownText).toBe("root"); expect(root.children).toHaveLength(3);
  });

  it("真实每日列表标记七天日期和周标签，金额/颜色/百分比与输入Map完全不变", () => {
    const page = pageHarness();
    const daily = new Map([["2026-11-02", { order: 12.345678, commission: -2.345678, shared: 0 }]]);
    const before = JSON.stringify([...daily]);
    const tree = page.T0WeeklySettlementDailyIncomeProgressList({ weekStartBjt: "2026-11-02", dailyIncomeByDate: daily });
    expect(markedText(tree)).toEqual(["周一", "11/02", "周二", "11/03", "周三", "11/04", "周四", "11/05", "周五", "11/06", "周六", "11/07", "周日", "11/08"]);
    assertAmountsUnmarked(tree);
    expect(content(tree)).toContain("12.35-2.350.0010.00U");
    const bars = elements(tree).filter(node => node.props.title === "订单 12.35 U" || node.props.title === "分佣 -2.35 U");
    expect(bars.map(node => node.props.style.backgroundColor)).toEqual(["#2563eb", "#10b981"]);
    expect(bars.reduce((sum, node) => sum + Number.parseFloat(node.props.style.width), 0)).toBeCloseTo(100, 10);
    expect(JSON.stringify([...daily])).toBe(before);
  });

  it("真实个人卡周期与倒计时完整标记：实时/空值/切换/冻结状态，金额符号颜色与原值不变", () => {
    const page = pageHarness(); const report = sampleReport(); const before = JSON.stringify(report);
    for (const [countdown, isRealtimeWeek, status] of [[93784, true, "1天 02:03:04"], [null, true, "--:--:--"], [0, true, "切换中"], [-1, true, "切换中"], [10, false, "结算完成"]] as const) {
      const tree = page.T0MemberWeeklySettlementCurrentCard({ report, displayName: "甲", countdown, isRealtimeWeek });
      expect(markedText(tree)).toEqual(["11/2–11/8", status]); assertAmountsUnmarked(tree);
      expect(content(tree)).toContain("北京时间"); expect(content(tree)).toContain("1,099.12");
      const amounts = elements(tree).filter(node => "data-t0-fit" in node.props);
      expect(amounts[0].props.className).toContain("text-rose-600");
      expect(amounts.find(node => content(node) === "-101.00U").props.className).toContain("text-emerald-600");
    }
    expect(JSON.stringify(report)).toBe(before);
  });

  it("真实团队卡两个周期和倒计时标记，不包裹金额；loading/backfill状态仍同源", () => {
    const page = pageHarness(); const report = sampleReport();
    const teamSettlement = { ...report, enabled: true, status: "realtime", members: [] }; const before = JSON.stringify(teamSettlement);
    for (const [patch, status] of [[{}, "1天 02:03:04"], [{ countdown: null }, "--:--:--"], [{ countdown: 0 }, "切换中"], [{ isLoading: true }, "切换中"], [{ teamSettlement: { ...teamSettlement, status: "backfill" } }, "回溯核算"]] as const) {
      const tree = page.T0TeamWeeklySettlementCard({ teamSettlement, isLoading: false, hasError: false, countdown: 93784, ...patch });
      expect(markedText(tree)).toEqual(["11/2–11/8", status, "11月2日—11月8日"]); assertAmountsUnmarked(tree);
      expect(content(tree)).toContain("1,099.12"); expect(content(tree)).toContain("-101.00");
    }
    expect(JSON.stringify(teamSettlement)).toBe(before);
  });

  it("历史个人日历和全体概览执行真实中文/数字周期，跨年排他结束日仍正确且收益不标记", () => {
    const page = pageHarness(); const report = sampleReport(); report.period = { weekStartBjt: "2026-12-28", weekEndExclusiveBjt: "2027-01-04" };
    const calendar = page.T0HistoricalSettlementWeekCalendar({ reports: [{ id: "week", report }], selectedWeekStart: "2026-12-28", onSelectedWeekStartChange: vi.fn() });
    expect(markedText(calendar)).toEqual(["12月28日—1月3日"]); assertAmountsUnmarked(calendar);
    const admin = page.T0AdminWeeklySettlementOverviewCard({ report, isRealtimeWeek: false, onPreviousWeek: vi.fn(), onNextWeek: vi.fn(), hasPreviousWeek: false, hasNextWeek: false });
    expect(markedText(admin)).toEqual(["12/28–1/3"]); assertAmountsUnmarked(admin);
    expect(content(calendar)).toContain("1,099.12"); expect(content(admin)).toContain("1,099.12");
  });
});

describe("PNG整段水印与真实generatePreview资源顺序/清理", () => {
  it("水印整段R1/北京时间只绘一次模板并clone IMG，默认0.07与-22deg/78x245错位网格保持", () => {
    const h = browserHarness(); const { target } = targetWithDate(h);
    const time = production(exportAst, "formatBeijingTime")(new Date()); expect(time).toBe("2026-11-08 00:05:06");
    const text = `R1｜${time}`;
    const snapshot = h.createExactSnapshotContainer(target, text, 8, true, 0, "#fff", undefined, 0);
    expect(h.canvases).toHaveLength(0); expect(snapshot.finalizeSnapshot()).toEqual({ width: 336, height: 136 });
    expect(h.canvases).toHaveLength(1);
    calledOnceWith(h.canvases[0].context.measureText, text);
    calledOnceWith(h.canvases[0].context.fillText, text, 2, 10.5);
    expect(h.canvases[0].context.painted).toMatchObject({ font: "600 11px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", color: "rgba(51, 65, 85, 0.07)", baseline: "alphabetic" });
    const labels = snapshot.clonedTarget.querySelectorAll("[data-card-export-watermark-label]");
    expect(labels).toHaveLength(14); expect(new Set(labels).size).toBe(14);
    expect(labels.every((label: MemoryElement) => label.tagName === "IMG" && label.alt === text && label.src === h.images[0].src && label.style.transform === "rotate(-22deg)" && label.style.transformOrigin === "left top")).toBe(true);
    expect(labels.map((label: MemoryElement) => [label.style.left, label.style.top])).toEqual([["-120px", "-45px"], ["125px", "-45px"], ["370px", "-45px"], ["-245px", "33px"], ["0px", "33px"], ["245px", "33px"], ["490px", "33px"], ["-120px", "111px"], ["125px", "111px"], ["370px", "111px"], ["-245px", "189px"], ["0px", "189px"], ["245px", "189px"], ["490px", "189px"]]);
    expect(labels.every((label: MemoryElement) => label.textContent === "" && label.hasAttribute("data-card-export-raster-text"))).toBe(true);
    snapshot.finalizeSnapshot(); expect(snapshot.clonedTarget.querySelectorAll("[data-card-export-watermark]")).toHaveLength(1);
    expect(target.querySelectorAll("[data-card-export-watermark]")).toHaveLength(0); snapshot.container.remove();
  });

  it("水印透明度默认/非有限0.07，自定义与上下限0.01–0.2不改变整段时间-only和旋转", () => {
    for (const [opacity, expected] of [[undefined, 0.07], [NaN, 0.07], [Infinity, 0.07], [0.12, 0.12], [0, 0.01], [-1, 0.01], [1, 0.2]] as const) {
      const h = browserHarness(); const { target } = targetWithDate(h);
      const snapshot = h.createExactSnapshotContainer(target, "2026-11-08 00:05:06", 16, false, 16, undefined, opacity);
      expect(snapshot.initialSize).toEqual({ width: 352, height: 152 });
      expect(h.canvases[0].context.painted.color).toBe(`rgba(51, 65, 85, ${expected})`);
      calledOnceWith(h.canvases[0].context.measureText, "2026-11-08 00:05:06");
      expect(snapshot.clonedTarget.querySelectorAll("[data-card-export-watermark-label]").every((label: MemoryElement) => label.style.transform === "rotate(-22deg)")).toBe(true);
      snapshot.container.remove();
    }
  });

  it("真实full generate先等fonts/商品decode再prepare，第二次等日期decode及两帧，之后finalize/capture并finally清理", async () => {
    const h = browserHarness(); const font = deferred(), decode = deferred(); let waits = 0;
    h.fontReady = () => ++waits === 1 ? font.promise : Promise.resolve();
    const p = previewHarness(h, { captureFullContent: true, outerPadding: 8, fullContentHorizontalBleed: 0, fullContentBottomPadding: 0, exportBackground: "#fff", currentUser: { name: "不应泄露", id: 28 }, watermarkLabel: "不应泄露" });
    const product = p.target.appendChild(new MemoryElement("IMG")); product.src = "data:image/png;base64,product"; product.decode = vi.fn(async () => { h.events.push("product:decode"); });
    const originalCreate = h.document.createElement;
    h.document.createElement = (tag: string) => {
      const element = originalCreate(tag);
      if (tag === "img") element.decode = vi.fn(async () => { h.events.push(`decode:start:${element.alt}`); await decode.promise; h.events.push(`decode:done:${element.alt}`); });
      return element;
    };
    const running = p.run();
    expect(h.events).toEqual(["fonts:wait"]); expect(p.createExactSnapshotContainer).not.toHaveBeenCalled(); expect(p.prepareSnapshotText).not.toHaveBeenCalled(); expect(p.html2canvas).not.toHaveBeenCalled();
    font.resolve();
    for (let i = 0; i < 40 && !h.events.includes("decode:start:11/2–11/8"); i += 1) await Promise.resolve();
    expect(h.events.indexOf("product:decode")).toBeLessThan(h.events.indexOf("prepare"));
    expect(h.events.filter(event => event === "fonts:ready")).toHaveLength(3);
    expect(h.events.filter(event => event === "frame")).toHaveLength(2);
    expect(h.events).toContain("decode:start:11/2–11/8"); expect(p.html2canvas).not.toHaveBeenCalled(); expect(p.snapshot().finalizeSnapshot).not.toHaveBeenCalled();
    decode.resolve(); await running;
    expect(h.events.indexOf("decode:done:11/2–11/8")).toBeLessThan(h.events.indexOf("finalize"));
    expect(h.events.filter(event => event === "frame")).toHaveLength(6);
    expect(h.events.indexOf("finalize")).toBeLessThan(h.events.indexOf("capture"));
    expect(h.events.slice(-3)).toEqual(["capture", "blob:image/png", "cleanup"]);
    expect(p.html2canvas.mock.calls[0][1]).toMatchObject({ width: 336, height: 136, scale: 2, allowTaint: false, useCORS: true, scrollX: 0, scrollY: 0 });
    expect(p.states[2]).toMatchObject({ filename: "T+0-导出-周-报-20261108-000506.png", url: "blob:memory-preview" });
    expect(p.states[2].blob.type).toBe("image/png"); expect(p.snapshot().container.remove).toHaveBeenCalledOnce(); expect(p.setGenerating).toHaveBeenLastCalledWith(false);
    expect(h.document.body.children).toEqual([p.target]); expect(p.label.textContent).toBe("11/2–11/8"); expect(p.label.children).toHaveLength(0);
    expect(p.createExactSnapshotContainer.mock.calls[0][1]).toBe("R1｜2026-11-08 00:05:06"); expect(p.toast.error).not.toHaveBeenCalled();
    // full 水印在 finalize 创建后必须进入第三轮资源等待，解码完成才捕获。
    const watermarks = p.snapshot().clonedTarget.querySelectorAll("[data-card-export-watermark-label]");
    expect(watermarks.length).toBeGreaterThan(0); expect(watermarks[0].decode).toHaveBeenCalled();
    expect(h.events.indexOf(`decode:done:${watermarks[0].alt}`)).toBeGreaterThan(h.events.indexOf("finalize"));
    expect(h.events.indexOf(`decode:done:${watermarks[0].alt}`)).toBeLessThan(h.events.indexOf("capture"));
  });

  it("默认订单模式初始尺寸不再finalize，R1/time-only不泄露保存者，替换预览释放旧URL和clone", async () => {
    for (const watermarkMode of ["user-and-time", "time-only"]) {
      const h = browserHarness(); const p = previewHarness(h, { watermarkMode, currentUser: { displayName: "真实保存者" }, watermarkLabel: "真实保存者" });
      p.states[2] = { url: "blob:old" };
      await p.run();
      expect(p.snapshot().initialSize).toEqual({ width: 352, height: 152 }); expect(p.snapshot().finalizeSnapshot).not.toHaveBeenCalled();
      expect(p.createExactSnapshotContainer.mock.calls[0][1]).toBe(watermarkMode === "time-only" ? "2026-11-08 00:05:06" : "R1｜2026-11-08 00:05:06");
      calledOnceWith(p.url.revokeObjectURL, "blob:old"); expect(p.prepareSnapshotText).toHaveBeenCalledOnce();
      expect(h.events.indexOf("prepare")).toBeGreaterThan(h.events.indexOf("fonts:ready"));
      expect(h.events.filter(event => event === "fonts:ready")).toHaveLength(4);
      expect(h.events.indexOf(`measure:${p.createExactSnapshotContainer.mock.calls[0][1]}`)).toBeGreaterThan(h.events.indexOf("fonts:ready"));
      expect(p.html2canvas.mock.calls[0][1]).toMatchObject({ width: 352, height: 152, scale: 2 });
      expect(h.document.body.children).toEqual([p.target]); expect(p.states[0]).toBe(false);
      expect(p.snapshot().clonedTarget.querySelectorAll("[data-card-export-watermark-label]").every((label: MemoryElement) => label.decode.mock.calls.length > 0)).toBe(true);
      expect(elements(p.tree).find(node => node.type === "button").props.className).toContain("rounded-full");
    }
  });

  it("真实generate在字体/绘制/capture/PNG失败均toast并finally释放clone/reset，缺target和generating不启动", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (const stage of ["fonts", "paint", "capture", "blob"]) {
      const h = browserHarness(); const overrides: Record<string, any> = {};
      if (stage === "fonts") h.fontReady = () => Promise.reject(new Error("字体失败"));
      if (stage === "paint") h.noContext = true;
      if (stage === "capture") overrides.html2canvas = vi.fn(async () => { throw new Error("截图失败"); });
      if (stage === "blob") overrides.html2canvas = vi.fn(async () => ({ toBlob: (callback: any) => callback(null) }));
      const p = previewHarness(h, { captureFullContent: true }, overrides); await p.run();
      expect(p.toast.error).toHaveBeenCalledOnce(); expect(p.toast.error.mock.calls[0][0]).toContain("图片生成失败：");
      expect(p.states[2]).toBeNull(); expect(p.url.createObjectURL).not.toHaveBeenCalled();
      if (stage === "fonts") expect(p.createExactSnapshotContainer).not.toHaveBeenCalled();
      else expect(p.snapshot().container.remove).toHaveBeenCalledOnce();
      expect(p.setGenerating).toHaveBeenLastCalledWith(false); expect(h.document.body.children).toEqual([p.target]);
      expect(p.label.children).toHaveLength(0);
    }
    const missing = previewHarness(browserHarness(), { targetRef: { current: null } }); await missing.run();
    expect(missing.createExactSnapshotContainer).not.toHaveBeenCalled(); expect(missing.setGenerating).not.toHaveBeenCalled();
    const busy = previewHarness(browserHarness(), {}, { useState: (value: any) => [value === false ? true : value, vi.fn()] }); await busy.run();
    expect(busy.createExactSnapshotContainer).not.toHaveBeenCalled();
  });
});
