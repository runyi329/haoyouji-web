import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  data: undefined as any,
  error: undefined as Error | undefined,
  isFetching: false,
  isLoading: false,
  refetch: vi.fn(),
  freezePending: false,
  releasePending: false,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    ledger: {
      getLedger37WalletMarginContext: {
        useQuery: () => ({ data: state.data, error: state.error, isFetching: state.isFetching, isLoading: state.isLoading, refetch: state.refetch }),
      },
      freezeLedger37MarginFromWallet: { useMutation: () => ({ isPending: state.freezePending, mutateAsync: vi.fn() }) },
      releaseLedger37MarginToWallet: { useMutation: () => ({ isPending: state.releasePending, mutateAsync: vi.fn() }) },
    },
  },
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn(), warning: vi.fn() } }));
vi.mock("lucide-react", () => ({ ArrowRight: () => null, LockKeyhole: () => null, RefreshCw: () => null, ShieldCheck: () => null, Unlock: () => null, X: () => null }));

import Ledger37MarginWalletActions from "./Ledger37MarginWalletActions";

const source = readFileSync(new URL("./Ledger37MarginWalletActions.tsx", import.meta.url), "utf8");
const render = (props: Partial<React.ComponentProps<typeof Ledger37MarginWalletActions>> = {}) => renderToStaticMarkup(createElement(Ledger37MarginWalletActions, {
  targetUserId: 101, tagName: "押金标签", ...props,
}));

function disabledFor(input: {
  busy?: boolean; paused?: boolean; isFetching?: boolean; hasData?: boolean; hasError?: boolean;
  selectedHold?: boolean; available?: bigint; topUp?: bigint | null; invalid?: boolean; mode?: "freeze" | "release";
}) {
  const busy = input.busy ?? false;
  const paused = input.paused ?? false;
  const hasData = input.hasData ?? true;
  const hasError = input.hasError ?? false;
  const selectedHold = input.selectedHold ?? true;
  const available = input.available ?? 100n;
  const topUp = input.topUp === undefined ? 10n : input.topUp;
  const invalid = input.invalid ?? false;
  const mode = input.mode ?? "release";
  const context = { data: hasData ? {} : undefined, error: hasError ? new Error("读取失败") : undefined, isFetching: input.isFetching ?? false };
  const quickSection = source.slice(source.indexOf('{mode === "release" ? [25'), source.indexOf('{mode === "freeze" && <p'));
  const releaseExpression = quickSection.match(/disabled=\{([^}\n]+)\}/)?.[1];
  const availableExpression = quickSection.split('\n').find(line => line.includes('>可用余额</button>'))?.match(/disabled=\{([^}\n]+)\}/)?.[1];
  const topUpExpression = quickSection.split('\n').find(line => line.includes('>补足参考</button>'))?.match(/disabled=\{([^}\n]+)\}/)?.[1];
  const nextExpression = source.match(/<button type="submit" disabled=\{([^}\n]+)\}/)?.[1];
  const evaluate = (expression: string | undefined) => {
    if (!expression) throw new Error("缺少真实按钮禁用表达式");
    return Boolean(new Function("busy", "paused", "mode", "context", "selectedHold", "available", "topUp", "invalid", `return (${expression});`)(busy, paused, mode, context, selectedHold, available, topUp, invalid));
  };
  return {
    quickRelease: evaluate(releaseExpression),
    quickAvailable: evaluate(availableExpression),
    quickTopUp: evaluate(topUpExpression),
    next: evaluate(nextExpression),
  };
}

describe("37号押金解冻快捷键与下一步禁用回归", () => {
  it("静态渲染初始入口：后台刷新不改变解冻入口，忙碌和暂停仍保留禁用", () => {
    state.data = undefined; state.error = undefined; state.isFetching = false; state.freezePending = false; state.releasePending = false;
    const normal = render();
    expect(normal).toContain("解冻回钱包");
    expect(normal).not.toContain('disabled=""');
    state.isFetching = true;
    expect(render()).toContain("解冻回钱包");
    expect(render({ paused: true })).toContain("存入押金");
    state.releasePending = true;
    expect(render()).toContain('disabled=""');
  });

  it.each([
    [{ isFetching: false }, { quickRelease: false, quickAvailable: false, quickTopUp: false, next: false }],
    [{ isFetching: true }, { quickRelease: false, quickAvailable: false, quickTopUp: false, next: false }],
    [{ busy: true, isFetching: true }, { quickRelease: true, quickAvailable: true, quickTopUp: true, next: true }],
    [{ selectedHold: false, isFetching: true }, { quickRelease: true, quickAvailable: false, quickTopUp: false, next: false }],
    [{ hasData: false, isFetching: true }, { quickRelease: false, quickAvailable: false, quickTopUp: false, next: true }],
    [{ hasError: true, isFetching: true }, { quickRelease: false, quickAvailable: false, quickTopUp: false, next: true }],
    [{ available: 0n, topUp: null, isFetching: true }, { quickRelease: false, quickAvailable: true, quickTopUp: true, next: false }],
    [{ invalid: true, isFetching: true }, { quickRelease: false, quickAvailable: false, quickTopUp: false, next: true }],
    [{ paused: true, isFetching: true }, { quickRelease: false, quickAvailable: true, quickTopUp: true, next: false }],
    [{ mode: "freeze", paused: true, isFetching: true }, { quickRelease: false, quickAvailable: true, quickTopUp: true, next: true }],
  ] as const)("isFetching切换不影响快捷键/下一步，业务守卫仍生效：用例 %#", (input, expected) => {
    expect(disabledFor(input)).toEqual(expected);
    expect(disabledFor({ ...input, isFetching: !input.isFetching })).toEqual(expected);
  });

  it("源码保留真实预检、执行fresh refetch+validate顺序，且DEV guard不变", () => {
    const prepare = source.slice(source.indexOf("const prepare = async"), source.indexOf("const execute = async"));
    const execute = source.slice(source.indexOf("const execute = async"), source.indexOf("return ("));
    expect(prepare).toContain("const fresh = await context.refetch()");
    expect(prepare.indexOf("await context.refetch()")).toBeLessThan(prepare.indexOf("validate(draft, fresh.data)"));
    expect(execute).toContain("if (import.meta.env.DEV)");
    expect(execute).toContain("const fresh = await context.refetch()");
    expect(execute.indexOf("await context.refetch()")).toBeLessThan(execute.indexOf("validate(confirmation, fresh.data)"));
    expect(execute.indexOf("validate(confirmation, fresh.data)")).toBeLessThan(execute.indexOf("mutateAsync"));
    expect(execute).toContain("未执行冻结或解冻");
  });

  it("快捷键和下一步表达式不再依赖isFetching，但刷新按钮仍可按刷新态禁用", () => {
    const relevant = source.slice(source.indexOf("{mode === \"release\" ?"), source.indexOf("{mode === \"freeze\" && <p"));
    expect(relevant).toContain("disabled={busy || !selectedHold}");
    expect(relevant).toContain("disabled={busy || paused || available <= 0n}");
    expect(relevant).toContain("disabled={busy || paused || topUp === null || topUp <= 0n}");
    expect(source).toContain("disabled={busy || !!context.error || !context.data || !!invalid || (mode === \"freeze\" && paused)}");
    expect(source).toContain("disabled={busy || context.isFetching}");
    expect(relevant).not.toContain("context.isFetching");
  });
});
