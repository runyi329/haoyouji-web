import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { transformSync } from 'esbuild';
import { describe, expect, it, vi } from 'vitest';

// 只提取真实受测函数；绝不导入含基础设施建表的整个钱包模块。
const source = readFileSync(new URL('./ledger37-wallet.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('wallet.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const fn = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'migrateLedger37ManualMarginToWalletHold')!;
const code = transformSync(fn.getText(ast).replace(/^export /, '') + '\nreturn migrateLedger37ManualMarginToWalletHold;', { loader: 'ts', target: 'es2022' }).code;

function fixture(migrations: Record<string, any>[], holdExists = true) {
  const tx = {
    beginTransaction: vi.fn(async () => undefined), commit: vi.fn(async () => undefined), rollback: vi.fn(async () => undefined), release: vi.fn(),
    execute: vi.fn(async (sql: string, values: any[]) => {
      if (sql.includes('FROM ai_wallet_project_hold_migrations')) {
        // 执行真实SQL的关键同账本/同用户/原request或新名稳定来源条件，不把任何同用户历史行当作已完成。
        expect(sql).toContain('ledger_id = ? AND user_id = ?');
        expect(sql).toContain('tag_name = ? AND margin_entry_id = ?');
        return [migrations.filter(m => m.ledger_id === values[0] && m.user_id === values[1]
          && (m.request_id === values[2] || (m.tag_name === values[3] && m.margin_entry_id === values[4]))).slice(0, 2)];
      }
      if (sql.startsWith('SELECT * FROM ai_wallet_project_holds')) return [holdExists ? [{ id: values[0], tag_name: '新标签', amount: '5', status: 'active' }] : []];
      throw new Error('不应写新钱包或迁入流水');
    }),
  };
  const forbidden = vi.fn(async () => { throw new Error('不应调用资金变更'); });
  const deps = {
    ensureLedger37WalletInfrastructure: vi.fn(async () => undefined), normalizeLedger37WalletAsset: (v: string) => v,
    decimalText: (v: string) => v, LEDGER_37_ID: 37, buildManualMigrationRequestId: () => 'new-name-hash',
    getDbTransactionConnection: async () => tx, rowsOf: (r: any) => Array.isArray(r) ? r : [], holdResult: (r: any) => r,
    randomBytes: () => { throw new Error('幂等分支不应新建迁入编号'); }, isFundingAsset: () => true,
    dbMultiAssetWallet: { adjustMultiAssetBalance: forbidden }, freezeLedger37WalletHold: forbidden,
  };
  const migrate = new Function(...Object.keys(deps), code)(...Object.values(deps));
  return { tx, forbidden, migrate };
}
const row = () => ({ ledger_id: 37, user_id: 20, request_id: 'original-name-hash', tag_name: '新标签', margin_entry_id: 'original_entry_id', migration_no: 'M-existing', hold_id: 91, asset_code: 'ETH', amount: '5' });
const input = { userId: 20, tagName: '新标签', marginEntryId: 'original_entry_id', assetCode: 'ETH', amount: '5', actorUserId: 10 };

describe('今后标签改名保持历史押金迁入幂等，不回溯修复旧名称', () => {
  it('新名字匹配同一来源时复用原编号/冻结，原request id不改，不产生新资产或流水', async () => {
    const f = fixture([row()]);
    const result = await f.migrate(input);
    expect(result.alreadyCompleted).toBe(true); expect(result.migrationNo).toBe('M-existing'); expect(result.hold.id).toBe(91);
    expect(f.forbidden).not.toHaveBeenCalled(); expect(f.tx.execute).toHaveBeenCalledTimes(2); expect(f.tx.commit).toHaveBeenCalledOnce();
  });
  it('用户/账本隔离，不读取或补迁移另一标签和另一成员历史', async () => {
    const f = fixture([{ ...row(), ledger_id: 52 }, { ...row(), user_id: 21 }, { ...row(), tag_name: '以前旧标签' }, row()]);
    expect((await f.migrate(input)).migrationNo).toBe('M-existing'); expect(f.forbidden).not.toHaveBeenCalled();
  });
  it('既有数据出现重复关联则拒绝，不重复或选择覆盖', async () => {
    const f = fixture([row(), { ...row(), request_id: 'new-name-hash', migration_no: 'M-other' }]);
    await expect(f.migrate(input)).rejects.toThrow('重复关联'); expect(f.tx.rollback).toHaveBeenCalledOnce(); expect(f.tx.commit).not.toHaveBeenCalled();
  });
  it('金额冲突或冻结缺失时拒绝，不补建钱包记录', async () => {
    for (const f of [fixture([{ ...row(), amount: '6' }]), fixture([row()], false)]) {
      await expect(f.migrate(input)).rejects.toThrow(); expect(f.tx.rollback).toHaveBeenCalledOnce(); expect(f.forbidden).not.toHaveBeenCalled();
    }
  });
  it('沿用调用者事务时不提前提交或释放连接', async () => {
    const f = fixture([row()]); await f.migrate({ ...input, transaction: f.tx });
    expect(f.tx.beginTransaction).not.toHaveBeenCalled(); expect(f.tx.commit).not.toHaveBeenCalled(); expect(f.tx.release).not.toHaveBeenCalled();
  });
});
