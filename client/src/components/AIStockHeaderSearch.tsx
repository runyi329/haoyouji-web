import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import AnimatedStockAILogo from "@/components/AnimatedStockAILogo";
import { aiStockDisplayName, aiStockNeedsDelistedBadge } from "@/lib/ai-stock-display-name";

function normalizeKeyword(value: string) {
  return value.trim().replace(/^(\d{6})[-.](SH|SZ|BJ)$/i, (_, code: string, exchange: string) => `${code}.${exchange.toUpperCase()}`);
}

export type AIStockHeaderSearchProps = {
  stocksPath: string;
  value?: string;
  onChange?: (value: string) => void;
};

export default function AIStockHeaderSearch({
  stocksPath,
  value,
  onChange,
}: AIStockHeaderSearchProps) {
  const [, setLocation] = useLocation();
  const [localValue, setLocalValue] = useState("");
  const inputValue = value ?? localValue;
  const [focused, setFocused] = useState(false);
  const [composing, setComposing] = useState(false);
  const composingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsId = useId();
  const [trimmedDebounced, setTrimmedDebounced] = useState("");

  useEffect(() => {
    if (composing) return;
    const timer = window.setTimeout(() => {
      setTrimmedDebounced(normalizeKeyword(inputValue));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [inputValue, composing]);

  // 外部受控值变化或输入尚在防抖/组合期间，不能查询或显示旧关键词。
  const keyword = !composing && normalizeKeyword(inputValue) === trimmedDebounced
    ? trimmedDebounced
    : "";
  const query = trpc.aiStockLifecycle.useQuery(
    {
      page: 1,
      pageSize: 10,
      market: "all",
      keyword: trimmedDebounced,
      sortBy: "upRate",
      sortDir: "desc",
      minTotalDays: 0,
    },
    { enabled: focused && Boolean(keyword), staleTime: 30_000 },
  );

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) {
        setFocused(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  const updateValue = (nextValue: string) => {
    // 同一事件内先隐藏旧建议；列表页仍通过 onChange 即时过滤。
    setTrimmedDebounced("");
    if (value === undefined) setLocalValue(nextValue);
    onChange?.(nextValue);
    setFocused(document.activeElement === inputRef.current);
  };

  const showSuggestions = focused && Boolean(keyword)
    && (query.isError || Boolean(query.data && !query.isPlaceholderData));
  const suggestions = query.data?.list.slice(0, 10) ?? [];
  const showFullList = () => {
    if (composingRef.current) return;
    setFocused(false);
    inputRef.current?.blur();
    const target = new URL(stocksPath, window.location.origin);
    const currentParams = new URLSearchParams(window.location.search);
    for (const key of ["previewKey", "v"]) {
      const value = currentParams.get(key);
      if (value && !target.searchParams.has(key)) target.searchParams.set(key, value);
    }
    target.searchParams.set("q", inputValue.trim());
    setLocation(`${target.pathname}?${target.searchParams.toString()}`);
  };

  return (
    <div
      ref={containerRef}
      className="relative min-w-0 flex-1"
      onFocus={() => setFocused(true)}
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
    >
      <form
        role="search"
        aria-label="搜索股票"
        onSubmit={event => {
          event.preventDefault();
          showFullList();
        }}
        className="flex h-[52px] min-w-0 items-center rounded-md border border-[#71C8D5]/30 bg-white/[0.07] px-2 text-white focus-within:border-[#7AE1EC]/70 focus-within:bg-white/10"
      >
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label="股票代码、名称或拼音首字母"
          title="支持股票代码、名称片段和拼音首字母，例如 XYS、YS、S"
          aria-autocomplete="list"
          aria-expanded={showSuggestions}
          aria-controls={showSuggestions ? suggestionsId : undefined}
          value={inputValue}
          placeholder="代码 / 名称"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="search"
          onChange={event => updateValue(event.currentTarget.value)}
          onCompositionStart={() => {
            composingRef.current = true;
            setComposing(true);
            setTrimmedDebounced("");
          }}
          onCompositionEnd={event => {
            composingRef.current = false;
            setComposing(false);
            // 兼容在 compositionend 才提供最终中文输入的浏览器。
            if (event.currentTarget.value !== inputValue) updateValue(event.currentTarget.value);
          }}
          onKeyDown={event => {
            if (event.key === "Enter" && (
              composingRef.current || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229
            )) {
              event.preventDefault();
              return;
            }
            if (event.key === "Escape" && !composingRef.current) {
              setFocused(false);
              event.currentTarget.blur();
            }
          }}
          className="h-full w-full min-w-0 flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-white/75"
        />
        {inputValue && (
          <button
            type="button"
            aria-label="清除股票搜索"
            onPointerDown={event => event.preventDefault()}
            onClick={() => {
              updateValue("");
              inputRef.current?.focus();
            }}
            className="-mr-1 ml-0.5 flex h-8 w-7 shrink-0 items-center justify-center rounded-md text-white/85 hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          >
            <X aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        )}
        <span
          aria-hidden="true"
          data-ai-stock-search-animation="true"
          className="pointer-events-none ml-1 block h-9 w-8 shrink-0 drop-shadow-[0_0_5px_rgba(68,211,229,0.22)]"
        >
          <AnimatedStockAILogo />
        </span>
      </form>

      {showSuggestions && (
        <div
          id={suggestionsId}
          className="absolute right-0 top-full z-[80] mt-2 overflow-hidden rounded-xl border border-[#DCE7F0] bg-white text-[#142A3F] shadow-xl"
          style={{ width: "min(300px, calc(100vw - 24px))" }}
          // 保持输入焦点，避免 blur 先卸载结果，导致鼠标/触屏 click 丢失。
          onPointerDown={event => event.preventDefault()}
        >
          {query.isError ? (
            <div className="flex items-center justify-between gap-2 px-3 py-3 text-xs">
              <span role="alert">搜索暂不可用，请重试</span>
              <button
                type="button"
                onClick={() => { void query.refetch(); }}
                disabled={query.isFetching}
                className="shrink-0 rounded-md px-2 py-1 font-medium text-[#087987] hover:bg-[#E4F4F6] disabled:opacity-50"
              >
                重试
              </button>
            </div>
          ) : (
            <>
              <div role="listbox" aria-label="股票搜索建议" className="max-h-80 overflow-y-auto overscroll-contain py-1">
                {suggestions.length ? suggestions.map(stock => (
                  <button
                    key={stock.tsCode}
                    type="button"
                    role="option"
                    aria-selected={false}
                    onClick={() => {
                      setFocused(false);
                      inputRef.current?.blur();
                      setLocation(`/stock/${stock.tsCode.replace(/\./g, "-")}`);
                    }}
                    className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left hover:bg-[#EAF2F7] focus-visible:bg-[#EAF2F7] focus-visible:outline-none"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-[13px] font-medium">{aiStockDisplayName(stock.name, stock.listStatus)}</span>
                        {aiStockNeedsDelistedBadge(aiStockDisplayName(stock.name, stock.listStatus), stock.listStatus) && (
                          <span className="shrink-0 rounded bg-gray-100 px-1 py-0.5 text-[10px] leading-none text-gray-500">退</span>
                        )}
                      </span>
                      <span className="block text-[11px] leading-4 text-gray-500">{stock.tsCode}</span>
                    </span>
                  </button>
                )) : (
                  <p className="px-3 py-3 text-xs text-gray-500">未找到相关股票</p>
                )}
              </div>
              <button
                type="button"
                onClick={showFullList}
                className="min-h-10 w-full border-t border-[#DCE7F0] px-3 py-2 text-left text-xs font-medium text-[#087987] hover:bg-[#EAF2F7] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#087987]"
              >
                {query.data && query.data.total > 10 ? `查看全部 ${query.data.total} 项结果` : "查看完整列表"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
