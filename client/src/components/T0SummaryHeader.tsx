import { useLayoutEffect, useRef } from "react";

type Props = {
  profitText: string;
  positionText: string;
  profitClass: string;
  positionClass: string;
  isMemberView: boolean;
  onProfitClick: () => void;
  onPositionClick: () => void;
};

/** Keep the original large inline header; both metrics share one small adjustment. */
export function T0SummaryHeader(props: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    let frame = 0;
    let closed = false;
    let lastWidth = -1;
    const context = document.createElement("canvas").getContext("2d");
    const update = () => {
      frame = 0;
      if (closed || !root.clientWidth || !context) return;
      root.style.setProperty("--t0-summary-scale", "1");
      root.style.setProperty("--t0-summary-pad", "10px");
      root.style.flexWrap = "nowrap";
      const groups = Array.from(root.querySelectorAll<HTMLButtonElement>("[data-summary-group]"));
      const widths = groups.map(group => {
        group.style.flexWrap = "nowrap";
        let width = 0;
        group.querySelectorAll<HTMLElement>("[data-summary-text]").forEach(element => {
          const style = getComputedStyle(element);
          context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
          width += context.measureText(element.textContent || "").width;
        });
        return width;
      });
      const style = getComputedStyle(root);
      const available = root.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const textWidth = widths.reduce((sum, width) => sum + width, 0);
      // Label/value gaps are 6px, number/unit gaps 2px; keep the central line.
      const gapsAndLine = groups.length * 8 + 1;
      let padding = 10;
      let scale = Math.min(1, (available - gapsAndLine - padding * 4) / Math.max(1, textWidth));
      // Do not make either amount tiny. Recover space from equal side padding first.
      if (scale < 0.92) {
        padding = Math.max(4, Math.min(10, (available - gapsAndLine - textWidth * 0.92) / 4));
        scale = Math.min(1, (available - gapsAndLine - padding * 4) / Math.max(1, textWidth));
      }
      const wrap = scale < 0.92;
      root.style.setProperty("--t0-summary-scale", String(Math.max(0.92, scale)));
      root.style.setProperty("--t0-summary-pad", `${padding}px`);
      groups.forEach((group, index) => {
        group.style.flexBasis = wrap ? "100%" : `${widths[index] * Math.max(0.92, scale) + padding * 2 + 8}px`;
        group.style.flexWrap = wrap ? "wrap" : "nowrap";
      });
      if (wrap) root.style.flexWrap = "wrap";
      root.querySelectorAll<HTMLElement>("[data-summary-value]").forEach(element => {
        element.style.whiteSpace = wrap ? "normal" : "nowrap";
        element.style.overflowWrap = wrap ? "anywhere" : "normal";
      });
    };
    const schedule = () => {
      if (!closed && !frame) frame = requestAnimationFrame(update);
    };
    const resize = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width;
      if (width !== lastWidth) { lastWidth = width ?? -1; schedule(); }
    });
    resize?.observe(root);
    const mutation = new MutationObserver(schedule);
    mutation.observe(root, { subtree: true, characterData: true, childList: true });
    window.addEventListener("resize", schedule, { passive: true });
    document.fonts?.addEventListener("loadingdone", schedule);
    document.fonts?.ready.then(schedule);
    update();
    return () => {
      closed = true;
      cancelAnimationFrame(frame);
      resize?.disconnect();
      mutation.disconnect();
      window.removeEventListener("resize", schedule);
      document.fonts?.removeEventListener("loadingdone", schedule);
    };
  }, []);

  const textShadow = "-0.9px -0.9px 0 rgba(255,255,255,0.88), 1.15px 1.15px 1px rgba(15,23,42,0.22)";
  const groupClass = "flex min-w-0 flex-[1_1_auto] items-center justify-center gap-1.5 py-3 text-center transition-opacity active:opacity-60";
  const groupStyle = { paddingLeft: "var(--t0-summary-pad, 10px)", paddingRight: "var(--t0-summary-pad, 10px)" };
  const labelStyle = { fontSize: "calc(11px * var(--t0-summary-scale, 1))", textShadow: "-0.6px -0.6px 0 rgba(255,255,255,0.94), 0.8px 0.8px 0 rgba(71,85,105,0.28)" };
  const valueStyle = { fontSize: "calc(clamp(18px, 5vw, 22px) * var(--t0-summary-scale, 1))", textShadow };
  const unitStyle = { fontSize: "calc(12px * var(--t0-summary-scale, 1))" };

  return <div ref={ref} data-t0-fit-ignore data-t0-summary className="relative z-[1] flex min-w-0 items-stretch p-2" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.14), rgba(203,213,225,0.14))", borderTop: "1px solid rgba(100,116,139,0.20)", borderBottom: "1px solid rgba(255,255,255,0.62)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.42), inset 0 -1px 0 rgba(71,85,105,0.10)" }}>
    <button data-summary-group type="button" onClick={props.onProfitClick} aria-haspopup={props.isMemberView ? undefined : "dialog"} aria-label={props.isMemberView ? "打开总收益页面" : "查看总收益归因报告"} className={groupClass} style={{ ...groupStyle, borderRight: "1px solid rgba(100,116,139,0.32)", boxShadow: "inset -1px 0 0 rgba(255,255,255,0.50)" }}>
      <span data-summary-text className="shrink-0 whitespace-nowrap font-semibold text-slate-500" style={labelStyle}>总收益</span>
      <span data-summary-value className={`inline-flex min-w-0 items-baseline gap-0.5 whitespace-nowrap font-bold leading-none tabular-nums ${props.profitClass}`} style={valueStyle}>
        <span data-summary-text>{props.profitText}</span><span data-summary-text className="font-semibold opacity-65" style={unitStyle}>U</span>
      </span>
    </button>
    <button data-summary-group type="button" onClick={props.onPositionClick} aria-haspopup="dialog" aria-label="查看总仓位对冲明细" className={groupClass} style={groupStyle}>
      <span data-summary-text className="shrink-0 whitespace-nowrap font-semibold text-slate-500" style={labelStyle}>总仓位</span>
      <span data-summary-value className={`inline-flex min-w-0 items-baseline gap-0.5 whitespace-nowrap font-bold leading-none tabular-nums ${props.positionClass}`} style={valueStyle}>
        <span data-summary-text>{props.positionText}</span><span data-summary-text className="font-semibold opacity-65" style={unitStyle}>ETH</span>
      </span>
    </button>
  </div>;
}
