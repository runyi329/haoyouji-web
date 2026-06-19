import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { PAGE_TAG_MAP } from "@/lib/pageTagMap";

/**
 * AutoPageTag —— 全自动管理员角标系统（仅 super_admin 可见）
 *
 * 设计目标：页面、内容框、弹窗、抽屉、Tab 面板等所有"可定位 UI"都自动出现一个独立编号，
 * 无需在任何页面里手动写标签；新增路由 / 新增弹层会自动跟上。
 *
 * 编号规则（重要）：字母+三位数字（A001..A999），A满进B001…Z满后升四位。
 *  - 一律为【独立平级编号】，绝不使用 A005-1 这类带横杠的子编号。
 *  - 页面主号（金色）：来自 src/lib/pageTagMap.ts（按路由顺序固定分配，A001 起）。贴在页面【右上角】。
 *  - 容器/浮层子号（绿色）：DOM 扫描当前屏幕上可见的内容框 / 弹窗 / 抽屉 / 激活的 Tab 面板，
 *    每个容器按其结构签名稳定分配一个【独立编号】（在 A 段高位区 A600 起，避开路由主号占用区），
 *    贴在该容器的【右下角】。同一个容器每次出现都是同一个编号。
 */

// ---- 主号样式（金色，右上） ----
const MAIN_TAG_STYLE: React.CSSProperties = {
  position: "fixed",
  zIndex: 2147483600,
  backgroundColor: "rgba(0,0,0,0.62)",
  color: "#FFD700",
  fontSize: "10px",
  fontFamily: "monospace",
  fontWeight: "bold",
  padding: "2px 6px",
  borderRadius: "4px",
  pointerEvents: "none",
  userSelect: "none",
  letterSpacing: "0.5px",
  border: "1px solid rgba(255,215,0,0.45)",
  whiteSpace: "nowrap",
};

// ---- 子号样式（绿色，容器右下角） ----
const SUB_TAG_STYLE: React.CSSProperties = {
  position: "fixed",
  zIndex: 2147483600,
  backgroundColor: "rgba(20,20,20,0.78)",
  color: "#7CF6C8",
  fontSize: "10px",
  fontFamily: "monospace",
  fontWeight: "bold",
  padding: "2px 6px",
  borderRadius: "4px",
  pointerEvents: "none",
  userSelect: "none",
  letterSpacing: "0.5px",
  border: "1px solid rgba(124,246,200,0.5)",
  whiteSpace: "nowrap",
};

// ---- 路由主号解析（支持 :param 动态段匹配） ----
function resolveMainCode(pathname: string): string {
  if (PAGE_TAG_MAP[pathname]) return PAGE_TAG_MAP[pathname];

  const segs = pathname.split("/").filter(Boolean);
  for (const [pattern, code] of Object.entries(PAGE_TAG_MAP)) {
    const pSegs = pattern.split("/").filter(Boolean);
    if (pSegs.length !== segs.length) continue;
    let ok = true;
    for (let i = 0; i < pSegs.length; i++) {
      if (pSegs[i].startsWith(":")) continue;
      if (pSegs[i] !== segs[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return code;
  }

  // 未登记新路由：按路径稳定哈希生成运行时编号（A 段三位），带 ~ 前缀提示
  const h = hashString(pathname);
  const code = numToCode(h % 999); // 落在 A 段
  // eslint-disable-next-line no-console
  console.warn(
    `[AutoPageTag] 路由「${pathname}」未在 pageTagMap 登记，已分配运行时编号 ~${code}。如需固定，请补登到 src/lib/pageTagMap.ts`
  );
  return code;
}

// ---- 工具：字符串稳定哈希 ----
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

// ---- 工具：数字 -> 字母+三位编号（0 -> A001, 25*999+998 -> Z999, 之后升四位） ----
function numToCode(n: number): string {
  const PER = 999;
  if (n < 26 * PER) {
    const letterIdx = Math.floor(n / PER);
    const num = (n % PER) + 1;
    return `${String.fromCharCode(65 + letterIdx)}${String(num).padStart(3, "0")}`;
  }
  // 26 个字母（三位）用完后升四位
  const m = n - 26 * PER;
  const letterIdx = Math.floor(m / 9999) % 26;
  const num = (m % 9999) + 1;
  return `${String.fromCharCode(65 + letterIdx)}${String(num).padStart(4, "0")}`;
}

/**
 * 为容器生成稳定的"结构签名"：基于元素从 body 到自身的标签 + 关键属性路径。
 * 同一个弹框/内容框在不同时间出现时，签名一致 -> 编号一致。
 */
function overlaySignature(el: HTMLElement): string {
  const parts: string[] = [];
  let node: HTMLElement | null = el;
  let depth = 0;
  while (node && node !== document.body && depth < 8) {
    let token = node.tagName.toLowerCase();
    const role = node.getAttribute("role");
    if (role) token += `[role=${role}]`;
    const dlg = node.getAttribute("data-radix-dialog-content") !== null;
    if (dlg) token += "[dialog]";
    // 取 class 中较稳定的结构类（排除可能随状态变化的类，只取前几个）
    const cls = (node.className && typeof node.className === "string" ? node.className : "")
      .split(/\s+/)
      .filter((c) => c && !/^(data-|hover:|focus:|active:)/.test(c))
      .slice(0, 3)
      .join(".");
    if (cls) token += `.${cls}`;
    // 在兄弟中的位置索引，增强唯一性
    if (node.parentElement) {
      const idx = Array.prototype.indexOf.call(node.parentElement.children, node);
      token += `:${idx}`;
    }
    parts.push(token);
    node = node.parentElement;
    depth++;
  }
  return parts.join(">");
}

// 子号编号区：从 A 段高位起，避免与路由主号（A001~约 A333）冲突
const SUB_CODE_BASE = 26 * 999 * 0 + 600 - 1; // 即 numToCode 入参起点 ~A600 区（599 -> A600）

// ---- 浮层/容器识别 ----
function collectOverlays(): HTMLElement[] {
  const result: HTMLElement[] = [];
  const seen = new Set<HTMLElement>();

  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>(
      [
        '[role="dialog"]',
        '[role="alertdialog"]',
        '[role="tabpanel"]',
        "[data-state='open'][data-radix-dialog-content]",
        ".fixed.inset-0",
      ].join(",")
    )
  );

  for (const el of candidates) {
    if (seen.has(el)) continue;
    if (el.hasAttribute("data-auto-pagetag")) continue;
    // 跳过转瞬即逝的 toast 提示（sonner），它们不需要定位编号
    if (el.closest("[data-sonner-toaster],[data-sonner-toast]")) continue;
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") continue;
    if (rect.width < 80 || rect.height < 60) continue;
    if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
    seen.add(el);
    result.push(el);
  }
  return result;
}

interface OverlayTag {
  code: string;
  top: number;
  left: number;
}

export function AutoPageTag() {
  const { user } = useAuth();
  const [location] = useLocation();
  const isAdmin = !!user && user.role === "super_admin";

  const [overlayTags, setOverlayTags] = useState<OverlayTag[]>([]);
  const rafRef = useRef<number | null>(null);

  const mainCode = isAdmin ? resolveMainCode(location) : "";

  useEffect(() => {
    if (!isAdmin) return;

    const recompute = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const overlays = collectOverlays();
        const used = new Set<string>();
        const tags: OverlayTag[] = overlays.map((el) => {
          const rect = el.getBoundingClientRect();
          // 用结构签名稳定派生一个独立编号（无横杠）
          const sig = overlaySignature(el);
          let n = SUB_CODE_BASE + (hashString(sig) % 2000); // A600 区一段
          let code = numToCode(n);
          // 同屏去重：万一两个容器签名碰撞，顺延到下一个空号
          while (used.has(code)) {
            n += 1;
            code = numToCode(n);
          }
          used.add(code);
          // 贴在该容器【右下角】（内侧），并限制在可视区域内
          return {
            code,
            top: Math.min(rect.bottom - 22, window.innerHeight - 24),
            // left 采用右边对齐：计算左边距 = 容器右边 - 标签预估宽（靠右内侧 6px）
            left: Math.min(rect.right - 6, window.innerWidth - 6),
          };
        });
        setOverlayTags(tags);
      });
    };

    recompute();
    const observer = new MutationObserver(recompute);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-state", "style", "class"],
    });
    window.addEventListener("scroll", recompute, true);
    window.addEventListener("resize", recompute);

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", recompute, true);
      window.removeEventListener("resize", recompute);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isAdmin, mainCode, location]);

  if (!isAdmin) return null;

  return (
    <>
      {/* 页面主号（金色）：贴页面右上角 */}
      <div data-auto-pagetag style={{ ...MAIN_TAG_STYLE, top: "64px", right: "8px" }}>
        {mainCode}
      </div>
      {/* 容器/浮层子号（绿色）：贴各容器右下角、独立无横杠编号 */}
      {overlayTags.map((t) => (
        <div
          key={t.code}
          data-auto-pagetag
          style={{
            ...SUB_TAG_STYLE,
            top: `${t.top}px`,
            left: `${t.left}px`,
            transform: "translateX(-100%)",
          }}
        >
          {t.code}
        </div>
      ))}
    </>
  );
}

export default AutoPageTag;
