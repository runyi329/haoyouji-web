import { describe, expect, it } from "vitest";
import { normalizeChainTransactionId } from "./db-recharge";
import { isSupportedAptosUsdt } from "./scanners/aptos-scanner";

describe("充值链上凭证规范化", () => {
  it("接受并规范化EVM与TRON的64位交易哈希", () => {
    const raw = `0x${"A".repeat(64)}`;
    expect(normalizeChainTransactionId(raw, "BEP20")).toBe("a".repeat(64));
    expect(normalizeChainTransactionId("B".repeat(64), "TRC20")).toBe("b".repeat(64));
  });

  it("接受Aptos交易版本号与大小写敏感的Solana签名", () => {
    expect(normalizeChainTransactionId("9876543210", "APTOS")).toBe("9876543210");
    const solanaSignature = "5".repeat(88);
    expect(normalizeChainTransactionId(solanaSignature, "SOLANA")).toBe(solanaSignature);
  });

  it("拒绝不符合链上凭证格式的任意文本", () => {
    expect(normalizeChainTransactionId("not-a-chain-proof", "ERC20")).toBeNull();
    expect(normalizeChainTransactionId("0x1234", "BEP20")).toBeNull();
  });
});

describe("Aptos USDt白名单", () => {
  it("接受历史LayerZero USDT和新版原生USDt metadata及其完整资产类型", () => {
    expect(isSupportedAptosUsdt("0xf22bede237a07e121b56d91a491eb7bcdfd1f5907926a9e58338f964a01b17fa::asset::USDT")).toBe(true);
    expect(isSupportedAptosUsdt("0x357b0b74bc833e95a115ad22604854d6b0fca151cecd94111770e5d6ffc9dc2b")).toBe(true);
    expect(isSupportedAptosUsdt("0x357b0b74bc833e95a115ad22604854d6b0fca151cecd94111770e5d6ffc9dc2b::asset::USDt")).toBe(true);
  });

  it("拒绝同名或相似的非白名单资产", () => {
    expect(isSupportedAptosUsdt("0x1::coin::USDT")).toBe(false);
    expect(isSupportedAptosUsdt("USDT")).toBe(false);
  });
});
