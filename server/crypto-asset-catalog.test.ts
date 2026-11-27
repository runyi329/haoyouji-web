import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  CRYPTO_ASSET_CODES, CRYPTO_ASSET_NAMES, CRYPTO_CATALOG_SOURCE_DATE,
  CRYPTO_CATALOG_ADDITIONS_20261127, CRYPTO_EXISTING_MAIN_ADDITIONS,
  LEGACY_WALLET_CRYPTO_ASSET_CODES, isCryptoAssetCode, type CryptoAssetCode,
} from "../shared/crypto-asset-catalog";
import {
  AI_WALLET_ASSETS, AI_WALLET_ASSET_CATALOG, AI_WALLET_ASSET_COLORS,
  AI_WALLET_CRYPTO_MARKET_ASSETS, AI_WALLET_FUNDING_ASSETS,
  AI_WALLET_MARKET_ASSETS, AI_WALLET_SETTLEMENT_ASSETS,
  AI_WALLET_SECURITIES_AND_COMMODITIES_ASSETS,
} from "../shared/ai-wallet-assets";

// 固定离线资料快照：2026-11-27 result.json ordinaryNewAcrossMainDirectories。
// 不导入 scanner/router/React，不启动网络、行情循环或数据库。
const EXPECTED_ADDITIONS = `
1INCH 2Z A ACE ACH ACT AERO AEVO AGLD AI AIXBT ALGO ALLO ANIME APE API3 APT AR ARB ASTR ATOM AUCTION AVNT AXS
BABY BANANA BAND BARD BAT BCH BERA BICO BIGTIME BIO BLUR BNT BOME BONK BREV CATI CELO CELR CETUS CFG CFX CHIP CHZ CITY
COMP CVC CVX DASH DGB DOGS DOT DYDX EGLD ENJ ENS ETC ETHFI FIL FLOKI FLOW FOGO G GALA GAS GLM GMT GMX GRAM GRT HBAR HMSTR HUMA
ICP ID ILV IMX IOST IOTA JOE JTO JUP KAIA KAITO KAT KITE KMNO KNC KSM LAYER LINEA LPT LQTY LSK LTC LUNA
MAGIC MANA MASK ME MEGA MEME MET METIS MINA MMT MORPHO MOVE NEIRO NEO NIGHT NMR NOT ONE ONT OP ORDI
PARTI PEOPLE PHA PIXEL PNUT PROVE PUMP PYTH QTUM RAY RE RENDER RESOLV ROBO RPL RSR RVN S SAHARA SAND SCR SENT SHIB SKL
SKY SLP SNX SOPH SPK SSV STX SUSHI T THETA TNSR TRB TRX TURBO UMA VIRTUAL W WAXP WCT WIF WIN WOO XRP XTZ YB YFI YGG ZAMA ZEC ZEN ZIL ZK ZRX
`.trim().split(/\s+/);
const EXPECTED_LEGACY = `BTC ETH SOL BNB HYPE TRUMP PENGU XPL WLFI AVAX DOGE XLM TIA EIGEN FET
AAVE SUI ONDO ASTER LDO ENA ARKM UNI SEI PLUME ADA ZRO WLD LINK POL CRV PEPE B2 BTY`.split(/\s+/);
const EXPECTED_SECURITIES = `MSTR COIN AAOI HOOD SLV TSLA NVDA AAPL MSFT GOOGL META AMZN SPY QQQ
NFLX ORCL TSM AMD CL NG CRCL DRAM MU SKHYNIX BZ`.split(/\s+/);
const EXCLUDED = ["RLUSD", "USD1", "USDC", "USDS", "PAXG", "XAUT"];

// 原钱包全部34币的名称/颜色快照，避免共享化时抹掉既有品牌显示。
const LEGACY_DISPLAY: Record<string, readonly [string, string]> = {
  BTC: ["比特币", "#F7931A"], ETH: ["以太坊", "#627EEA"], SOL: ["Solana", "#9945FF"], BNB: ["BNB", "#F3BA2F"],
  HYPE: ["Hyperliquid", "#5C6BC0"], TRUMP: ["Official Trump", "#D71920"], PENGU: ["Pudgy Penguins", "#66C5E0"],
  XPL: ["Plasma", "#6B5CFF"], WLFI: ["World Liberty Financial", "#1F2937"], AVAX: ["Avalanche", "#E84142"],
  DOGE: ["狗狗币", "#C2A633"], XLM: ["恒星币", "#14B8A6"], TIA: ["Celestia", "#7C3AED"], EIGEN: ["EigenLayer", "#8B5CF6"],
  FET: ["Fetch.ai", "#1A73E8"], AAVE: ["Aave", "#B6509E"], SUI: ["Sui", "#4DA2FF"], ONDO: ["Ondo", "#1A1A2E"],
  ASTER: ["Aster", "#00D4AA"], LDO: ["Lido DAO", "#F68B1E"], ENA: ["Ethena", "#00C4B4"], ARKM: ["Arkham", "#FF6B00"],
  UNI: ["Uniswap", "#FF007A"], SEI: ["Sei", "#9C1FFF"], PLUME: ["Plume", "#7B5EA7"], ADA: ["艾达币", "#0033AD"],
  ZRO: ["LayerZero", "#111111"], WLD: ["Worldcoin", "#111111"], LINK: ["Chainlink", "#2A5ADA"], POL: ["Polygon", "#8247E5"],
  CRV: ["Curve DAO", "#406C9A"], PEPE: ["Pepe", "#479F53"], B2: ["B² Network", "#F59E0B"], BTY: ["比特元", "#F3BA2F"],
};

function parse(relative: string) {
  return ts.createSourceFile(relative, readFileSync(new URL(relative, import.meta.url), "utf8"),
    ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}
function initializer(ast: ts.SourceFile, name: string): ts.Expression {
  let found: ts.Expression | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText() === name) found = node.initializer;
    ts.forEachChild(node, visit);
  };
  visit(ast);
  if (!found) throw new Error(`Missing actual production initializer ${name}`);
  return found;
}
function evaluate<T>(expression: ts.Expression, bindings: Record<string, unknown>): T {
  const { outputText } = ts.transpileModule(`(${expression.getText()});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  });
  return runInNewContext(outputText, bindings, { timeout: 1_000 }) as T;
}
const card = parse("../client/src/components/FunderOrderCard.tsx");
const finance = parse("../client/src/pages/FinanceManagement.tsx");
const cardCoins = evaluate<readonly string[]>(initializer(card, "COIN_OPTIONS"), {
  CRYPTO_ASSET_CODES, AI_WALLET_SECURITIES_AND_COMMODITIES_ASSETS,
});
const cardColors = evaluate<Record<string, string>>(initializer(card, "COIN_COLORS"), { AI_WALLET_ASSET_COLORS });
const financeColors = evaluate<Record<string, string>>(initializer(finance, "COIN_COLORS"), { FUNDER_COIN_COLORS: cardColors });

describe("216币静态共享目录及来源边界（完全离线）", () => {
  it("保留原钱包34币+已有目录补5币+恰好177新增币，稳定顺序且无重复", () => {
    expect(LEGACY_WALLET_CRYPTO_ASSET_CODES).toEqual(EXPECTED_LEGACY);
    expect(LEGACY_WALLET_CRYPTO_ASSET_CODES).toHaveLength(34);
    expect(CRYPTO_EXISTING_MAIN_ADDITIONS).toEqual(["INJ", "NEAR", "TAO", "PENDLE", "STRK"]);
    expect(CRYPTO_CATALOG_ADDITIONS_20261127).toEqual(EXPECTED_ADDITIONS);
    expect(CRYPTO_CATALOG_ADDITIONS_20261127).toHaveLength(177);
    expect(CRYPTO_ASSET_CODES).toHaveLength(216);
    expect(CRYPTO_ASSET_CODES).toEqual([...EXPECTED_LEGACY, ...CRYPTO_EXISTING_MAIN_ADDITIONS, ...EXPECTED_ADDITIONS]);
    expect(new Set(CRYPTO_ASSET_CODES).size).toBe(216);
    expect(CRYPTO_ASSET_CODES.slice(0, 2)).toEqual(["BTC", "ETH"]);
    expect(CRYPTO_CATALOG_SOURCE_DATE).toBe("2026-11-27");
  });

  it("钱包复用相同tuple，资金账户与25种证券商品原样保留", () => {
    expect(AI_WALLET_CRYPTO_MARKET_ASSETS).toBe(CRYPTO_ASSET_CODES);
    expect(AI_WALLET_FUNDING_ASSETS).toEqual(["CNY", "USDT"]);
    expect(AI_WALLET_SECURITIES_AND_COMMODITIES_ASSETS).toEqual(EXPECTED_SECURITIES);
    expect(AI_WALLET_MARKET_ASSETS).toHaveLength(241);
    expect(AI_WALLET_SETTLEMENT_ASSETS).toEqual(AI_WALLET_MARKET_ASSETS);
    expect(AI_WALLET_ASSETS).toHaveLength(243);
    expect(new Set(AI_WALLET_ASSETS).size).toBe(243);
    expect(AI_WALLET_ASSET_CATALOG.map(asset => asset.code)).toEqual(AI_WALLET_ASSETS);
  });

  it("不混入新增4稳定币、2黄金代币、资金账户或证券", () => {
    for (const code of [...EXCLUDED, "USDT", "CNY", ...EXPECTED_SECURITIES]) {
      expect(CRYPTO_ASSET_CODES).not.toContain(code);
      expect(isCryptoAssetCode(code)).toBe(false);
    }
    for (const code of EXCLUDED) expect(AI_WALLET_ASSETS).not.toContain(code);
  });

  it("所有216名称与243颜色完整，原34名称颜色逐项保持", () => {
    expect(Object.keys(CRYPTO_ASSET_NAMES).sort()).toEqual([...CRYPTO_ASSET_CODES].sort());
    expect(Object.keys(AI_WALLET_ASSET_COLORS).sort()).toEqual([...AI_WALLET_ASSETS].sort());
    for (const asset of AI_WALLET_ASSET_CATALOG) {
      expect(asset.name.trim(), asset.code).not.toBe("");
      expect(AI_WALLET_ASSET_COLORS[asset.code], asset.code).toMatch(/^#[0-9a-f]{6}$/i);
      expect(asset.currentSupport).toBe(true);
      expect(asset.walletLedgerEnabled).toBe(asset.category === "market");
    }
    for (const code of LEGACY_WALLET_CRYPTO_ASSET_CODES) {
      const [name, color] = LEGACY_DISPLAY[code];
      expect(CRYPTO_ASSET_NAMES[code]).toBe(name);
      expect(AI_WALLET_ASSET_COLORS[code]).toBe(color);
    }
    // 默认颜色是代码哈希的固定结果，不依赖随机或目录位置。
    expect(AI_WALLET_ASSET_COLORS.FIL).toBe("#C2410C");
    expect(AI_WALLET_ASSET_COLORS.XRP).toBe("#475569");
  });

  it("BTY独立保留，FIL为真实Filecoin，Gate缺名仅代码、不猜测", () => {
    expect(CRYPTO_ASSET_NAMES.BTY).toBe("比特元");
    expect(CRYPTO_ASSET_NAMES.BTY).not.toBe(CRYPTO_ASSET_NAMES.BTC);
    expect(AI_WALLET_ASSET_COLORS.BTY).not.toBe(AI_WALLET_ASSET_COLORS.BTC);
    expect(CRYPTO_ASSET_NAMES.FIL).toBe("Filecoin(IPFS)");
    expect(CRYPTO_ASSET_NAMES.ACE).toBe("ACE");
    expect(CRYPTO_ASSET_NAMES.ZEN).toBe("ZEN");
    expect(CRYPTO_ASSET_NAMES.GRAM).toBe("GRAM (prev. Toncoin)");
    expect(CRYPTO_ASSET_NAMES.CHIP).toBe("USD.AI");
    expect(CRYPTO_ASSET_NAMES.AVNT).toBe("Veranta");
    expect(CRYPTO_ASSET_NAMES.INJ).toBe("Injective");
    expect(CRYPTO_ASSET_NAMES.NEAR).toBe("Near");
    expect(CRYPTO_ASSET_NAMES.TAO).toBe("Bittensor");
    expect(CRYPTO_ASSET_NAMES.PENDLE).toBe("Pendle");
    expect(CRYPTO_ASSET_NAMES.STRK).toBe("Starknet");
    expect(AI_WALLET_ASSET_CATALOG.find(asset => asset.code === "FIL")?.detail).toContain("行情按需求获取");
  });

  it("z.enum完整接受216 crypto和243 wallet代码，类型守卫只接受规范大写、不生成请求", () => {
    const cryptoEnum = z.enum(CRYPTO_ASSET_CODES);
    const walletEnum = z.enum(AI_WALLET_ASSETS);
    for (const code of CRYPTO_ASSET_CODES) {
      expect(cryptoEnum.parse(code)).toBe(code);
      expect(isCryptoAssetCode(code)).toBe(true);
    }
    for (const code of AI_WALLET_ASSETS) expect(walletEnum.parse(code)).toBe(code);
    for (const raw of [" btc ", "btc", "FILUSDT", "UNKNOWN", "", null, undefined, 1, {}, [], new String("BTC")]) {
      expect(isCryptoAssetCode(raw)).toBe(false);
      expect(cryptoEnum.safeParse(raw).success).toBe(false);
    }
    const raw: unknown = "FIL";
    if (!isCryptoAssetCode(raw)) throw new Error("FIL must be a crypto asset");
    const narrowed: CryptoAssetCode = raw;
    expect(narrowed).toBe("FIL");
    const source = readFileSync(new URL("../shared/crypto-asset-catalog.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/\bfetch\s*\(|\bsetInterval\s*\(|\bsetTimeout\s*\(/);
  });
});

describe("52新旧订单公共目录接入（读取真实源码，仅执行纯表达式）", () => {
  it("COIN_OPTIONS/CoinType导出保持严格tuple；全216可选，BTC/ETH优先，资金与证券保留", () => {
    expect(cardCoins).toEqual([...CRYPTO_ASSET_CODES, "USDT", "CNY", ...EXPECTED_SECURITIES]);
    expect(cardCoins).toHaveLength(243);
    expect(new Set(cardCoins).size).toBe(243);
    expect(cardCoins.slice(0, 2)).toEqual(["BTC", "ETH"]);
    expect(initializer(card, "COIN_OPTIONS").getText()).toContain("as const");
    expect(card.getText()).toContain("export type CoinType = typeof COIN_OPTIONS[number]");
    for (const code of EXCLUDED) expect(cardCoins).not.toContain(code);
    const orderEnum = z.enum(cardCoins as [string, ...string[]]);
    for (const code of cardCoins) expect(orderEnum.parse(code)).toBe(code);
    expect(orderEnum.safeParse("UNKNOWN").success).toBe(false);
  });

  it("FinanceManagement直接导入公共币单和类型，没有维护第二套名单", () => {
    const publicImport = finance.statements.find(node => ts.isImportDeclaration(node)
      && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === "@/components/FunderOrderCard");
    if (!publicImport || !ts.isImportDeclaration(publicImport)) throw new Error("Missing shared card import");
    expect(publicImport.getText()).toContain("COIN_OPTIONS");
    expect(publicImport.getText()).toContain("type CoinType");
    expect(() => initializer(finance, "COIN_OPTIONS")).toThrow();
    expect(finance.getText()).toContain("COIN_OPTIONS.map");
  });

  it("两入口243色均有效，原页面特殊颜色保持，新币继承共享确定性色", () => {
    for (const code of cardCoins) {
      expect(cardColors[code], `card ${code}`).toMatch(/^#[0-9a-f]{6}$/i);
      expect(financeColors[code], `finance ${code}`).toMatch(/^#[0-9a-f]{6}$/i);
    }
    for (const code of CRYPTO_CATALOG_ADDITIONS_20261127) {
      expect(cardColors[code]).toBe(AI_WALLET_ASSET_COLORS[code]);
      expect(financeColors[code]).toBe(AI_WALLET_ASSET_COLORS[code]);
    }
    expect(cardColors.ASTER).toBe("#00D4AA");
    expect(financeColors.ASTER).toBe("#E84142");
    expect(financeColors.LDO).toBe("#00C896");
    expect(financeColors.ENA).toBe("#1A1A1A");
    expect(financeColors.ARKM).toBe("#FF6B35");
  });
});
