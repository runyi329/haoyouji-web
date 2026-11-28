import data from "./miban-official-immersive-visuals.json";

export type OfficialImmersiveVisual = {
  from: string;
  to: string;
  /** Optional chapter-level text colours, matched to the original scene. */
  ink?: string;
  muted?: string;
  accent?: string;
  range?: number[];
  source?: string;
  textLocation?: string;
  scene?: { url: string; width: number; height: number };
};
const visuals = data as Record<string, { parts: Record<string, OfficialImmersiveVisual> }>;

/** Background edge colours and intact scenes sampled only from verified official originals.
 * Missing metadata uses the caller's poster background, never a shared Nu Skin colour.
 * Existing two-argument callers retain the undefined result when no metadata is present.
 */
export function getOfficialImmersiveVisual(productKey: string | undefined, partId: string, background?: string): OfficialImmersiveVisual | undefined {
  const visual = productKey ? visuals[productKey]?.parts[partId] : undefined;
  if (!visual) return background ? { from: background, to: background } : undefined;
  return {
    ...visual,
    from: visual.from ?? background ?? visual.to,
    to: visual.to ?? background ?? visual.from,
  };
}
