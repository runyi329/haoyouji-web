import { describe, expect, it } from "vitest";
import { parseAddress, serializeAddress } from "../client/src/pages/yaban/AddressPicker";

describe("牙伴全国地址文本兼容", () => {
  it("可拆出滁州地区并保留门牌详细文本", () => {
    const parsed = parseAddress("安徽省 滁州市 琅琊区 详细门牌");
    expect(parsed.province?.name).toBe("安徽省");
    expect(parsed.city?.name).toBe("滁州市");
    expect(parsed.district).toBe("琅琊区");
    expect(parsed.detail).toBe("详细门牌");
  });

  it("兼容重复的旧直辖市层级但不重复输出", () => {
    const parsed = parseAddress("上海市上海市浦东新区门牌文本");
    expect(parsed.province?.name).toBe("上海市");
    expect(parsed.city?.name).toBe("浦东新区");
    expect(parsed.detail).toBe("门牌文本");
    expect(serializeAddress(["上海市", "上海市", "浦东新区"], "门牌文本")).toBe("上海市 浦东新区 门牌文本");
  });

  it("详细地址即使以同名区县开头也不能再被剥离", () => {
    const parsed = parseAddress("上海市 浦东新区 浦东新区路99号");
    expect(parsed.detail).toBe("浦东新区路99号");
    expect(serializeAddress(["上海市", "浦东新区"], parsed.detail)).toBe("上海市 浦东新区 浦东新区路99号");
  });

  it("未知及已撤并的旧名称原文仍保留，不强行猜测地区", () => {
    expect(parseAddress("未知地区原地址文本").detail).toBe("未知地区原地址文本");
    const parsed = parseAddress("重庆市 江北区 原门牌");
    expect(parsed.province?.name).toBe("重庆市");
    expect(parsed.detail).toBe("江北区 原门牌");
  });

  it("省直管县市与无县级城市都可拆解，不伪造区县", () => {
    for (const [text, province, city] of [
      ["湖北省 仙桃市 详细地址", "湖北省", "仙桃市"],
      ["广东省 东莞市 详细地址", "广东省", "东莞市"],
      ["新疆维吾尔自治区 草湖市 详细地址", "新疆维吾尔自治区", "草湖市"],
    ]) {
      const parsed = parseAddress(text);
      expect(parsed.province?.name).toBe(province);
      expect(parsed.city?.name).toBe(city);
      expect(parsed.district).toBe("");
      expect(parsed.detail).toBe("详细地址");
    }
  });

  it("港澳与台湾按真实已支持层级拆分", () => {
    expect(parseAddress("香港特别行政区 中西区 详细地址").city?.name).toBe("中西区");
    const parsed = parseAddress("台湾省 台北市 中正区 详细地址");
    expect(parsed.province?.name).toBe("台湾省");
    expect(parsed.city?.name).toBe("台北市");
    expect(parsed.district).toBe("中正区");
  });

  it("空地址和海外详细文本不丢失", () => {
    expect(parseAddress("").detail).toBe("");
    expect(serializeAddress([], "")).toBe("");
    const parsed = parseAddress("海外/其他 详细原文");
    expect(parsed.province?.name).toBe("海外/其他");
    expect(parsed.detail).toBe("详细原文");
  });
});
