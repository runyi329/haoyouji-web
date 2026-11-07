import { useEffect } from "react";

const SCOPE = "[data-t0-responsive]";
const IGNORE = "[data-t0-fit-ignore], [data-t0-measure], svg, canvas, img, video, input, textarea, select, script, style, [contenteditable]:not([contenteditable='false'])";
const MIN_FONT = 10;
const FONT_VAR = "--t0-fit-font-size";
const NUMBER = /^[+−\-]?\s*(?:(?:USDT|USD|CNY|RMB|ETH|BTC|[¥￥$€£])\s*)?(?:\d{1,3}(?:[,，]\d{3})+|\d+)(?:\.\d+)?(?:[eE][+−\-]?\d+)?\s*(?:%|％|USDT|USD|CNY|RMB|ETH|BTC|[uUE元万亿美金美元人民币]|万元|亿元)?$/i;
const fixedSizeClasses = (element: HTMLElement) => /(?:^|\s)(?:w-(?:\d|\[)|size-)/.test(element.className) && /(?:^|\s)(?:h-(?:\d|\[)|size-)/.test(element.className);
const COPY_STYLES = [
  "display", "box-sizing", "font-family", "font-size", "font-weight", "font-style",
  "font-stretch", "font-variant", "font-feature-settings", "font-variation-settings",
  "font-kerning", "font-optical-sizing", "letter-spacing", "word-spacing", "line-height",
  "text-transform", "text-indent", "direction", "writing-mode", "vertical-align",
  "padding-top", "padding-right", "padding-bottom", "padding-left",
  "border-top-width", "border-right-width", "border-bottom-width", "border-left-width",
  "border-style", "margin-top", "margin-right", "margin-bottom", "margin-left",
  "gap", "row-gap", "column-gap", "flex-direction", "align-items", "justify-content",
] as const;

type FontNode = { element: HTMLElement; size: number; variable: string; priority: string };
type Candidate = {
  element: HTMLElement;
  scope: HTMLElement;
  visible: boolean;
  fonts: FontNode[];
  ancestors: HTMLElement[];
  flows: HTMLElement[];
  dirty: boolean;
  prepared: boolean;
  naturalWidth: number;
  floorWidth: number;
  ratio: number;
  overflow: boolean;
};

const px = (value: string) => Number.parseFloat(value) || 0;
const elements = (root: HTMLElement) => [root, ...root.querySelectorAll<HTMLElement>("*")].filter(node => node instanceof HTMLElement && !node.closest("[data-t0-measure]"));
const plainStyle = (style: string | null) => (style || "")
  .replace(/(?:^|;)\s*--t0-fit-font-size\s*:[^;]*/g, "")
  .replace(/;\s*$/, "").trim();

/**
 * Call once in T0Journal and import ../styles/t0-responsive.css there.
 * Portal dialogs opt in separately with data-t0-responsive.
 * data-t0-fit: one complete number, including all fraction/unit spans (not a card).
 * data-t0-wrap: a toolbar/title/row permitted to wrap.
 * data-t0-fit-ignore: opt out an entire chip/quote/fixed-layout subtree.
 * No text, handlers, input values, or financial calculations are changed.
 */
export function useT0ResponsiveLayout(): void {
  useEffect(() => retainLayout(), []);
}

// Shared service also makes multiple callers and React StrictMode safe.
let users = 0;
let stop: (() => void) | undefined;
function retainLayout() {
  if (typeof document === "undefined") return;
  if (users++ === 0) stop = startLayout();
  return () => {
    if (--users === 0) { stop?.(); stop = undefined; }
  };
}

function startLayout(): () => void {
  const candidates = new Map<HTMLElement, Candidate>();
  const scopes = new Map<HTMLElement, MutationObserver>();
  const hosts = new Map<HTMLElement, HTMLElement>();
  const layoutRefs = new Map<HTMLElement, number>();
  const flowRefs = new Map<HTMLElement, number>();
  const pending = new Set<Candidate>();
  const scans = new Map<HTMLElement, TreeWalker>();
  const visible = new Set<Candidate>();
  const verify = new Set<Candidate>();
  const resizeRefs = new Map<Element, number>();
  const resizeWidths = new WeakMap<Element, number>();
  let frame = 0;
  let closed = false;

  const request = () => {
    if (!closed && !frame && !document.hidden) frame = requestAnimationFrame(flush);
  };
  const enqueue = (candidate: Candidate) => {
    if (candidate.visible) { pending.add(candidate); request(); }
  };
  const enqueueVisible = () => { visible.forEach(enqueue); request(); };
  const invalidateVisible = () => {
    visible.forEach(candidate => { candidate.dirty = true; enqueue(candidate); });
  };
  const viewportChanged = () => {
    // A new viewport may grow fonts again; self-induced flex resizes may only
    // shrink. Otherwise intrinsic flex bases oscillate with the applied font.
    visible.forEach(candidate => { candidate.ratio = 1; enqueue(candidate); });
  };
  const resize = typeof ResizeObserver !== "undefined" ? new ResizeObserver(entries => {
    for (const entry of entries) {
      const width = entry.contentRect.width;
      const previous = resizeWidths.get(entry.target);
      if (previous !== undefined && Math.abs(previous - width) < 0.5) continue;
      resizeWidths.set(entry.target, width);
      // Only visible candidates; no measuring thousands of off-screen orders.
      for (const candidate of visible) {
        if (entry.target === candidate.element || entry.target.contains(candidate.element)) enqueue(candidate);
      }
    }
  }) : undefined;
  const observeSize = (element: Element, add: boolean) => {
    const count = resizeRefs.get(element) || 0;
    if (add) {
      resizeRefs.set(element, count + 1);
      if (!count) resize?.observe(element);
    } else if (count <= 1) {
      resizeRefs.delete(element); resizeWidths.delete(element); resize?.unobserve(element);
    } else resizeRefs.set(element, count - 1);
  };
  const setVisible = (candidate: Candidate, value: boolean) => {
    if (candidate.visible === value) return;
    candidate.visible = value;
    if (value) visible.add(candidate); else { visible.delete(candidate); pending.delete(candidate); verify.delete(candidate); }
    observeSize(candidate.element, value);
    for (const ancestor of candidate.ancestors) observeSize(ancestor, value);
    if (value) enqueue(candidate);
  };
  const intersection = typeof IntersectionObserver !== "undefined" ? new IntersectionObserver(entries => {
    for (const entry of entries) {
      const candidate = candidates.get(entry.target as HTMLElement);
      if (candidate) setVisible(candidate, entry.isIntersecting);
    }
  }, { rootMargin: "96px 0px" }) : undefined;

  const addScan = (element: HTMLElement) => {
    if (element.closest("[data-t0-measure]") || !element.closest(SCOPE)) return;
    // Dialogs/cards mounted after the initial scope scan must get the same
    // explicit-first treatment, including markers nested in their new root.
    if (element.hasAttribute("data-t0-fit")) inspect(element);
    element.querySelectorAll<HTMLElement>("[data-t0-fit]").forEach(node => inspect(node));
    // A queued ancestor already covers this subtree.
    for (const root of scans.keys()) if (root.contains(element)) return;
    for (const root of scans.keys()) if (element.contains(root)) scans.delete(root);
    scans.set(element, document.createTreeWalker(element, NodeFilter.SHOW_ELEMENT));
    inspect(element);
    request();
  };

  function permitted(element: HTMLElement, explicit: boolean) {
    if (!element.closest(SCOPE) || element.closest(IGNORE)) return false;
    // One owner for nested spans: two fitters must never overwrite each
    // other's baseline font sizes. The outer marker measures the entire run.
    if (element.parentElement?.closest("[data-t0-fit]")) return false;
    if (element.closest("[data-t0-fit]") !== (explicit ? element : null)) return false;
    if (explicit) return true;
    if (element.childElementCount || !NUMBER.test((element.textContent || "").trim().normalize("NFKC"))) return false;
    // Conservative opt-in: auto fitting never touches a floating quote, chip,
    // square avatar/control or replaced element. Explicit fit remains available.
    let ancestor: HTMLElement | null = element;
    while (ancestor && !ancestor.matches(SCOPE)) {
      if (/\b(?:absolute|fixed)\b/.test(ancestor.className) || ancestor.style.position === "absolute" || ancestor.style.position === "fixed") return false;
      if (fixedSizeClasses(ancestor)) return false;
      ancestor = ancestor.parentElement;
    }
    return true;
  }

  function inspect(element: HTMLElement, invalidate = false) {
    const existing = candidates.get(element);
    const explicit = element.hasAttribute("data-t0-fit");
    if (!permitted(element, explicit)) { if (existing) remove(existing); return; }
    if (existing) {
      if (invalidate) { existing.dirty = true; existing.prepared = false; }
      enqueue(existing); return;
    }
    const scope = element.closest<HTMLElement>(SCOPE)!;
    const candidate: Candidate = { element, scope, visible: false, fonts: [], ancestors: [], flows: [], dirty: true, prepared: false, naturalWidth: 0, floorWidth: 0, ratio: 1, overflow: false };
    candidates.set(element, candidate);
    if (intersection) intersection.observe(element);
    else { setVisible(candidate, nearViewport(element)); }
  }

  function restoreFonts(candidate: Candidate) {
    for (const node of candidate.fonts) {
      node.element.removeAttribute("data-t0-fit-node");
      if (node.variable) node.element.style.setProperty(FONT_VAR, node.variable, node.priority);
      else node.element.style.removeProperty(FONT_VAR);
    }
    candidate.fonts = [];
  }
  function restoreFlow(candidate: Candidate) {
    for (const ancestor of candidate.flows) {
      const count = flowRefs.get(ancestor) || 0;
      if (count <= 1) { flowRefs.delete(ancestor); ancestor.removeAttribute("data-t0-fit-flow"); }
      else flowRefs.set(ancestor, count - 1);
    }
    candidate.flows = [];
  }
  function releaseAncestors(candidate: Candidate) {
    for (const ancestor of candidate.ancestors) {
      if (candidate.visible) observeSize(ancestor, false);
      const count = layoutRefs.get(ancestor) || 0;
      if (count <= 1) {
        layoutRefs.delete(ancestor);
        ancestor.removeAttribute("data-t0-layout-item");
        ancestor.removeAttribute("data-t0-fit-flow");
      } else layoutRefs.set(ancestor, count - 1);
    }
    candidate.ancestors = [];
  }
  function remove(candidate: Candidate) {
    setVisible(candidate, false);
    intersection?.unobserve(candidate.element);
    restoreFlow(candidate);
    releaseAncestors(candidate);
    restoreFonts(candidate);
    for (const name of ["data-t0-fitted", "data-t0-fit-inline", "data-t0-fit-overflow", "data-t0-fit-flow"]) candidate.element.removeAttribute(name);
    candidates.delete(candidate.element);
  }

  function prepareAncestors(candidate: Candidate) {
    const next: HTMLElement[] = [];
    let item: HTMLElement | null = candidate.element;
    while (item && item !== candidate.scope) {
      if (item.matches("[data-t0-fit-ignore]")) break;
      const style = getComputedStyle(item);
      // Do not change absolute/fixed quote positions or fixed-size icons/chips.
      if (style.position === "absolute" || style.position === "fixed") break;
      const parent: HTMLElement | null = item.parentElement;
      if (!parent) break;
      const parentStyle = getComputedStyle(parent);
      const fixedControl = fixedSizeClasses(item);
      if (!fixedControl && /^(inline-)?(flex|grid)$/.test(parentStyle.display)) {
        next.push(item);
      }
      item = parent;
    }
    // All ancestor style reads precede writes; never alternate min-width writes
    // and getComputedStyle at every level of a large order list.
    for (const ancestor of next) ancestor.setAttribute("data-t0-layout-item", "");
    // Parent can resize even when this is an inline child, not a flex/grid item.
    const parent = candidate.element.parentElement;
    if (parent && candidate.scope.contains(parent) && !next.includes(parent)) next.push(parent);
    // Keep subscriptions stable: unobserve/observe per fit creates an endless
    // stream of initial ResizeObserver notifications even at the same width.
    for (const old of candidate.ancestors) if (!next.includes(old)) {
      if (candidate.visible) observeSize(old, false);
      const count = layoutRefs.get(old) || 0;
      if (count <= 1) {
        layoutRefs.delete(old);
        old.removeAttribute("data-t0-layout-item");
        old.removeAttribute("data-t0-fit-flow");
      } else layoutRefs.set(old, count - 1);
    }
    for (const ancestor of next) if (!candidate.ancestors.includes(ancestor)) {
      layoutRefs.set(ancestor, (layoutRefs.get(ancestor) || 0) + 1);
      if (candidate.visible) observeSize(ancestor, true);
    }
    candidate.ancestors = next;
    candidate.prepared = true;
  }

  function measurementHost(scope: HTMLElement) {
    let host = hosts.get(scope);
    if (!host) {
      host = document.createElement("div");
      host.setAttribute("data-t0-measure", "");
      host.setAttribute("aria-hidden", "true");
      host.setAttribute("inert", "");
      // The host lives INSIDE the scope; nothing is measured by altering content.
      scope.appendChild(host);
      hosts.set(scope, host);
    }
    return host;
  }

  function fit(candidate: Candidate) {
    const element = candidate.element;
    if (!element.isConnected || element.closest(SCOPE) !== candidate.scope || !permitted(element, element.hasAttribute("data-t0-fit"))) { remove(candidate); return; }
    if (!element.getClientRects().length) return; // RO / mutations / IO wake hidden elements later.
    if (!candidate.prepared) prepareAncestors(candidate);
    if (candidate.dirty) measureBaseline(candidate);
    // Never restore live fonts on RO. Cached two-endpoint widths include unit
    // spans/gaps. The chord is conservative when individual runs hit 10px.
    const available = Math.max(0, availableWidth(element) - 1);
    const floorRatio = MIN_FONT / Math.max(MIN_FONT, ...candidate.fonts.map(node => node.size));
    let ratio = available >= candidate.naturalWidth ? 1 :
      floorRatio + (1 - floorRatio) * Math.max(0, Math.min(1,
        (available - candidate.floorWidth) / Math.max(1, candidate.naturalWidth - candidate.floorWidth)));
    ratio = Math.min(candidate.ratio, ratio);
    const overflow = candidate.floorWidth > available;
    if (overflow) ratio = 0;
    applyFit(candidate, ratio, overflow);
    if (!overflow) verify.add(candidate);
  }

  function measureBaseline(candidate: Candidate) {
    const element = candidate.element;
    restoreFonts(candidate); // Only new/externally changed content, never a resize.
    const sourceNodes = elements(element);
    const sourceStyles = sourceNodes.map(source => getComputedStyle(source));
    const originalDisplay = sourceStyles[0].display;
    if (originalDisplay === "inline") element.setAttribute("data-t0-fit-inline", "");
    else element.removeAttribute("data-t0-fit-inline");
    element.setAttribute("data-t0-fitted", "");
    const clone = element.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("[data-t0-measure]").forEach(node => node.remove());
    const cloneNodes = elements(clone);
    sourceNodes.forEach((source, index) => {
      const target = cloneNodes[index];
      const style = sourceStyles[index];
      const size = Math.max(MIN_FONT, px(style.fontSize));
      candidate.fonts.push({ element: source, size, variable: source.style.getPropertyValue(FONT_VAR), priority: source.style.getPropertyPriority(FONT_VAR) });
      for (const property of COPY_STYLES) target.style.setProperty(property, style.getPropertyValue(property), "important");
      for (const name of ["id", "name", "autofocus", "data-t0-fit", "data-t0-fitted", "data-t0-fit-node", "data-t0-layout-item", "data-t0-fit-overflow", "data-t0-fit-flow", "data-t0-fit-inline"]) target.removeAttribute(name);
      target.style.removeProperty(FONT_VAR);
      target.style.setProperty("font-size", `${size}px`, "important");
      target.style.setProperty("white-space", "nowrap", "important");
      target.style.setProperty("overflow", "visible", "important");
      target.style.setProperty("text-overflow", "clip", "important");
      target.style.setProperty("max-width", "none", "important");
      target.style.setProperty("min-width", "0", "important");
      target.style.setProperty("flex-shrink", "0", "important");
      target.style.setProperty("flex-wrap", "nowrap", "important");
    });
    for (const property of ["width", "height"]) clone.style.setProperty(property, "max-content", "important");
    clone.style.setProperty("position", "static", "important");
    clone.style.setProperty("margin", "0", "important");
    clone.style.setProperty("transform", "none", "important");
    if (originalDisplay === "inline") clone.style.setProperty("display", "inline-block", "important");
    measurementHost(candidate.scope).appendChild(clone);
    candidate.naturalWidth = Math.max(clone.getBoundingClientRect().width, clone.scrollWidth);
    cloneNodes.forEach(node => node.style.setProperty("font-size", `${MIN_FONT}px`, "important"));
    candidate.floorWidth = Math.max(clone.getBoundingClientRect().width, clone.scrollWidth);
    clone.remove();
    candidate.dirty = false;
    candidate.ratio = 1;
  }

  function applyFit(candidate: Candidate, ratio: number, overflow: boolean) {
    const element = candidate.element;
    candidate.ratio = ratio;
    for (const node of candidate.fonts) {
      const value = `${Math.max(MIN_FONT, node.size * ratio).toFixed(3)}px`;
      if (node.element.style.getPropertyValue(FONT_VAR) !== value) node.element.style.setProperty(FONT_VAR, value);
      if (!node.element.hasAttribute("data-t0-fit-node")) node.element.setAttribute("data-t0-fit-node", "");
    }
    if (candidate.overflow === overflow) return;
    candidate.overflow = overflow;
    if (!overflow) {
      element.removeAttribute("data-t0-fit-overflow");
      restoreFlow(candidate);
    } else {
      element.setAttribute("data-t0-fit-overflow", "");
      // Unclip only the numeric layout path, never scroll containers or floating quotes.
      const next: HTMLElement[] = [];
      for (const ancestor of candidate.ancestors) {
        const style = getComputedStyle(ancestor);
        if (ancestor !== candidate.scope && !/auto|scroll/.test(`${style.overflowX} ${style.overflowY}`) && style.position !== "absolute" && style.position !== "fixed") {
          next.push(ancestor);
        }
      }
      for (const ancestor of next) {
        candidate.flows.push(ancestor);
        flowRefs.set(ancestor, (flowRefs.get(ancestor) || 0) + 1);
        ancestor.setAttribute("data-t0-fit-flow", "");
      }
    }
  }

  function verifyFit(candidate: Candidate) {
    const element = candidate.element;
    if (!candidate.visible || candidate.overflow || !element.isConnected || !element.getClientRects().length) return;
    const available = availableWidth(element);
    // scrollWidth misses the left-hand overflow of centered flex numbers in
    // WebKit. A range also includes the actual decimal/unit text extents.
    const range = document.createRange();
    range.selectNodeContents(element);
    const rendered = Math.max(element.scrollWidth, range.getBoundingClientRect().width);
    if (rendered <= available + 0.5) return;
    const currentMax = Math.max(...candidate.fonts.map(node => Math.max(MIN_FONT, node.size * candidate.ratio)));
    const floor = currentMax <= MIN_FONT + 0.01 || candidate.floorWidth > Math.max(0, available - 1);
    const ratio = floor ? 0 : candidate.ratio * Math.max(0, (available - 1) / Math.max(1, rendered));
    applyFit(candidate, ratio, floor);
    // At most one extra read/write per candidate per frame. Tail scheduling
    // makes sibling fits finish before a flex-feedback candidate runs again.
    if (!floor) { verify.add(candidate); request(); }
  }

  function scopeMutations(records: MutationRecord[]) {
    for (const record of records) {
      const target = record.target instanceof HTMLElement ? record.target : record.target.parentElement;
      if (!target || target.closest("[data-t0-measure]")) continue;
      if (record.type === "childList" && [...record.addedNodes, ...record.removedNodes].every(node => node instanceof HTMLElement && node.hasAttribute("data-t0-measure"))) continue;
      // Ignore ONLY our custom variable writes; a React style/font change still wakes us.
      if (record.type === "attributes" && record.attributeName === "style" && plainStyle(record.oldValue) === plainStyle(target.getAttribute("style"))) continue;
      let owner = target.closest<HTMLElement>("[data-t0-fit], [data-t0-fitted]");
      // Inner explicit decimal/quantity spans are intentionally not separate
      // fitters; their text mutations must invalidate the outer number owner.
      while (owner && !candidates.has(owner)) owner = owner.parentElement?.closest<HTMLElement>("[data-t0-fit], [data-t0-fitted]") || null;
      if (owner) inspect(owner, true);
      // Text in a sibling label consumes width too, without changing parent
      // width. Refit only nearby visible candidates, not every order on a tick.
      const row = target.parentElement;
      for (const candidate of visible) if (target.contains(candidate.element) || row?.contains(candidate.element)) {
        if (target.contains(candidate.element)) { candidate.dirty = true; candidate.prepared = false; }
        enqueue(candidate);
      }
      if (record.type === "childList") {
        inspect(target, true);
        for (const node of record.addedNodes) if (node instanceof HTMLElement) addScan(node);
        if (record.removedNodes.length) request();
      } else if (record.type === "characterData") inspect(target, true);
      else {
        addScan(target);
        for (const candidate of visible) if (target.contains(candidate.element)) enqueue(candidate);
      }
    }
  }

  function addScope(scope: HTMLElement) {
    if (scopes.has(scope) || scope.closest("[data-t0-measure]")) return;
    const observer = new MutationObserver(scopeMutations);
    observer.observe(scope, { subtree: true, childList: true, characterData: true, attributes: true, attributeOldValue: true,
      attributeFilter: ["class", "style", "hidden", "aria-hidden", "open", "data-t0-fit", "data-t0-fit-ignore", "data-t0-wrap"] });
    scopes.set(scope, observer);
    observeSize(scope, true);
    // Explicit amounts get IO subscriptions immediately, before walking the
    // thousands of unrelated page nodes for conservative numeric auto opt-in.
    scope.querySelectorAll<HTMLElement>("[data-t0-fit]").forEach(element => inspect(element));
    addScan(scope);
  }
  const discover = (root: HTMLElement) => {
    if (root.closest("[data-t0-measure]")) return;
    if (root.matches(SCOPE)) addScope(root);
    root.querySelectorAll<HTMLElement>(SCOPE).forEach(addScope);
  };
  const discovery = new MutationObserver(records => {
    let stylesheetChanged = false;
    for (const record of records) {
      const target = record.target instanceof Element ? record.target : record.target.parentElement;
      if (target?.closest("[data-t0-measure]")) continue;
      if (record.type === "attributes" && record.target instanceof HTMLElement) {
        if (record.target.matches(SCOPE)) addScope(record.target);
        request();
      }
      if (record.type === "childList") for (const node of record.addedNodes) {
        if (node instanceof HTMLElement) {
          discover(node);
          if (node.matches("style, link[rel='stylesheet']")) stylesheetChanged = true;
        }
      }
      if (record.target instanceof HTMLStyleElement || record.target.parentElement instanceof HTMLStyleElement) stylesheetChanged = true;
      if (record.type === "childList" && [...record.removedNodes].some(node => !(node instanceof HTMLElement && node.hasAttribute("data-t0-measure")))) request();
    }
    if (stylesheetChanged) invalidateVisible();
  });
  discovery.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["data-t0-responsive"] });

  function flush() {
    frame = 0;
    if (closed || document.hidden) return;
    for (const [scope, observer] of scopes) if (!scope.isConnected || !scope.matches(SCOPE)) {
      observer.disconnect(); scopes.delete(scope); observeSize(scope, false);
      hosts.get(scope)?.remove(); hosts.delete(scope);
    }
    for (const candidate of candidates.values()) if (!candidate.element.isConnected || candidate.element.closest(SCOPE) !== candidate.scope) remove(candidate);
    const start = performance.now();
    const scanDeadline = start + 2;
    const deadline = start + 10;
    // Snapshot and remove before verification; a failed check returns at the
    // tail for the next frame, not an unbounded Set iteration in this frame.
    const checks = Array.from(verify).slice(0, 12);
    checks.forEach(candidate => verify.delete(candidate));
    checks.forEach(verifyFit);
    // Incremental discovery is cheap and never performs layout on off-screen rows.
    let scanned = 0;
    for (const [root, walker] of scans) {
      if (!root.isConnected || !root.closest(SCOPE)) { scans.delete(root); continue; }
      let node: Node | null;
      while ((node = walker.nextNode())) {
        if (node instanceof HTMLElement && !node.closest("[data-t0-measure]")) inspect(node);
        if (++scanned >= 200 || performance.now() >= scanDeadline) break;
      }
      if (!node) scans.delete(root);
      if (scanned >= 200 || performance.now() >= scanDeadline) break;
    }
    if (!intersection) for (const candidate of candidates.values()) setVisible(candidate, nearViewport(candidate.element));
    let measured = 0;
    for (const candidate of Array.from(pending)) {
      // Scans/one expensive first clone cannot starve every other visible value.
      if (measured >= 4 && performance.now() >= deadline) break;
      pending.delete(candidate);
      if (candidate.visible) fit(candidate);
      if (++measured >= 12) break;
    }
    if (pending.size || scans.size || verify.size) request();
  }

  const fallbackScroll = () => { if (!intersection) request(); };
  const resume = () => { if (!document.hidden) enqueueVisible(); };
  const stylesheetLoaded = (event: Event) => {
    if (event.target instanceof HTMLLinkElement && event.target.rel === "stylesheet") invalidateVisible();
  };
  const ancestorFonts = new MutationObserver(invalidateVisible);
  ancestorFonts.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
  if (document.body) ancestorFonts.observe(document.body, { attributes: true, attributeFilter: ["class", "style"] });
  discover(document.documentElement);
  window.addEventListener("resize", viewportChanged, { passive: true });
  window.addEventListener("orientationchange", viewportChanged, { passive: true });
  window.addEventListener("pageshow", enqueueVisible);
  window.addEventListener("scroll", fallbackScroll, { passive: true, capture: true });
  window.visualViewport?.addEventListener("resize", viewportChanged, { passive: true });
  document.addEventListener("visibilitychange", resume);
  document.addEventListener("load", stylesheetLoaded, true);
  document.fonts?.addEventListener("loadingdone", invalidateVisible);
  document.fonts?.addEventListener("loadingerror", invalidateVisible);
  document.fonts?.ready.then(() => { if (!closed) invalidateVisible(); });
  return () => {
    closed = true;
    cancelAnimationFrame(frame);
    discovery.disconnect(); scopes.forEach(observer => observer.disconnect());
    ancestorFonts.disconnect();
    intersection?.disconnect(); resize?.disconnect();
    for (const candidate of candidates.values()) remove(candidate);
    hosts.forEach(host => host.remove());
    window.removeEventListener("resize", viewportChanged);
    window.removeEventListener("orientationchange", viewportChanged);
    window.removeEventListener("pageshow", enqueueVisible);
    window.removeEventListener("scroll", fallbackScroll, true);
    window.visualViewport?.removeEventListener("resize", viewportChanged);
    document.removeEventListener("visibilitychange", resume);
    document.removeEventListener("load", stylesheetLoaded, true);
    document.fonts?.removeEventListener("loadingdone", invalidateVisible);
    document.fonts?.removeEventListener("loadingerror", invalidateVisible);
  };
}

function nearViewport(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && rect.bottom >= -96 && rect.top <= window.innerHeight + 96;
}

function availableWidth(element: HTMLElement): number {
  const rect = element.getBoundingClientRect();
  let width = rect.width;
  const scope = element.closest(SCOPE);
  const parent = element.parentElement;
  if (!parent || element === scope) return width;
  const style = getComputedStyle(parent);
  // An inline parent's clientWidth is 0; its actual rect is still meaningful.
  const innerWidth = parent.clientWidth || parent.getBoundingClientRect().width - px(style.borderLeftWidth) - px(style.borderRightWidth);
  const parentWidth = innerWidth - px(style.paddingLeft) - px(style.paddingRight);
  const own = getComputedStyle(element);
  const margins = px(own.marginLeft) + px(own.marginRight);
  width = Math.min(width, parentWidth - margins);
  if (/^(inline-)?flex$/.test(style.display) && style.flexDirection.startsWith("row") && style.flexWrap === "nowrap") {
    let occupied = 0, siblings = 0;
    for (const sibling of parent.children) {
      if (sibling === element || !(sibling instanceof HTMLElement) || sibling.hasAttribute("data-t0-measure")) continue;
      const siblingStyle = getComputedStyle(sibling);
      if (siblingStyle.display === "none" || siblingStyle.position === "absolute" || siblingStyle.position === "fixed") continue;
      occupied += sibling.getBoundingClientRect().width + px(siblingStyle.marginLeft) + px(siblingStyle.marginRight);
      siblings++;
    }
    width = Math.min(width, parentWidth - occupied - px(style.columnGap) * siblings - margins);
  }
  // Cap overflowing nowrap inline runs to every in-scope ancestor's content
  // box as well; a narrow grid cell may contain an intrinsically wider span.
  let ancestor: HTMLElement | null = parent;
  while (ancestor) {
    const ancestorStyle = getComputedStyle(ancestor);
    const inner = ancestor.clientWidth || ancestor.getBoundingClientRect().width - px(ancestorStyle.borderLeftWidth) - px(ancestorStyle.borderRightWidth);
    width = Math.min(width, inner - px(ancestorStyle.paddingLeft) - px(ancestorStyle.paddingRight));
    if (ancestor === scope) break;
    ancestor = ancestor.parentElement;
  }
  return Math.max(0, width);
}
