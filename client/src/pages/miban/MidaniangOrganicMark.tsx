import { midaniangSelectionAssets } from "@shared/midaniang-selection-assets";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const ORGANIC_MARK_ALT = "中国有机产品标识";

type MidaniangOrganicMarkProps = {
  variant?: "compact" | "large";
  className?: string;
  "data-testid"?: string;
};

/** Certification is confirmed by the merchant; never fabricate certificate details. */
export default function MidaniangOrganicMark({
  variant = "compact",
  className,
  "data-testid": testId = "midaniang-organic-mark",
}: MidaniangOrganicMarkProps) {
  const size = variant === "large" ? 48 : 32;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label="查看有机认证说明"
          title="有机认证"
          data-testid={testId}
          onClick={event => event.stopPropagation()}
          className={cn(
            "inline-flex min-h-11 min-w-11 items-center justify-center bg-transparent text-[#376443] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#376443]",
            className
          )}
        >
          <img
            src={midaniangSelectionAssets.organicMark}
            alt={ORGANIC_MARK_ALT}
            width={size}
            height={size}
            className={variant === "large" ? "h-12 w-12 object-contain" : "h-8 w-8 object-contain"}
            data-testid={`${testId}-image`}
          />
        </button>
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        className="max-w-[calc(100%-2rem)] gap-4 bg-[#f7f4ee] text-[#343a31] sm:max-w-sm"
        data-testid={`${testId}-dialog`}
      >
        <DialogTitle className="pr-2 text-[18px] leading-7">有机认证</DialogTitle>
        <DialogDescription className="text-[13px] leading-6 text-[#676b60]">
          商家确认产品已获有机认证，具体认证范围与有效期以认证证书和实物标签为准。
        </DialogDescription>
        <img
          src={midaniangSelectionAssets.organicMark}
          alt={ORGANIC_MARK_ALT}
          width={100}
          height={100}
          className="mx-auto h-[100px] w-[100px] object-contain"
          data-testid={`${testId}-dialog-image`}
        />
        <p className="text-[12px] leading-6 text-[#676b60]">
          商家提供的两款礼盒原素材（经典大米礼盒、给孩子的一份礼物）中包含该标识。透明展示图采用Control Union公开的中国有机产品标识，未重绘。
        </p>
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] leading-5 text-[#376443]">
          <a href={midaniangSelectionAssets.organicMarkSource} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">透明标识来源</a>
          <a href={midaniangSelectionAssets.organicMarkOriginal} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">查看商家原素材</a>
        </p>
        <DialogClose asChild>
          <button
            type="button"
            aria-label="关闭有机认证说明"
            className="min-h-11 rounded-lg bg-[#376443] px-4 text-[13px] text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#376443]"
            data-testid={`${testId}-close`}
          >关闭</button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}
