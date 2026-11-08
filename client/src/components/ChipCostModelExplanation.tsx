export default function ChipCostModelExplanation() {
  return (
    <div
      data-stock-chip-model-explanation="true"
      className="mx-auto w-full min-w-0 max-w-[320px] space-y-4 break-words text-[11px] leading-[1.75] text-slate-600"
    >
      <section className="space-y-2">
        <h3 className="font-semibold text-[#087987]">一、把当日成交分配到价位</h3>
        <p>
          将当日新成交放在最低价 L 到最高价 H 之间，以均价 A 为峰值做三角分配：
          越靠近 A，分配密度越高；向两端逐渐降低。A 不必位于区间正中。
          三角形的总面积归一为 1，再按当日新筹码数量分配到各价位。
        </p>
        <figure
          data-stock-chip-model-figure="triangle"
          className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50 p-2"
        >
          <svg
            viewBox="0 0 280 164"
            className="block h-auto w-full text-[11px] leading-[1.75]"
            role="img"
            aria-label="三角分配教学示意：横轴为价位，纵轴为分配密度，最低价 L 与最高价 H 为两端，均价 A 是峰值，总面积归一为一。"
          >
            <text x="12" y="16" fill="#475569">分配密度</text>
            <path d="M 36 28 V 120 H 266" fill="none" stroke="#64748b" />
            <path d="M 33 33 L 36 28 L 39 33 M 261 117 L 266 120 L 261 123" fill="none" stroke="#64748b" />
            <path d="M 52 120 L 136 44 L 250 120 Z" fill="#087987" fillOpacity="0.13" stroke="#087987" strokeWidth="1.8" />
            <path d="M 136 44 V 120" stroke="#087987" strokeDasharray="3 3" />
            <circle cx="136" cy="44" r="3" fill="#087987" />
            <text x="148" y="40" fill="#087987">峰值</text>
            <text x="150" y="100" fill="#475569">总面积 = 1</text>
            <g fill="#334155" textAnchor="middle">
              <text x="52" y="138">最低价 L</text>
              <text x="136" y="138">均价 A</text>
              <text x="250" y="138">最高价 H</text>
            </g>
            <text x="264" y="157" textAnchor="end" fill="#64748b">价位 →</text>
          </svg>
          <figcaption className="mt-1 text-[11px] leading-[1.75] text-slate-500">
            教学示意：形状和位置仅用于解释分配机制，不是某只股票的真实分布或实时数据。
          </figcaption>
        </figure>
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold text-[#087987]">二、旧筹码减弱，新筹码加入</h3>
        <p>
          随着历史换手，旧筹码在模型中的权重逐步衰减；当日新筹码按新的价位分配加入。
          将留下的旧权重与新增权重合并，就形成下一期的成本分布估计。
        </p>
        <figure
          data-stock-chip-model-figure="migration"
          className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50 p-2"
        >
          <svg
            viewBox="0 0 280 162"
            className="block h-auto w-full text-[11px] leading-[1.75]"
            role="img"
            aria-label="筹码变化教学示意：相同长度代表相同份数。更新前有一百份旧筹码；假设替换百分之二十，更新后剩八十份旧筹码，加入二十份新筹码。"
          >
            <text x="16" y="18" fill="#475569">同一比例尺：整条均为 100 份</text>
            <text x="16" y="39" fill="#64748b">更新前</text>
            <rect x="16" y="46" width="240" height="24" rx="3" fill="#64748b" />
            <text x="136" y="62" textAnchor="middle" fill="#ffffff">旧筹码 100 份</text>
            <path d="M 136 75 V 90 M 132 86 L 136 90 L 140 86" fill="none" stroke="#94a3b8" />
            <text x="148" y="86" fill="#64748b">假设替换 20%</text>
            <text x="16" y="106" fill="#64748b">更新后</text>
            <rect x="16" y="113" width="192" height="24" fill="#64748b" />
            <rect x="208" y="113" width="48" height="24" fill="#087987" />
            <text x="112" y="129" textAnchor="middle" fill="#ffffff">旧筹码 80 份</text>
            <text x="232" y="129" textAnchor="middle" fill="#ffffff">20 份</text>
            <text x="232" y="154" textAnchor="middle" fill="#087987">新筹码</text>
          </svg>
          <figcaption className="mt-1 text-[11px] leading-[1.75] text-slate-500">
            教学示意：条长只比较假设份数，不表示真实价位分布，也不是实时数据。
          </figcaption>
        </figure>
        <p>
          真实模型的完整衰减参数未公开，因此这里说明的是通用机制，不能据此还原实际衰减过程。
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold text-[#087987]">三、平均成本怎样理解</h3>
        <p>概念上，按各价位的筹码权重求加权平均：</p>
        <p className="rounded-md bg-[#087987]/[0.06] px-2 py-1.5 text-[#087987]">
          K = Σ(价位×权重)/Σ权重
        </p>
        <p>
          例如：假设原有 100 份旧筹码，均价 10 元；替换 20% 后，留下 80 份旧筹码，
          再加入均价 12 元的新筹码 20 份。
          示意平均成本为 (80×10 + 20×12)/100 = 10.40 元。
        </p>
        <p>
          20% 只是教学假设，不是已确认的真实模型衰减系数；图中数值与例子不接入筛选，也不用于生成真实数据。
          页面成本读取实际已发布记录，不用本示意重新计算。
        </p>
      </section>

      <p>
        筹码成本是模型层面的估计，用于理解成本分布的变化，不是个人真实账户的持仓成本，
        也不能精确识别每个账户持有的筹码。
      </p>
    </div>
  );
}
