/**
 * 规则 003 · 返回行为统一实现（全局自动来源栈版）
 * ============================================================
 * 背景：纯 history.back() 依赖浏览器历史栈，而项目里大量"写死 navigate(push)"
 *      的跳转会污染历史栈，导致返回时乱跳、甚至两页互指形成死循环。
 *
 * 方案：自管理「来源栈」（source stack），精确记录页面访问"前进"轨迹。
 *  - 全局记录：在 App 顶层挂 useNavSourceTracker()，每次路径变化时把【上一个页面】压栈。
 *  - 返回读取：useSmartBack(fallback) 弹出栈顶真实来源页跳回；栈空用 fallback。
 *
 * 关键修正（防返回反向污染）：
 *  「返回」这个 navigate 动作本身也会触发路径变化，若被 tracker 当成一次新的前进导航
 *   重新压栈，就会把刚离开的页面压回去，导致下一次返回回到错误页（A028→返回却回 A005）。
 *  解决：返回前设置一个一次性标记 isBacking，tracker 检测到该标记时【跳过本次压栈】，
 *   只清除标记。这样返回动作不污染来源栈，逐级返回始终正确。
 *
 *  - 防自指 / 防循环：弹栈时跳过与当前页相同的来源。
 *  - 存于 sessionStorage（刷新不丢、关闭标签清空），限长保护。
 *
 * 用法：
 *   // App 顶层（只挂一次）：useNavSourceTracker();
 *   // 返回方：const goBack = useSmartBack("/admin/projects");
 *
 * 注意：UI 外观（图标/文案/样式）不在本规则约束内，沿用各页面/各项目自身风格。
 */
import { useCallback, useEffect, useRef } from "react";
import { useLocation } from "wouter";

const STACK_KEY = "__nav_source_stack__";
const BACKING_KEY = "__nav_is_backing__";
const MAX = 30;

function read(): string[] {
  try {
    const raw = sessionStorage.getItem(STACK_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function write(stack: string[]) {
  try {
    sessionStorage.setItem(STACK_KEY, JSON.stringify(stack.slice(-MAX)));
  } catch {
    /* ignore */
  }
}

function fullPath(): string {
  return window.location.pathname + window.location.search;
}

/**
 * 全局来源记录器：挂在 App 顶层，监听 wouter 路径变化。
 * 每当路径变化，把"变化前的旧路径"压入来源栈，形成真实的前进轨迹。
 * 若本次变化是由「返回」触发（isBacking 标记存在），则跳过压栈，避免反向污染。
 */
export function useNavSourceTracker() {
  const [location] = useLocation();
  const prevRef = useRef<string | null>(null);

  useEffect(() => {
    const here = fullPath();
    const prev = prevRef.current;

    // 本次路径变化是否由「返回」触发
    let backing = false;
    try {
      backing = sessionStorage.getItem(BACKING_KEY) === "1";
    } catch {
      /* ignore */
    }

    if (backing) {
      // 返回导航：不压栈，仅消费掉标记
      try {
        sessionStorage.removeItem(BACKING_KEY);
      } catch {
        /* ignore */
      }
    } else if (prev !== null && prev !== here) {
      // 正常前进导航：把旧路径压入来源栈
      const stack = read();
      if (stack[stack.length - 1] !== prev) {
        stack.push(prev);
        write(stack);
      }
    }

    prevRef.current = here;
  }, [location]);
}

/**
 * 规则003 返回：优先回到来源栈记录的真实来源页；栈空时用 fallback。
 * 执行前置 isBacking 标记，确保本次返回导航不会被 tracker 反向压栈。
 */
export function useSmartBack(fallback: string = "/") {
  const [, navigate] = useLocation();

  return useCallback(() => {
    const here = fullPath();
    const stack = read();

    let target: string | undefined;
    while (stack.length > 0) {
      const candidate = stack.pop();
      if (candidate && candidate !== here) {
        target = candidate;
        break;
      }
    }
    write(stack);

    // 标记：接下来这次路径变化是"返回"，tracker 跳过压栈
    try {
      sessionStorage.setItem(BACKING_KEY, "1");
    } catch {
      /* ignore */
    }

    navigate(target || fallback);
  }, [navigate, fallback]);
}
