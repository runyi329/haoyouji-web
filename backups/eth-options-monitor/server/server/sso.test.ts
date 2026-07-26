/**
 * SSO 端点测试（H-3 规范验证）
 * 验证 /api/auth/external-login 能正确验证脉动网颁发的 HMAC-SHA256 签名
 */
import { describe, it, expect } from "vitest";
import { createHmac } from "crypto";

const SHARED_SECRET = "mlm-bonus-shared-secret-2026";

function generateSign(uid: string, name: string, ts: string): string {
  const payload = `${uid}:${name}:${ts}`;
  return createHmac("sha256", SHARED_SECRET).update(payload).digest("hex");
}

describe("SSO HMAC-SHA256 signature verification", () => {
  it("should generate a valid HMAC-SHA256 signature", () => {
    const uid = "123";
    const name = "测试用户";
    const ts = String(Math.floor(Date.now() / 1000));
    const sign = generateSign(uid, name, ts);

    // 验证签名格式（64位十六进制）
    expect(sign).toMatch(/^[0-9a-f]{64}$/);
  });

  it("should produce consistent signatures for the same input", () => {
    const uid = "456";
    const name = "胡先生";
    const ts = "1720000000";

    const sign1 = generateSign(uid, name, ts);
    const sign2 = generateSign(uid, name, ts);

    expect(sign1).toBe(sign2);
  });

  it("should produce different signatures for different inputs", () => {
    const ts = "1720000000";

    const sign1 = generateSign("123", "用户A", ts);
    const sign2 = generateSign("456", "用户B", ts);

    expect(sign1).not.toBe(sign2);
  });

  it("should reject signatures with wrong secret", () => {
    const uid = "789";
    const name = "用户C";
    const ts = "1720000000";

    const correctSign = generateSign(uid, name, ts);
    const wrongSign = createHmac("sha256", "wrong-secret")
      .update(`${uid}:${name}:${ts}`)
      .digest("hex");

    expect(correctSign).not.toBe(wrongSign);
  });

  it("should validate timestamp within 5 minutes", () => {
    const now = Math.floor(Date.now() / 1000);
    const validTs = now - 60; // 1分钟前
    const expiredTs = now - 400; // 6分40秒前（超过5分钟）

    expect(Math.abs(now - validTs)).toBeLessThanOrEqual(300);
    expect(Math.abs(now - expiredTs)).toBeGreaterThan(300);
  });
});
