import { BadgePercent } from "lucide-react";

type Order = { ingredients?: unknown; totalPrice?: unknown };
type BenefitDisplay = { originalCents: number; paidCents: number; savedCents: number; names: string[] };

/** Read the frozen order lines only. Never reprice an old order against today's rules. */
export function getMibanOrderBenefitDisplay(order: Order): BenefitDisplay | null {
  try {
    const lines: unknown = typeof order.ingredients === "string" ? JSON.parse(order.ingredients) : order.ingredients;
    if (!Array.isArray(lines) || !lines.length) return null;
    let originalCents = 0, paidCents = 0;
    const names = new Set<string>();
    for (const entry of lines) {
      if (!entry || typeof entry !== "object") return null;
      const line = entry as Record<string, unknown>;
      const raw = line.benefitSnapshot;
      if (!raw || typeof raw !== "object") return null;
      const snapshot = raw as Record<string, unknown>;
      if (snapshot.storefront !== "miban-limited") return null;
      const original = Number(snapshot.originalCny), paid = Number(snapshot.paidCny);
      if (!Number.isFinite(original) || !Number.isFinite(paid) || original <= 0 || paid <= 0 || paid > original) return null;
      const originalUnits = Math.round(original * 100), paidUnits = Math.round(paid * 100);
      if (!Number.isSafeInteger(originalUnits) || !Number.isSafeInteger(paidUnits)) return null;
      originalCents += originalUnits; paidCents += paidUnits;
      const name = typeof snapshot.ruleName === "string" ? snapshot.ruleName.trim() : "";
      if (name && paidUnits < originalUnits) names.add(name);
    }
    if (!Number.isSafeInteger(originalCents) || !Number.isSafeInteger(paidCents) || paidCents >= originalCents ||
      !Number.isFinite(Number(order.totalPrice)) || Math.round(Number(order.totalPrice) * 100) !== paidCents) return null;
    return { originalCents, paidCents, savedCents: originalCents - paidCents, names: Array.from(names) };
  } catch { return null; }
}

export function MibanOrderBenefitsDetails({ order }: { order: Order }) {
  const display = getMibanOrderBenefitDisplay(order);
  if (!display) return null;
  return <div className="mt-2 flex items-start gap-2 rounded-lg bg-orange-50 px-3 py-2 text-xs text-orange-800">
    <BadgePercent className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center justify-between gap-1 font-medium">
        <span>本单已优惠</span><span>¥{(display.savedCents / 100).toFixed(2)}</span>
      </div>
      <p className="mt-0.5 break-words text-[11px] text-orange-700/80">
        原价 ¥{(display.originalCents / 100).toFixed(2)} · {display.names.join("、") || "商品活动价择优"}
      </p>
    </div>
  </div>;
}
