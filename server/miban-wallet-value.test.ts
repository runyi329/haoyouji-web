import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import {
  calculateMibanWalletValue,
  type MibanWalletValueInput,
} from "../shared/miban-wallet-value";

const mocks = vi.hoisted(() => {
  const query = () => ({
    data: undefined as unknown,
    error: null as Error | null,
    isLoading: true,
    refetch: vi.fn().mockResolvedValue({}),
  });
  return {
    auth: {
      isAuthenticated: true,
      loading: false,
      error: null as Error | null,
    },
    usdt: query(),
    cny: query(),
    assets: query(),
    prices: query(),
    useUsdt: vi.fn(),
    useCny: vi.fn(),
    useAssets: vi.fn(),
    usePrices: vi.fn(),
  };
});
vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    recharge: {
      getUsdtBalanceSummary: { useQuery: mocks.useUsdt },
      getCnyBalanceSummary: { useQuery: mocks.useCny },
      getMultiAssetBalances: { useQuery: mocks.useAssets },
    },
    getCryptoPrices: { useQuery: mocks.usePrices },
  },
}));
import { useMibanWalletValue } from "../client/src/pages/miban/useMibanWalletValue";

function fixture(): MibanWalletValueInput {
  return {
    usdt: { total: 120, frozen: 20, available: 100 },
    cny: { total: 140, frozen: 70, available: 70 },
    assets: [
      {
        assetCode: "ETH",
        assetName: "以太坊",
        availableBalance: "2",
        frozenBalance: "0.5",
        totalBalance: "2.5",
      },
      {
        assetCode: "SOL",
        assetName: "Solana",
        availableBalance: "3",
        frozenBalance: "1",
        totalBalance: "4",
      },
    ],
    prices: { ETH: 2000, SOL: 100 },
    usdtCnyRate: 7,
  };
}

function emptyFixture(): MibanWalletValueInput {
  return {
    usdt: { total: 0, frozen: 0, available: 0 },
    cny: { total: 0, frozen: 0, available: 0 },
    assets: [],
    prices: {},
    usdtCnyRate: 7,
  };
}

describe("calculateMibanWalletValue (pure, no database)", () => {
  it("values available USDT + CNY + ETH + SOL, with independent frozen and total formulas", () => {
    const value = calculateMibanWalletValue(fixture());
    expect(value.availableCny).toBeCloseTo(
      100 * 7 + 70 + 2 * 2000 * 7 + 3 * 100 * 7
    );
    expect(value.availableUsdt).toBeCloseTo(100 + 70 / 7 + 2 * 2000 + 3 * 100);
    expect(value.frozenCny).toBeCloseTo(20 * 7 + 70 + 0.5 * 2000 * 7 + 100 * 7);
    expect(value.frozenUsdt).toBeCloseTo(20 + 70 / 7 + 0.5 * 2000 + 100);
    expect(value.totalCny).toBeCloseTo(
      120 * 7 + 140 + 2.5 * 2000 * 7 + 4 * 100 * 7
    );
    expect(value.missingPrices).toEqual([]);
    expect(value.rows.map(row => row.assetCode)).toEqual([
      "USDT",
      "CNY",
      "ETH",
      "SOL",
    ]);
    expect(value.rows[0].priceUsdt).toBe(1);
    expect(value.rows[1].priceUsdt).toBe(1 / 7);
    expect(value.rows[2]).toMatchObject({
      available: 2,
      frozen: 0.5,
      total: 2.5,
      assetName: "以太坊",
    });
  });

  it("uses available directly and does not subtract frozen a second time", () => {
    const input = emptyFixture();
    input.usdt = { total: 100, frozen: 80, available: 20 };
    input.cny = { total: 100, frozen: 80, available: 20 };
    input.assets = [
      { assetCode: "ETH", availableBalance: 2, frozenBalance: 3 },
    ];
    input.prices = { ETH: 10 };
    const value = calculateMibanWalletValue(input);
    expect(value.availableCny).toBe(20 * 7 + 20 + 2 * 10 * 7);
    expect(value.rows[2].total).toBe(2 + 3);
  });

  it("skips duplicate USDT/CNY asset rows and uses their dedicated summaries", () => {
    const input = fixture();
    input.assets.push(
      { assetCode: " usdt ", availableBalance: 99999, frozenBalance: 99999 },
      { assetCode: "cny", availableBalance: 99999, frozenBalance: 99999 }
    );
    input.prices.USDT = 99;
    input.prices.CNY = 99;
    expect(calculateMibanWalletValue(input)).toEqual(
      calculateMibanWalletValue(fixture())
    );
  });

  it("throws on duplicate other asset codes, including case/whitespace variants", () => {
    const input = fixture();
    input.assets.push({
      assetCode: " eth ",
      availableBalance: 1,
      frozenBalance: 0,
    });
    expect(() => calculateMibanWalletValue(input)).toThrow(/重复.*ETH/);
  });

  it("returns null available/total aggregates instead of omitting an unpriced asset", () => {
    const input = fixture();
    delete input.prices.ETH;
    const value = calculateMibanWalletValue(input);
    expect(value.availableCny).toBeNull();
    expect(value.availableUsdt).toBeNull();
    expect(value.frozenCny).toBeNull();
    expect(value.frozenUsdt).toBeNull();
    expect(value.totalCny).toBeNull();
    expect(value.missingPrices).toEqual(["ETH"]);
    expect(value.rows[2]).toMatchObject({
      priceUsdt: null,
      availableCny: null,
      frozenCny: null,
    });
  });

  it("a missing price for frozen-only assets does not block available totals", () => {
    const input = emptyFixture();
    input.usdt = { total: 10, frozen: 0, available: 10 };
    input.assets = [
      { assetCode: "ETH", availableBalance: "0", frozenBalance: "2" },
    ];
    const value = calculateMibanWalletValue(input);
    expect(value.availableCny).toBe(10 * 7);
    expect(value.availableUsdt).toBe(10);
    expect(value.frozenCny).toBeNull();
    expect(value.frozenUsdt).toBeNull();
    expect(value.totalCny).toBeNull();
    expect(value.rows[2].availableCny).toBe(0);
    expect(value.missingPrices).toEqual(["ETH"]);
  });

  it("a missing price for available-only assets does not block known zero frozen totals", () => {
    const input = emptyFixture();
    input.assets = [
      { assetCode: "ETH", availableBalance: 1, frozenBalance: 0 },
    ];
    const value = calculateMibanWalletValue(input);
    expect(value.availableCny).toBeNull();
    expect(value.frozenCny).toBe(0);
    expect(value.frozenUsdt).toBe(0);
  });

  it.each([0, -5])(
    "treats non-positive quote %s as missing, not a zero valuation",
    price => {
      const input = fixture();
      input.prices.ETH = price;
      expect(calculateMibanWalletValue(input).availableCny).toBeNull();
      expect(calculateMibanWalletValue(input).missingPrices).toEqual(["ETH"]);
    }
  );

  it("keeps zero USDT/CNY but excludes completely zero other assets without requiring quotes", () => {
    const input = emptyFixture();
    input.assets = [
      {
        assetCode: "ETH",
        availableBalance: "0",
        frozenBalance: 0,
        totalBalance: "0",
      },
    ];
    const value = calculateMibanWalletValue(input);
    expect(value).toMatchObject({
      availableCny: 0,
      availableUsdt: 0,
      frozenCny: 0,
      frozenUsdt: 0,
      totalCny: 0,
      missingPrices: [],
    });
    expect(value.rows.map(row => row.assetCode)).toEqual(["USDT", "CNY"]);
  });

  it("preserves negative balances, including unknown negative available quantities", () => {
    const input = emptyFixture();
    input.usdt = { total: -1, frozen: 0, available: -1 };
    input.cny = { total: -7, frozen: 0, available: -7 };
    input.assets = [
      { assetCode: "ETH", availableBalance: -2, frozenBalance: 0 },
    ];
    input.prices = { ETH: 5 };
    expect(calculateMibanWalletValue(input).availableCny).toBe(
      -1 * 7 - 7 - 2 * 5 * 7
    );
    delete input.prices.ETH;
    expect(calculateMibanWalletValue(input).availableCny).toBeNull();
  });

  it("includes securities/commodity asset codes without a cryptocurrency whitelist", () => {
    const input = emptyFixture();
    input.assets = [
      {
        assetCode: "AAPL",
        assetName: "Apple",
        availableBalance: 3,
        frozenBalance: 1,
      },
    ];
    input.prices = { AAPL: 200 };
    const value = calculateMibanWalletValue(input);
    expect(value.availableCny).toBe(3 * 200 * 7);
    expect(value.rows[2].assetCode).toBe("AAPL");
  });

  it("uses only current prices, never a balance snapshot, and reflects price/rate changes", () => {
    const input = fixture();
    Object.assign(input.assets[0], { priceUsdt: 9999, priceCny: 99999 });
    const initial = calculateMibanWalletValue(input);
    input.prices.ETH = 3000;
    input.usdtCnyRate = 8;
    const updated = calculateMibanWalletValue(input);
    expect(updated.availableCny).toBeCloseTo(
      (100 + 2 * 3000 + 3 * 100) * 8 + 70
    );
    expect(updated.availableCny).not.toBe(initial.availableCny);
    delete input.prices.ETH;
    expect(calculateMibanWalletValue(input).rows[2].priceUsdt).toBeNull();
  });

  it("does not round fractional balances during valuation", () => {
    const input = emptyFixture();
    input.assets = [
      {
        assetCode: "ETH",
        availableBalance: "0.123456789",
        frozenBalance: "0.000000001",
      },
    ];
    input.prices = { ETH: 1234.56789 };
    input.usdtCnyRate = 7.12345;
    const value = calculateMibanWalletValue(input);
    expect(value.availableCny).toBeCloseTo(
      0.123456789 * 1234.56789 * 7.12345,
      10
    );
  });

  it.each([NaN, Infinity, -Infinity])(
    "rejects non-finite balances and prices (%s) with identifiable errors",
    invalid => {
      const balanceInput = fixture();
      balanceInput.usdt.available = invalid;
      expect(() => calculateMibanWalletValue(balanceInput)).toThrow(
        /usdt.available.*有限/
      );
      const assetInput = fixture();
      assetInput.assets[0].frozenBalance = invalid;
      expect(() => calculateMibanWalletValue(assetInput)).toThrow(
        /ETH.frozenBalance.*有限/
      );
      const priceInput = fixture();
      priceInput.prices.ETH = invalid;
      expect(() => calculateMibanWalletValue(priceInput)).toThrow(
        /prices.ETH.*有限/
      );
    }
  );

  it.each(["", "bad", "Infinity"])(
    "rejects invalid asset quantity strings (%j)",
    invalid => {
      const input = fixture();
      input.assets[0].totalBalance = invalid;
      expect(() => calculateMibanWalletValue(input)).toThrow(
        /ETH.totalBalance.*有限/
      );
    }
  );

  it.each([0, -1, NaN, Infinity])(
    "rejects invalid conversion rates (%s)",
    invalid => {
      const input = fixture();
      input.usdtCnyRate = invalid;
      expect(() => calculateMibanWalletValue(input)).toThrow(/usdtCnyRate/);
    }
  );

  it("rejects overflow rather than returning infinite valuations", () => {
    const input = fixture();
    input.usdt.available = Number.MAX_VALUE;
    expect(() => calculateMibanWalletValue(input)).toThrow(
      /USDT.CNY估值.*有限/
    );
  });
});

function renderHook() {
  let result: ReturnType<typeof useMibanWalletValue> | undefined;
  function Harness() {
    result = useMibanWalletValue();
    return null;
  }
  renderToString(createElement(Harness));
  if (!result) throw new Error("Hook did not render");
  return result;
}

function provideData() {
  const input = fixture();
  mocks.usdt.data = input.usdt;
  mocks.cny.data = input.cny;
  mocks.assets.data = input.assets;
  mocks.prices.data = { prices: input.prices, usdtCnyRate: input.usdtCnyRate };
  for (const query of [mocks.usdt, mocks.cny, mocks.assets, mocks.prices])
    query.isLoading = false;
}

describe("useMibanWalletValue API contract (mocked queries, no database)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.isAuthenticated = true;
    mocks.auth.loading = false;
    mocks.auth.error = null;
    for (const query of [mocks.usdt, mocks.cny, mocks.assets, mocks.prices]) {
      query.data = undefined;
      query.error = null;
      query.isLoading = true;
    }
    mocks.useUsdt.mockReturnValue(mocks.usdt);
    mocks.useCny.mockReturnValue(mocks.cny);
    mocks.useAssets.mockReturnValue(mocks.assets);
    mocks.usePrices.mockReturnValue(mocks.prices);
  });

  it("keeps initial/incomplete data unknown rather than creating zero balances", () => {
    expect(renderHook()).toMatchObject({
      value: null,
      isLoading: true,
      error: null,
      isAuthenticated: true,
    });
    provideData();
    mocks.assets.data = undefined;
    mocks.assets.isLoading = true;
    expect(renderHook().value).toBeNull();
  });

  it("uses no query input, polls balances every 30s and the common price snapshot every 10s", () => {
    provideData();
    expect(renderHook().value).toEqual(calculateMibanWalletValue(fixture()));
    for (const useQuery of [mocks.useUsdt, mocks.useCny, mocks.useAssets]) {
      expect(useQuery).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({ enabled: true, refetchInterval: 30_000 })
      );
    }
    expect(mocks.usePrices).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ enabled: true, refetchInterval: 10_000 })
    );
  });

  it("disables all queries and refresh when unauthenticated", async () => {
    mocks.auth.isAuthenticated = false;
    const result = renderHook();
    expect(result).toMatchObject({
      value: null,
      isLoading: false,
      isAuthenticated: false,
    });
    for (const useQuery of [
      mocks.useUsdt,
      mocks.useCny,
      mocks.useAssets,
      mocks.usePrices,
    ]) {
      expect(useQuery).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({ enabled: false })
      );
    }
    await result.refresh();
    for (const query of [mocks.usdt, mocks.cny, mocks.assets, mocks.prices])
      expect(query.refetch).not.toHaveBeenCalled();
  });

  it("returns a string error and no stale value on query failure", () => {
    provideData();
    mocks.usdt.error = new Error("余额读取失败");
    expect(renderHook()).toMatchObject({ value: null, error: "余额读取失败" });
  });

  it("returns a string calculation error rather than displaying a fake zero on invalid input", () => {
    provideData();
    mocks.prices.data = { prices: fixture().prices, usdtCnyRate: 0 };
    const result = renderHook();
    expect(result.value).toBeNull();
    expect(result.error).toMatch(/usdtCnyRate/);
  });

  it("keeps completed-but-unpriced valuation rows with null aggregates, not a query error", () => {
    provideData();
    mocks.prices.data = { prices: { SOL: 100 }, usdtCnyRate: 7 };
    const result = renderHook();
    expect(result).toMatchObject({ isLoading: false, error: null });
    expect(result.value?.availableCny).toBeNull();
    expect(result.value?.missingPrices).toEqual(["ETH"]);
  });

  it("refreshes all four queries together", async () => {
    provideData();
    await renderHook().refresh();
    for (const query of [mocks.usdt, mocks.cny, mocks.assets, mocks.prices])
      expect(query.refetch).toHaveBeenCalledTimes(1);
  });
});
