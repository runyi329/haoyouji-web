import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  formatMibanCheckoutError,
  getMibanReceiverPhoneError,
  mibanReceiverPhoneSchema,
  MIBAN_RECEIVER_PHONE_INVALID,
  MIBAN_RECEIVER_PHONE_REQUIRED,
  MIBAN_RECEIVER_PHONE_TOO_SHORT,
  normalizeMibanReceiverPhone,
} from "../shared/miban-shipping";

// 仅测试共用输入schema与纯函数，不导入应用或数据库模块。
describe("商城收货联系电话统一校验", () => {
  it.each(["13800138000", "+8613800138000", "008613800138000"])("完整号码可提交：%s", phone => {
    expect(mibanReceiverPhoneSchema.parse(phone)).toBe(phone);
    expect(getMibanReceiverPhoneError(phone)).toBeNull();
  });

  it.each(["1380013800", "1380013", "+1380013800"])("不足11位数字不允许保存或付款：%s", phone => {
    expect(mibanReceiverPhoneSchema.safeParse(phone).success).toBe(false);
    expect(getMibanReceiverPhoneError(phone)).toBe(MIBAN_RECEIVER_PHONE_TOO_SHORT);
  });

  it("空号码明确提示，不弹原始英文校验信息", () => {
    expect(getMibanReceiverPhoneError("  ")).toBe(MIBAN_RECEIVER_PHONE_REQUIRED);
  });

  it.each(["138****8000", "1380013800a", "138+00138000", "13800138000分机"])("不能用脱敏符号或文字凑长度：%s", phone => {
    expect(getMibanReceiverPhoneError(phone)).toBeTruthy();
    expect(mibanReceiverPhoneSchema.safeParse(phone).success).toBe(false);
  });

  it("清理复制粘贴的全角字符、空格、括号及连接号，不补齐缺少的数字", () => {
    expect(mibanReceiverPhoneSchema.parse(" （＋８６） １３８-００１３-８０００ ")).toBe("+8613800138000");
    expect(normalizeMibanReceiverPhone(" 138 001 3800 ")).toBe("1380013800");
    expect(getMibanReceiverPhoneError(" 138 001 3800 ")).toBe(MIBAN_RECEIVER_PHONE_TOO_SHORT);
  });

  it("超过原订单20字符上限仍会拒绝", () => {
    expect(getMibanReceiverPhoneError("1".repeat(21))).toBe("收货联系电话过长，请核对后重新填写");
  });

  it("普通/精选/购物车订单、修改地址、地址簿新增修改七处使用同一schema", () => {
    const source = readFileSync(new URL("./miban.ts", import.meta.url), "utf8");
    expect(source.match(/receiverPhone:\s*mibanReceiverPhoneSchema/g)).toHaveLength(5);
    expect(source.match(/\bphone:\s*mibanReceiverPhoneSchema/g)).toHaveLength(2);
    expect(source).not.toMatch(/receiverPhone:\s*z\.string\(\).*\.min\(11/);
    expect(source).not.toMatch(/\bphone:\s*z\.string\(\)\.min\(7\)/);
  });
});

describe("支付错误提示不暴露Zod JSON", () => {
  it("精确复现用户截图的旧版too_small错误", () => {
    const message = JSON.stringify([{ origin: "string", code: "too_small", minimum: 11, inclusive: true, path: ["receiverPhone"], message: "Too small: expected string to have >=11 characters" }]);
    expect(formatMibanCheckoutError({ message })).toBe(MIBAN_RECEIVER_PHONE_TOO_SHORT);
  });

  it("新版中文校验错误仅展示中文内容", () => {
    const result = mibanReceiverPhoneSchema.safeParse("1380013800");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(formatMibanCheckoutError({ message: JSON.stringify(result.error.issues) })).toBe(MIBAN_RECEIVER_PHONE_TOO_SHORT);
    }
  });

  it("地址簿phone字段亦采用相同友好提示", () => {
    expect(formatMibanCheckoutError({ message: JSON.stringify([{ path: ["phone"], code: "too_small" }]) })).toBe(MIBAN_RECEIVER_PHONE_TOO_SHORT);
  });

  it("格式错误不被错误当作余额不足", () => {
    expect(formatMibanCheckoutError({ message: JSON.stringify([{ path: ["receiverPhone"], code: "invalid_format" }]) })).toBe(MIBAN_RECEIVER_PHONE_INVALID);
  });

  it.each(["人民币钱包余额不足，本次最多可使用 ¥0.00", "U 钱包余额不足", "当前商品库存不足", "Load failed"])("保留真实业务/网络失败，不伪装成功：%s", message => {
    expect(formatMibanCheckoutError({ message })).toBe(message);
  });

  it("其他字段显示可操作的中文提示", () => {
    expect(formatMibanCheckoutError(JSON.stringify([{ path: ["receiverAddress"], message: "Too small" }]))).toBe("请补全收货地址后再付款");
    expect(formatMibanCheckoutError(JSON.stringify([{ path: ["receiverName"], message: "Too small" }]))).toBe("请填写收货人姓名");
  });

  it("没有有用消息时安全使用调用方提示", () => {
    expect(formatMibanCheckoutError(null, "保存地址失败")).toBe("保存地址失败");
    expect(formatMibanCheckoutError({ message: "[]" }, "请检查填写内容")).toBe("请检查填写内容");
    expect(formatMibanCheckoutError({ message: '[{"path":["other"],"message":"Bad input"}]' })).toBe("提交订单失败，请稍后再试");
  });
});
