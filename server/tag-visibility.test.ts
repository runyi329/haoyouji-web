import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import ts from 'typescript';
import { TRPCError } from '@trpc/server';
import {
  createNewMemberInitialBalances,
  readTagVisible,
  TAG_VISIBILITY_DEFAULT_KEY,
} from '../shared/tag-visibility';

const newMemberBalances = () => JSON.parse(createNewMemberInitialBalances(37)!);

describe('37号新成员的标签默认可见性', () => {
  it.each(['member', 'funder', 'admin'])('新%s成员默认关闭所有未设置标签', (role) => {
    const balances = JSON.parse(createNewMemberInitialBalances(37, role)!);
    expect(balances[TAG_VISIBILITY_DEFAULT_KEY]).toBe(0);
    expect(readTagVisible(balances, 'R1')).toBe(false);
    expect(readTagVisible(balances, '另一标签')).toBe(false);
  });

  it.each([0, 1, 52, 53])('其他账本%s不改变新成员配置', (ledgerId) => {
    expect(createNewMemberInitialBalances(ledgerId)).toBeNull();
  });

  it('账本拥有者不使用新成员默认关闭配置', () => {
    expect(createNewMemberInitialBalances(37, 'owner')).toBeNull();
  });

  it('旧成员未配置标签维持原有可见状态', () => {
    expect(readTagVisible(undefined, 'R1')).toBe(true);
    expect(readTagVisible(null, 'R1')).toBe(true);
    expect(readTagVisible({}, 'R1')).toBe(true);
  });

  it('旧成员已保存开关保持不变', () => {
    expect(readTagVisible({ R1__visible: 1, RE__visible: 0 }, 'R1')).toBe(true);
    expect(readTagVisible({ R1__visible: 1, RE__visible: 0 }, 'RE')).toBe(false);
    expect(readTagVisible({ R1__visible: 1, RE__visible: 0 }, '新增标签')).toBe(true);
  });

  it('新成员逐个开启标签不会连带开启其他标签', () => {
    const balances = { ...newMemberBalances(), R1__visible: 1 };
    expect(readTagVisible(balances, 'R1')).toBe(true);
    expect(readTagVisible(balances, 'RE')).toBe(false);
    expect(readTagVisible(balances, '以后创建的标签')).toBe(false);
  });

  it('增量保存其他字段后默认关闭标记保留', () => {
    const balances = { ...newMemberBalances(), R1__margin: 5000, R1__startDate: '2026-11-04' };
    expect(readTagVisible(balances, 'R1')).toBe(false);
    expect(readTagVisible(balances, 'RE')).toBe(false);
  });

  it('新成员标签开启后仍可显式关闭', () => {
    const balances = { ...newMemberBalances(), R1__visible: 0 };
    expect(readTagVisible(balances, 'R1')).toBe(false);
  });

  it('字符串开关兼容现有JSON数据', () => {
    expect(readTagVisible({ ...newMemberBalances(), R1__visible: '1' }, 'R1')).toBe(true);
    expect(readTagVisible({ ...newMemberBalances(), R1__visible: '0' }, 'R1')).toBe(false);
  });

  it('空开关沿用成员默认而不把新用户自动打开', () => {
    expect(readTagVisible({ ...newMemberBalances(), R1__visible: null }, 'R1')).toBe(false);
    expect(readTagVisible({ R1__visible: null }, 'R1')).toBe(true);
  });
});

// 仅提取实际保存保护函数，注入内存依赖；不导入路由初始化、不连接数据库。
const routerSource = fs.readFileSync(new URL('./routers.ts', import.meta.url), 'utf8');
const routerAst = ts.createSourceFile('routers.ts', routerSource, ts.ScriptTarget.Latest, true);
const acknowledgementFunction = routerAst.statements.find((node) => (
  ts.isFunctionDeclaration(node) && node.name?.text === 'assertLedgerMemberTagHideAcknowledgements'
));
if (!acknowledgementFunction) throw new Error('找不到实际标签隐藏保存保护函数');
const guardJs = ts.transpile(acknowledgementFunction.getText(routerAst), { target: ts.ScriptTarget.ES2022 });

function guardWithBalances(balances: Record<string, unknown>) {
  const impact = vi.fn(async () => ({ hasFinancialRecords: true, impactHash: 'saved-hash', dividend: { recordCount: 1 }, margin: { recordCount: 1 }, walletHolds: { recordCount: 0 } }));
  const guard = new Function('dbLedger', 'readTagVisible', 'getLedgerMemberTagHideImpact', 'TRPCError', `${guardJs}; return assertLedgerMemberTagHideAcknowledgements;`)(
    { getMyInitialBalances: async () => balances }, readTagVisible, impact, TRPCError,
  );
  return { guard, impact };
}

describe('新成员默认关闭与实际保存保护的衔接', () => {
  it('默认已经关闭的标签保存0不再要求隐藏确认，即使存在账务', async () => {
    const { guard, impact } = guardWithBalances({ ...newMemberBalances(), R1__margin: 5000 });
    await expect(guard({ ledgerId: 37, targetUserId: 1, balances: { R1__visible: 0 } })).resolves.toBeUndefined();
    expect(impact).not.toHaveBeenCalled();
  });

  it('新成员显式开启后隐藏仍需要确认', async () => {
    const { guard, impact } = guardWithBalances({ ...newMemberBalances(), R1__visible: 1 });
    await expect(guard({ ledgerId: 37, targetUserId: 1, balances: { R1__visible: 0 } })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    expect(impact).toHaveBeenCalledOnce();
  });

  it('旧成员缺失开关依然视为开启，隐藏账务标签仍受保护', async () => {
    const { guard } = guardWithBalances({});
    await expect(guard({ ledgerId: 37, targetUserId: 1, balances: { R1__visible: 0 } })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  });

  it('正确确认后允许从开启变为关闭', async () => {
    const { guard } = guardWithBalances({ ...newMemberBalances(), R1__visible: 1 });
    await expect(guard({ ledgerId: 37, targetUserId: 1, balances: { R1__visible: 0 }, hideAcknowledgements: [{ tagName: 'R1', impactHash: 'saved-hash' }] })).resolves.toBeUndefined();
  });
});
