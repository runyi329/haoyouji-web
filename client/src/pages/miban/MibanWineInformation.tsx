import type { LimitedProduct } from "../../../../shared/miban-limited-products";

type WineTheme = { primary: string; navy: string; muted: string; border: string; surfaceMuted: string };

/** 仅有事实档案或品鉴指南的商品才显示，不介入下单、钱包或价格计算。 */
export function MibanWineInformation({ detail, theme }: { detail: LimitedProduct["detail"]; theme: WineTheme }) {
  if (!detail.factSheet && !detail.servingGuide) return null;
  return (
    <div className="border-y px-5 py-6" style={{ background: theme.surfaceMuted, borderColor: theme.border }}>
      {detail.factSheet && (
        <section data-testid="wine-fact-sheet" aria-label={detail.factSheet.title}>
          <p className="text-[10px] font-bold tracking-[0.16em]" style={{ color: theme.muted }}>WINE PROFILE</p>
          <h3 className="mt-1 text-[19px] font-extrabold" style={{ color: theme.navy }}>{detail.factSheet.title}</h3>
          <dl className="mt-4 border-y" style={{ borderColor: theme.border }}>
            {detail.factSheet.items.map((item, index) => (
              <div key={item.label} className="grid grid-cols-[95px_minmax(0,1fr)] gap-3 py-2.5 text-[12px] leading-5" style={{ borderBottom: index < detail.factSheet!.items.length - 1 ? `1px solid ${theme.border}` : undefined }}>
                <dt style={{ color: theme.muted }}>{item.label}</dt>
                <dd className="min-w-0 break-words font-medium" style={{ color: theme.navy }}>{item.value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-[10px] leading-[18px]" style={{ color: theme.muted }}>年份、酒精度与等级沿用原商品资料，实际批次以酒标及订单确认为准。</p>
        </section>
      )}
      {detail.servingGuide && (
        <section className={detail.factSheet ? "mt-7" : ""} data-testid="wine-serving-guide" aria-label={detail.servingGuide.title}>
          <p className="text-[10px] font-bold tracking-[0.16em]" style={{ color: theme.muted }}>SERVE &amp; ENJOY</p>
          <h3 className="mt-1 text-[19px] font-extrabold" style={{ color: theme.navy }}>{detail.servingGuide.title}</h3>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {detail.servingGuide.items.map(item => (
              <article key={item.title} className="min-w-0 border bg-white p-3" style={{ borderColor: theme.border }}>
                <div className="mb-2 h-0.5 w-5" style={{ background: theme.primary }} />
                <h4 className="text-[13px] font-bold" style={{ color: theme.navy }}>{item.title}</h4>
                <p className="mt-1.5 text-[11px] leading-[19px]" style={{ color: theme.muted }}>{item.description}</p>
              </article>
            ))}
          </div>
          {detail.servingGuide.note && <p className="mt-3 text-[10px] leading-[18px]" style={{ color: theme.muted }}>{detail.servingGuide.note}</p>}
        </section>
      )}
    </div>
  );
}
