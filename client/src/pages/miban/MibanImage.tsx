import { forwardRef, useState, type ImgHTMLAttributes } from "react";
import {
  mibanImageAssets,
  type MibanImageVariant,
} from "@shared/miban-image-assets";

export type MibanImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  /** Only actual first-screen images should receive priority. */
  priority?: boolean;
  variant?: MibanImageVariant;
};

/** Shared by img and its decorative background: do not download two sizes. */
export function getMibanImageSource(
  src: string | undefined,
  variant: MibanImageVariant = "thumbnail",
): string | undefined {
  if (!src || variant === "original") return src;
  return mibanImageAssets[src]?.variants[variant]?.src ?? src;
}

/** Very long posters retain original width and load seamless public parts. */
export function getMibanPosterParts(src: string) {
  return mibanImageAssets[src]?.variants.poster?.parts;
}

export const MibanImage = forwardRef<HTMLImageElement, MibanImageProps>(
  function MibanImage(
    {
      src,
      variant = "thumbnail",
      priority = false,
      loading,
      decoding = "async",
      fetchPriority,
      onError,
      ...props
    },
    ref,
  ) {
    // Associate a failure with its URL, not its list position or previous SKU.
    const optimized = getMibanImageSource(src, variant);
    const [failedSource, setFailedSource] = useState<string | undefined>();
    const useOriginal = optimized === failedSource;
    return (
      <img
        {...props}
        ref={ref}
        src={useOriginal ? src : optimized}
        loading={priority ? "eager" : (loading ?? "lazy")}
        decoding={decoding}
        fetchPriority={priority ? "high" : (fetchPriority ?? "auto")}
        data-miban-image-variant={variant}
        onError={event => {
          if (!useOriginal && optimized && optimized !== src) {
            setFailedSource(optimized);
            return;
          }
          onError?.(event);
        }}
      />
    );
  },
);
