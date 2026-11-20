import { describe, expect, it, vi } from 'vitest';
vi.mock('./db', () => ({ getDbConnection: vi.fn(), getDbTransactionConnection: vi.fn() }));
import { replaceTopLevelJsonValue } from './r1-lossless-json';
import { readR1Balances, readR1AiEnabled } from './r1-stock-presentation';
const key = '__stockAiDisplay_category_90250';
const globalKey = '__ledger37AiDisplay';

describe('R1 AI单字段原文替换，无数据库或资金操作', () => {
  it.each([
    '{}', '    {}  ', '   {   }  ', '\n  {\n\t}  \n',
    '  {"a":1}  ', '    {"a":1,"b":2}  ',
    ' { "cash":123456789012345678901234567890, "fraction":0.123456789012345678 } ',
    ' {"nested":{"cash":0.123456789012345678,"arr":[1,{"x":"brace } [ \\" }"}]},"normal":-1.9e+20} ',
  ])('追加时原兄弟字节完全保留、任意前导空白仍有效：%s', raw => {
    const patched = replaceTopLevelJsonValue(raw, key, 1);
    expect(JSON.parse(patched)[key]).toBe(1);
    const insertion = `${Object.keys(JSON.parse(raw)).length ? ',' : ''}${JSON.stringify(key)}:1`;
    const close = raw.lastIndexOf('}');
    expect(patched).toBe(raw.slice(0, close) + insertion + raw.slice(close));
    expect(replaceTopLevelJsonValue(patched, key, 1)).toBe(patched);
  });
  it.each([null, ''])('未初始化仅初始化安全JSON：%s', raw => {
    expect(replaceTopLevelJsonValue(raw, key, 1)).toBe(`{"${key}":1}`);
  });
  it('替换只改开关字符，大整数与18位裸小数和金额字符串不经JSON数值重序列化', () => {
    const raw = `  {"large":123456789012345678901234567890,"fraction":0.123456789012345678,"text":"1.123456789012345678","${key}" : 0,"nested":{"${key}":0}}  `;
    const patched = replaceTopLevelJsonValue(raw, key, 1);
    expect(patched).toBe(raw.replace(`"${key}" : 0`, `"${key}" : 1`));
    expect(patched).toContain('123456789012345678901234567890');
    expect(patched).toContain('0.123456789012345678');
    expect(patched).toContain('"1.123456789012345678"');
    expect(patched).toContain(`"nested":{"${key}":0}`);
  });
  it('字符串中键样文本和嵌套同名键不能误认为顶层开关', () => {
    const raw = JSON.stringify({ text: `\"${key}\":0 } ]`, nested: { [key]: 0 }, arr: ['} [ "', { [key]: 1 }] });
    const patched = replaceTopLevelJsonValue(raw, key, 1);
    expect(JSON.parse(patched)).toEqual({ ...JSON.parse(raw), [key]: 1 });
    expect(patched.startsWith(raw.slice(0, -1))).toBe(true);
  });
  it.each([
    `{"${key}":1,"${key}":0}`,
    `{"${key}":0,"${key}":1}`,
    `{"${key}":0,"\\u005f_stockAiDisplay_category_90250":1}`,
  ])('无损helper仍拒绝替换重复旧key，但退役旧key不能干扰全局读：%s', raw => {
    expect(() => replaceTopLevelJsonValue(raw, key, 1)).toThrow('重复');
    expect(readR1AiEnabled(readR1Balances(raw))).toBe(false);
  });
  it.each([`{"${globalKey}":1,"${globalKey}":0}`, `{"${globalKey}":0,"__ledger37AiDispl\\u0061y":1}`])('全局重复key读写均failclosed：%s', raw => {
    expect(() => replaceTopLevelJsonValue(raw, globalKey, 1)).toThrow('重复');
    expect(() => readR1Balances(raw)).toThrow('重复');
  });
  it.each([undefined, false, true, '0', '1', 2, null, {}, []])('存在的非法开关不能默认关闭泄露原页面：%s', value => {
    expect(() => readR1AiEnabled({ [globalKey]: value })).toThrow('数字0或1');
  });
  it('缺键旧配置兼容关闭，数字0/1唯一合法，原型继承不能伪装自有配置', () => {
    expect(readR1AiEnabled({})).toBe(false);
    expect(readR1AiEnabled({ [globalKey]: 0 })).toBe(false);
    expect(readR1AiEnabled({ [globalKey]: 1 })).toBe(true);
    expect(readR1AiEnabled(Object.create({ [globalKey]: 1 }))).toBe(false);
  });
  it.each(['[]', 'null', '1', '{"x":}', '{"x":1,}', 'not json', { x: 1 }])('非法JSON或非对象绝不写回：%s', raw => {
    expect(() => replaceTopLevelJsonValue(raw, key, 1)).toThrow();
  });
});
