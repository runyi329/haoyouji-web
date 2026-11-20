import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const deps = vi.hoisted(() => ({ db: vi.fn(), tx: vi.fn() }));
vi.mock('./db', () => ({ getDbConnection: deps.db, getDbTransactionConnection: deps.tx }));
import { getLedger37PresentationContext, readLedger37PresentationState } from './ledger37-ai-presentation';
import { LEDGER37_AI_DISPLAY_KEY } from '../shared/ledger37-ai-presentation';

const target = { ledgerId: 37 as const, userId: 201 };
const targetViewer = { userId: 201, username: 'customer201', nickname: '客户201', avatar: '/avatars/customer201.png' };
function row(overrides: Record<string, unknown> = {}) {
  return {
    ledger_id: 37, member_user_id: 201, member_role: 'member',
    initialBalances: JSON.stringify({ [LEDGER37_AI_DISPLAY_KEY]: 1 }),
    viewer_user_id: 201, viewer_username: targetViewer.username,
    viewer_nickname: targetViewer.nickname, viewer_avatar: targetViewer.avatar,
    ...overrides,
  };
}
function offline(value: Record<string, unknown>) {
  const log: Array<{ sql: string; values: unknown[] }> = [];
  const connection = { execute: vi.fn(async (sql: string, values: unknown[]) => {
    log.push({ sql, values });
    if (!/^\s*SELECT\b/.test(sql) || !/FROM ledgers l\b/.test(sql)) throw new Error('禁止非只读身份SQL');
    expect(values).toEqual([201, 37]);
    return [[value]];
  }) };
  deps.db.mockResolvedValue(connection);
  return { connection, log };
}
function find<T extends ts.Node>(root: ts.Node, guard: (node: ts.Node) => node is T, predicate: (node: T) => boolean): T {
  let found: T | undefined;
  const visit = (node: ts.Node) => {
    if (!found && guard(node) && predicate(node)) found = node;
    if (!found) ts.forEachChild(node, visit);
  };
  visit(root);
  if (!found) throw new Error('真实源码AST节点缺失');
  return found;
}
const serviceSource = readFileSync(new URL('./ledger37-ai-presentation.ts', import.meta.url), 'utf8');
const serviceAst = ts.createSourceFile('ledger37-ai-presentation.ts', serviceSource, ts.ScriptTarget.Latest, true);
const routerSource = readFileSync(new URL('./routers.ts', import.meta.url), 'utf8');
const routerAst = ts.createSourceFile('routers.ts', routerSource, ts.ScriptTarget.Latest, true);
function actualContextRoute() {
  const prop = find(routerAst, ts.isPropertyAssignment, node => node.name.getText(routerAst) === 'getLedger37PresentationContext');
  expect(prop.initializer.getText(routerAst)).toMatch(/^protectedProcedure\b/);
  const callback = find(prop, ts.isCallExpression, node => ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'query').arguments[0];
  const code = callback.getText(routerAst).replace("await import('./ledger37-ai-presentation')", '__backend');
  class OfflineError extends Error {
    code: string;
    constructor(value: { code: string; message: string }) { super(value.message); this.code = value.code; }
  }
  const compiled = ts.transpileModule(`(${code});`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  return runInNewContext(compiled, {
    __backend: { getLedger37PresentationContext }, TRPCError: OfflineError,
    require: undefined, fetch: undefined, process: undefined,
  }, { timeout: 1000 }) as (args: { ctx: any; input: any }) => Promise<unknown>;
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('离线测试禁止网络'); }));
});
afterEach(() => {
  expect(deps.tx).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

describe('37 AI viewer：真实只读服务、安全逐字段投影', () => {
  it('只输出目标viewer，夹带整行secret/钱包/角色均不能进入context', async () => {
    const f = offline(row({
      password: 'PASSWORD_SECRET', email: 'EMAIL_SECRET', balance: 'BALANCE_SECRET', frozen: 'FROZEN_SECRET',
      allUser: [{ userId: 28 }], role: 'super_admin', viewer_password: 'VIEWER_SECRET',
      viewer_email: 'VIEWER_EMAIL_SECRET', viewer_balance: 'VIEWER_BALANCE_SECRET',
      viewer: { userId: 28, nickname: '系统管理员' }, auth: { me: { id: 28 } },
    }));
    const context = await getLedger37PresentationContext(target);
    expect(context).toEqual({ ledgerId: 37, viewerUserId: 201, canManage: false, aiEnabled: true, viewer: targetViewer, isViewingAs: false });
    expect(Object.keys(context.viewer!).sort()).toEqual(['avatar', 'nickname', 'userId', 'username']);
    expect(JSON.stringify(context)).not.toMatch(/SECRET|password|email|balance|frozen|allUser|role|系统管理员/);
    expect(f.log).toHaveLength(1);
  });
  it('现有SQL只LEFT JOIN当前成员users，参数仍严格绑定目标ID和37', async () => {
    const f = offline(row());
    await readLedger37PresentationState(target, f.connection);
    expect(deps.db).not.toHaveBeenCalled();
    expect(f.log).toHaveLength(1);
    const query = f.log[0];
    expect(query.values).toEqual([201, 37]);
    expect(query.sql).toMatch(/LEFT JOIN ledger_members m ON m\.ledgerId=l\.id AND m\.userId=\?/);
    expect(query.sql).toMatch(/LEFT JOIN users u ON u\.id=m\.userId/);
    expect(query.sql).toMatch(/WHERE l\.id=\? LIMIT 1/);
    expect(query.sql).not.toMatch(/SELECT\s+\*|u\.\*|password|email|balance\b|frozen|allUser|u\.role|UPDATE|INSERT|DELETE|CREATE|ALTER/i);
    const columns = query.sql.split(/\bFROM\b/)[0].match(/u\.[a-zA-Z]+\s+AS\s+viewer_[a-z_]+/g);
    expect(columns).toEqual(['u.id AS viewer_user_id', 'u.username AS viewer_username', 'u.name AS viewer_nickname', 'u.avatar AS viewer_avatar']);
    const schemaSource = readFileSync(new URL('../drizzle/schema.ts', import.meta.url), 'utf8');
    const schemaAst = ts.createSourceFile('schema.ts', schemaSource, ts.ScriptTarget.Latest, true);
    const users = find(schemaAst, ts.isVariableDeclaration, node => node.name.getText(schemaAst) === 'users');
    const userFields = find(users, ts.isObjectLiteralExpression, () => true).properties.map(p => ts.isPropertyAssignment(p) ? p.name.getText(schemaAst) : null);
    for (const column of ['id', 'username', 'name', 'avatar']) expect(userFields).toContain(column);
    expect(query.sql).not.toMatch(/u\.nickname\b/);
  });
  it.each([undefined, null])('资料ID缺失%j时返回null，不改原AI开关及权限', async id => {
    offline(row({ viewer_user_id: id, viewer_username: 'admin', viewer_nickname: '系统管理员', viewer_avatar: '/admin.png' }));
    expect(await getLedger37PresentationContext(target)).toEqual({ ledgerId: 37, viewerUserId: 201, canManage: false, aiEnabled: true, viewer: null, isViewingAs: false });
  });
  it('旧rows fixture完全没有viewer字段仍有null且保留原成员权限/关闭配置', async () => {
    offline({ ledger_id: 37, member_user_id: 201, member_role: 'admin', initialBalances: '{}' });
    expect(await getLedger37PresentationContext(target)).toEqual({ ledgerId: 37, viewerUserId: 201, canManage: true, aiEnabled: false, viewer: null, isViewingAs: false });
  });
  it.each([undefined, null, 123, { url: '/admin.png' }])('头像缺失或类型不符%j不伪装admin', async avatar => {
    offline(row({ viewer_avatar: avatar }));
    expect((await getLedger37PresentationContext(target)).viewer).toEqual({ ...targetViewer, avatar: null });
  });
  it('资料字符串null不被转换为管理员名字或虚构头像', async () => {
    offline(row({ viewer_username: null, viewer_nickname: null, viewer_avatar: null }));
    expect((await getLedger37PresentationContext(target)).viewer).toEqual({ userId: 201, username: null, nickname: null, avatar: null });
  });
  it.each([28, 202, '201', 0, NaN])('foreign或非精确viewer ID %j在输出前拒绝', async id => {
    const f = offline(row({ viewer_user_id: id, viewer_username: 'admin', viewer_avatar: '/admin.png' }));
    const output = vi.fn();
    await expect(getLedger37PresentationContext(target).then(output)).rejects.toThrow('身份不匹配');
    expect(output).not.toHaveBeenCalled();
    expect(f.log).toHaveLength(1);
  });
  it('sysadmin非member缺档允许null，仍不伪造profile或AI开关', async () => {
    offline(row({ member_user_id: null, member_role: null, initialBalances: null, viewer_user_id: null }));
    expect(await getLedger37PresentationContext({ ...target, systemRole: 'systemadmin' })).toEqual({ ledgerId: 37, viewerUserId: 201, canManage: true, aiEnabled: false, viewer: null, isViewingAs: false });
  });
  it('普通非member保持原拒绝，sysadmin代看非member同样不绕过', async () => {
    offline(row({ member_user_id: null, viewer_user_id: null }));
    await expect(getLedger37PresentationContext(target)).rejects.toThrow('成员');
    await expect(getLedger37PresentationContext({ ...target, systemRole: 'systemadmin', isViewingAs: true })).rejects.toThrow('成员');
  });
  it('sysadmin非member也拒绝意外出现的foreign profile', async () => {
    offline(row({ member_user_id: null, member_role: null, viewer_user_id: 28 }));
    await expect(getLedger37PresentationContext({ ...target, systemRole: 'systemadmin' })).rejects.toThrow('身份不匹配');
  });
  it.each([undefined, false, true])('owner返回准确代看状态%j，canManage仍来自原成员权限', async isViewingAs => {
    offline(row({ member_role: 'owner', isViewingAs: !isViewingAs }));
    expect(await getLedger37PresentationContext({ ...target, isViewingAs })).toEqual({
      ledgerId: 37, viewerUserId: 201, canManage: !isViewingAs, aiEnabled: true,
      viewer: targetViewer, isViewingAs: isViewingAs === true,
    });
  });
  it('真实源码AST投影为封闭对象而非spread，不依赖ctx/auth/me或管理员fallback', () => {
    expect((serviceAst as any).parseDiagnostics).toHaveLength(0);
    const projection = find(serviceAst, ts.isFunctionDeclaration, node => node.name?.text === 'readLedger37AiViewer');
    const returned = find(projection, ts.isReturnStatement, node => !!node.expression && ts.isObjectLiteralExpression(node.expression));
    const object = returned.expression as ts.ObjectLiteralExpression;
    expect(object.properties.every(ts.isPropertyAssignment)).toBe(true);
    expect(object.properties.map(p => ts.isPropertyAssignment(p) ? p.name.getText(serviceAst) : null)).toEqual(['userId', 'username', 'nickname', 'avatar']);
    expect(projection.getText(serviceAst)).not.toMatch(/ctx\.|auth\.|\.me\b|systemRole|password|email|balance|frozen|allUser/);
    const state = find(serviceAst, ts.isFunctionDeclaration, node => node.name?.text === 'readLedger37PresentationState');
    const execute = find(state, ts.isCallExpression, node => ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'execute');
    expect(execute.arguments[1].getText(serviceAst)).toBe('[input.userId, 37]');
  });
});

describe('现有protected context路由真实AST：代看与目标身份闭环', () => {
  it('sysadmin viewAs目标admin只拿目标profile且canManage始终false', async () => {
    offline(row({ member_role: 'admin' }));
    const result = await actualContextRoute()({
      ctx: { user: { id: 201, role: 'systemadmin', nickname: '不应使用ctx资料', avatar: '/wrong.png' }, realUser: { id: 28, role: 'admin', nickname: '真实管理员' }, isViewingAs: true },
      input: { ledgerId: 37, viewAsUserId: 201 },
    });
    expect(result).toEqual({ ledgerId: 37, viewerUserId: 201, canManage: false, aiEnabled: true, viewer: targetViewer, isViewingAs: true });
  });
  it('目标缺资料或头像时不能回退ctx/realUser管理员', async () => {
    offline(row({ viewer_user_id: null }));
    const result = await actualContextRoute()({
      ctx: { user: { id: 201, role: 'member', nickname: 'ctx昵称', avatar: '/ctx.png' }, realUser: { id: 28, role: 'admin', nickname: '真实管理员', avatar: '/admin.png' }, isViewingAs: true },
      input: { ledgerId: 37, viewAsUserId: 201 },
    });
    expect(result).toEqual({ ledgerId: 37, viewerUserId: 201, canManage: false, aiEnabled: true, viewer: null, isViewingAs: true });
  });
  it('客户端伪造viewAs第三人被真实路由在DB前拒绝', async () => {
    await expect(actualContextRoute()({ ctx: { user: { id: 201, role: 'systemadmin' }, isViewingAs: true }, input: { ledgerId: 37, viewAsUserId: 28 } })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(deps.db).not.toHaveBeenCalled();
  });
});
