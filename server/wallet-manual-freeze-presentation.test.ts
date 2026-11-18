import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { isWalletFlowCurrency } from '../shared/wallet-flow-currency';
import { getInternalTransferPresentation } from '../client/src/lib/walletTransferPresentation';

// 抽取真实纯展示函数，不加载页面、tRPC、数据库或网络，也不提交任何资金动作。
function load(path: string, names: string[]) {
  const ast = ts.createSourceFile(path, readFileSync(new URL(path, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const functions = ast.statements.filter(ts.isFunctionDeclaration);
  const source = names.map(name => {
    const found = functions.find(node => node.name?.text === name);
    if (!found) throw new Error(`Missing production function: ${name}`);
    return found.getText(ast);
  }).join('\n');
  const { outputText } = ts.transpileModule(`${source}\n({${names.join(',')}});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  });
  return runInNewContext(outputText, { isWalletFlowCurrency, getInternalTransferPresentation }, { timeout: 1000 }) as Record<string, (...args: any[]) => any>;
}
const crypto = load('../client/src/pages/CryptoWalletTransactions.tsx', ['cleanNote', 'hasOrderContext', 'getUsdtEntry']);
const wallet = load('../client/src/pages/Wallet.tsx', ['cleanWalletFlowNote', 'summarizeWalletFlowNote', 'hasOrderContext',
  'getUsdtFlowPresentation', 'getCnyQuickFlowPresentation', 'getDigitalFlowPresentation']);
const cny = load('../client/src/pages/WalletCnyTransactions.tsx', ['cleanNote', 'summarizeNote', 'getCnyFlowPresentation']);

const notes = ['正常备注', '订单取消但不是订单冻结', '提现以及奖励入账', '[站内转账] 给张三', '手动冻结原记录后部分解冻'];
describe('真实USDT钱包和数字资产明细：手动来源优先于备注内容', () => {
  for (const release of [false, true]) {
    for (const note of notes) {
      it(`${release ? '解冻' : '冻结'}与备注“${note}”仍是内部冻结层变动`, () => {
        const item = { id: 'manual_hold_31', currency: 'USDT', sourceType: 'wallet_hold', type: release ? 'manual_release' : 'manual_freeze',
          amount: release ? '1.25000000' : '-1.25000000', balanceAfter: null, note, createdAt: '2026-11-18 16:00:00' };
        const before = JSON.stringify(item);
        const entry = crypto.getUsdtEntry(item);
        expect(entry).toMatchObject({ primary: release ? '手动解冻' : '手动冻结', type: 'frozen', isFrozen: true, isRelease: release,
          amount: release ? 1.25 : -1.25, balanceAfter: null, status: release ? '已恢复可用' : '已冻结', assetCode: 'USDT' });
        expect(wallet.getUsdtFlowPresentation(item)).toMatchObject({ label: release ? '手动解冻' : '手动冻结', isIn: release,
          status: release ? '已恢复可用' : '已冻结' });
        expect(JSON.stringify(item)).toBe(before);
      });
    }
  }
  it('CNY不被套入USDT单位；普通调账类型不能冒充手动来源', () => {
    expect(crypto.getUsdtEntry({ currency: 'CNY', sourceType: 'wallet_hold', type: 'manual_freeze', amount: '-1' })).toBeNull();
    const entry = crypto.getUsdtEntry({ currency: 'USDT', sourceType: 'manual', type: 'manual_freeze', amount: '-1', note: '普通调账' });
    expect(entry).toMatchObject({ type: 'adjustment', isFrozen: false, isRelease: false, primary: '支出' });
  });
  it('原订单本金冻结和解冻仍保留原名称，普通扣款不会被重新定义', () => {
    for (const release of [false, true]) {
      const item = { currency: 'USDT', sourceType: 'wallet_hold', type: release ? 'principal_hold_release' : 'principal_hold', amount: release ? '10' : '-10' };
      expect(crypto.getUsdtEntry(item).primary).toBe(release ? '谷底征筹本金解冻' : '谷底征筹本金冻结');
      expect(wallet.getUsdtFlowPresentation(item).label).toBe(release ? '谷底征筹本金解冻' : '谷底征筹本金冻结');
    }
    expect(wallet.getUsdtFlowPresentation({ type: 'expense', amount: -2 })).toMatchObject({ label: '支出', isIn: false });
  });
});

describe('人民币和独立资产原币展示：手动冻结不误标成担保或真实扣款', () => {
  for (const release of [false, true]) {
    for (const note of notes) {
      it(`人民币${release ? '解冻' : '冻结'}按服务端manual_hold来源识别：${note}`, () => {
        expect(cny.getCnyFlowPresentation(`[CNY]${note}`, release, 'manual_hold')).toMatchObject({
          primary: release ? '手动解冻' : '手动冻结', status: release ? '已恢复可用' : '已冻结' });
        const quickNote = `[CNY]手动${release ? '解冻' : '冻结'} · ${note}`;
        expect(wallet.getCnyQuickFlowPresentation(quickNote, release)).toMatchObject({ label: release ? '手动解冻' : '手动冻结', isIn: release });
      });
    }
    it(`独立数字币${release ? '解冻' : '冻结'}只改展示，不变事件类型或数量`, () => {
      const item = { eventType: release ? 'collateral_release' : 'collateral_lock', amount: release ? 1 : -1,
        note: `手动${release ? '解冻' : '冻结'} · [MANUAL_FREEZE:31] · 订单字样不能改变分类` };
      const before = JSON.stringify(item);
      expect(wallet.getDigitalFlowPresentation(item)).toMatchObject({ label: release ? '手动解冻' : '手动冻结', isIn: release,
        status: release ? '已恢复可用' : '已冻结' });
      expect(JSON.stringify(item)).toBe(before);
    });
  }
  it('普通担保与名称相似的调账继续使用原事件来源，不凭备注冒充手动冻结', () => {
    expect(wallet.getDigitalFlowPresentation({ eventType: 'collateral_lock', amount: -1, note: '订单担保' }).label).toBe('担保冻结');
    expect(wallet.getDigitalFlowPresentation({ eventType: 'collateral_release', amount: 1, note: '订单解除' }).label).toBe('担保解冻');
    expect(wallet.getDigitalFlowPresentation({ eventType: 'admin_add', amount: 1, note: '手动解冻 · [MANUAL_FREEZE:31]' }).label).not.toBe('手动解冻');
  });
  it('人民币真实map调用传入来源；不更改原余额、可用余额和分页计算', () => {
    const source = readFileSync(new URL('../client/src/pages/WalletCnyTransactions.tsx', import.meta.url), 'utf8');
    expect(source).toContain('getCnyFlowPresentation(m.note, isIn, m.source_type)');
    expect(source).toContain('Number(m.balance_after)');
    expect(source).toContain('Number(m.available_after)');
  });
});
