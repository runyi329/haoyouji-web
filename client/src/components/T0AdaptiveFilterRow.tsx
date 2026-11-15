import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";

/** 先满足各控件的原字号内容宽度，再均分剩余留白；总宽不足时由文字换行兜底。 */
export function distributeT0FilterWidths(naturalWidths: number[], availableWidth: number, minimumWidths?: number[]): number[] {
  if (!naturalWidths.length) return [];
  const widths = naturalWidths.map((width) => Number.isFinite(width) ? Math.max(1, width) : 1);
  const available = Number.isFinite(availableWidth) ? Math.max(0, availableWidth) : 0;
  const total = widths.reduce((sum, width) => sum + width, 0);
  if (total <= available) {
    const spare = (available - total) / widths.length;
    return widths.map((width) => width + spare);
  }
  const minima = widths.map((width, index) => Math.min(width, Math.max(1, minimumWidths?.[index] || 44)));
  const minimumTotal = minima.reduce((sum, width) => sum + width, 0);
  if (minimumTotal >= available) return minima.map((width) => available * width / minimumTotal);
  const weights = widths.map((width, index) => Math.max(1, width - minima[index]));
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  const remainder = available - minimumTotal;
  return weights.map((weight, index) => minima[index] + remainder * weight / weightTotal);
}

/** 复用原按钮、原菜单和原事件，仅按真实DOM字号/标签/箭头/内边距调整整行列宽。 */
export function T0AdaptiveFilterRow({ children, className, style }: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  // 估算样式仅用于首次绘制；之后由真实测宽接管，不能被行情重渲染写回。
  const initialStyleRef = useRef(style);
  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    let frame = 0;
    let disposed = false;
    const sync = () => {
      frame = 0;
      if (disposed || !row.isConnected || !row.getClientRects().length) return;
      const controls = Array.from(row.children).filter((node): node is HTMLElement => node instanceof HTMLElement);
      if (!controls.length) return;
      const rowStyle = getComputedStyle(row);
      const gap = Number.parseFloat(rowStyle.columnGap) || 0;
      const available = row.clientWidth - (Number.parseFloat(rowStyle.paddingLeft) || 0)
        - (Number.parseFloat(rowStyle.paddingRight) || 0) - gap * (controls.length - 1);
      if (available <= 0) return;
      const host = document.createElement("div");
      host.setAttribute("data-t0-filter-measure", "");
      host.setAttribute("data-t0-fit-ignore", "");
      host.setAttribute("aria-hidden", "true");
      host.setAttribute("inert", "");
      host.style.cssText = "position:fixed;left:-100000px;top:0;width:max-content;visibility:hidden;pointer-events:none;";
      const clones = controls.map((control) => {
        const trigger = control.matches("button") ? control : control.querySelector("button") || control;
        const clone = trigger.cloneNode(true) as HTMLElement;
        const sourceNodes = [trigger, ...trigger.querySelectorAll<HTMLElement>("span")];
        const clonedNodes = [clone, ...clone.querySelectorAll<HTMLElement>("span")];
        sourceNodes.forEach((source, index) => {
          const target = clonedNodes[index];
          if (!target) return;
          const computed = getComputedStyle(source);
          for (const property of ["font-family", "font-size", "font-weight", "letter-spacing", "padding-left", "padding-right", "column-gap", "border-left-width", "border-right-width"] as const) {
            target.style.setProperty(property, computed.getPropertyValue(property), "important");
          }
          target.removeAttribute("id");
          target.removeAttribute("data-t0-fit-node");
          target.style.setProperty("width", "max-content", "important");
          target.style.setProperty("min-width", "max-content", "important");
          target.style.setProperty("max-width", "none", "important");
          target.style.setProperty("white-space", "nowrap", "important");
          target.style.setProperty("flex", "0 0 auto", "important");
          target.style.setProperty("overflow", "visible", "important");
        });
        host.appendChild(clone);
        return clone;
      });
      row.appendChild(host);
      let naturalWidths: number[];
      let minimumWidths: number[];
      try {
        naturalWidths = clones.map((clone) => Math.ceil(clone.getBoundingClientRect().width) + 2);
        minimumWidths = clones.map((clone) => {
          const computed = getComputedStyle(clone);
          const children = Array.from(clone.children);
          const summary = Array.from(clone.querySelectorAll("span")).find((span) => span.classList.contains("flex-1"))
            || clone.querySelector("span:last-of-type");
          const fixedChildren = children.filter((child) => child !== summary);
          const chrome = ["paddingLeft", "paddingRight", "borderLeftWidth", "borderRightWidth"] as const;
          const fixedWidth = chrome.reduce((sum, key) => sum + (Number.parseFloat(computed[key]) || 0), 0)
            + fixedChildren.reduce((sum, child) => sum + child.getBoundingClientRect().width, 0)
            + (Number.parseFloat(computed.columnGap) || 0) * Math.max(0, children.length - 1);
          // 姓名至少保留一个原字号字符宽度；其余文字自然换行，标签和箭头不能被挤出按钮。
          return Math.ceil(fixedWidth + (summary ? Number.parseFloat(getComputedStyle(summary).fontSize) || 13 : 0)) + 2;
        });
      } finally {
        host.remove();
      }
      const columns = distributeT0FilterWidths(naturalWidths, available, minimumWidths).map((width) => `${width.toFixed(3)}px`).join(" ");
      if (row.style.gridTemplateColumns !== columns) row.style.gridTemplateColumns = columns;
    };
    const schedule = () => {
      if (!disposed && !frame) frame = requestAnimationFrame(sync);
    };
    sync();
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    resize?.observe(row);
    const observer = new MutationObserver((records) => {
      // 忽略我们自己的离屏测量节点和列宽写入，防止测量/观察无限循环。
      if (records.some((record) => {
        if (record.target instanceof Element && record.target.closest("[data-t0-filter-measure]")) return false;
        if (record.type === "childList" && [...record.addedNodes, ...record.removedNodes].every((node) => node instanceof Element && node.hasAttribute("data-t0-filter-measure"))) return false;
        return true;
      })) schedule();
    });
    observer.observe(row, { subtree: true, childList: true, characterData: true });
    window.addEventListener("resize", schedule);
    document.fonts?.addEventListener("loadingdone", schedule);
    document.fonts?.ready.then(schedule);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      resize?.disconnect();
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      document.fonts?.removeEventListener("loadingdone", schedule);
    };
  }, []);
  return <div ref={rowRef} data-t0-filter-row data-t0-adaptive-filter-row data-t0-fit-ignore className={className} style={initialStyleRef.current}>{children}</div>;
}
