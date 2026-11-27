export type AiFearGreedFactorKey = 'breadth' | 'momentum' | 'volume' | 'downside';
export type AiFearGreedBand = 'extreme_fear' | 'fear' | 'neutral' | 'greed' | 'extreme_greed';
export type AiFearGreedFactor = {
  key: AiFearGreedFactorKey;
  label: string;
  /** Fixed normalized ratio in [0, 1]; all four weights sum to 1. */
  weight: number;
  score: number | null;
};
export type AiFearGreedPoint = {
  date: string;
  score: number | null;
};
export type AiFearGreedResult = {
  status: 'provisional' | 'insufficient' | 'unavailable';
  methodVersion: 'pulse-a-share-fg-preview-v1';
  latestDate: string | null;
  score: number | null;
  band: AiFearGreedBand | null;
  previousScore: number | null;
  history: AiFearGreedPoint[];
  factors: AiFearGreedFactor[];
  source: string;
  notes: string[];
  lookback: number;
  sampleDays: number;
};
export function aiFearGreedBand(score: number): AiFearGreedBand {
  if (score < 20) return 'extreme_fear';
  if (score < 40) return 'fear';
  if (score < 60) return 'neutral';
  if (score < 80) return 'greed';
  return 'extreme_greed';
}
export const AI_FEAR_GREED_BAND_LABELS: Record<AiFearGreedBand, string> = {
  extreme_fear: '极度恐惧', fear: '恐惧', neutral: '中性', greed: '贪婪', extreme_greed: '极度贪婪',
};
