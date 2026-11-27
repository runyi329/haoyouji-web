import { useMemo, useState, type CSSProperties } from "react";
import { Check, ChevronDown } from "lucide-react";
import { CRYPTO_ASSET_CODES, CRYPTO_ASSET_NAMES } from "@shared/crypto-asset-catalog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

const ASSET_NAMES: Readonly<Record<string, string>> = CRYPTO_ASSET_NAMES;
export function getCryptoAssetSearchText(code: string): string {
  return `${code} ${ASSET_NAMES[code] || ""} ${code === "CNY" ? "人民币 RMB Chinese Yuan" : code === "USDT" ? "泰达币 Tether" : ""}`.trim();
}

export type CryptoAssetSelectProps = {
  value: string;
  onValueChange: (value: string) => void;
  /** Optional legacy securities/server-verified directory; labels do not imply a quote or balance. */
  options?: readonly string[];
  includeCny?: boolean;
  includeUsdt?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  style?: CSSProperties;
  "aria-label"?: string;
};

/** Local catalog filtering only: opening/searching never requests all coin prices. */
export function CryptoAssetSelect({ value, onValueChange, options = CRYPTO_ASSET_CODES, includeCny = true,
  includeUsdt = true, disabled = false, placeholder = "选择币种", className, style, "aria-label": ariaLabel = "选择币种" }: CryptoAssetSelectProps) {
  const [open, setOpen] = useState(false);
  const codes = useMemo(() => Array.from(new Set([
    ...(includeCny ? ["CNY"] : []), ...(includeUsdt ? ["USDT"] : []), ...options,
  ])).filter(code => (includeCny || code !== "CNY") && (includeUsdt || code !== "USDT")), [options, includeCny, includeUsdt]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" role="combobox" aria-expanded={open} aria-label={ariaLabel} disabled={disabled}
          className={cn("flex w-full min-w-0 items-center justify-between gap-1 rounded-[3px] border border-gray-200 bg-white px-3 py-2.5 text-left text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:opacity-50", className)} style={style}>
          <span className="min-w-0 truncate">{value === "CNY" ? "人民币 CNY" : value || placeholder}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="z-[100] w-[min(320px,calc(100vw-24px))] rounded-[3px] p-0">
        <Command className="rounded-[3px]">
          <CommandInput placeholder="搜索币种代码或名称" aria-label="搜索币种代码或名称" autoCapitalize="none" />
          <CommandList className="max-h-[min(280px,45vh)] overscroll-contain">
            <CommandEmpty>未找到匹配币种</CommandEmpty>
            <CommandGroup>
              {codes.map(code => <CommandItem key={code} value={code} keywords={[getCryptoAssetSearchText(code)]}
                onSelect={() => { onValueChange(code); setOpen(false); }} className="min-h-10 rounded-[2px]">
                <Check className={cn("h-3.5 w-3.5 shrink-0", code === value ? "opacity-100" : "opacity-0")} />
                <span className="shrink-0 font-medium">{code}</span>
                <span className="min-w-0 truncate text-xs text-gray-400">{code === "CNY" ? "人民币" : ASSET_NAMES[code] || ""}</span>
              </CommandItem>)}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
