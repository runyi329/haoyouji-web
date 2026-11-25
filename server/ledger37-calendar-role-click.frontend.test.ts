import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { consumeLedgerCalendarDoubleTap, type LedgerCalendarTap } from '../shared/ledger-calendar-double-tap';
import { canRecordLedger37Calendar } from '../shared/ledger37-permissions';
import { getBeijingLedgerRecordToday } from '../shared/ledger-record-date';

const read = (path: string) => readFileSync(new URL(`../client/src/${path}`, import.meta.url), 'utf8');
const aa = read('pages/LedgerDetailAA.tsx');
const recorder = read('components/Ledger37CalendarRecorder.tsx');
const dialog = read('components/Ledger37CalendarNumberDialog.tsx');
const main = read('main.tsx');
function bind(expression: string, bindings: Record<string, any>) {
  const code = ts.transpileModule(`const actual = ${expression};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  return new Function(...Object.keys(bindings), `${code}; return actual;`)(...Object.values(bindings));
}
function sourceAst(source: string) {
  return ts.createSourceFile('actual.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}
function actual(source: string, name: string, bindings: Record<string, any>) {
  const ast = sourceAst(source); let expression = '';
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) expression = node.initializer!.getText(ast);
    ts.forEachChild(node, visit);
  };
  visit(ast);
  if (!expression) throw new Error(`Missing actual expression ${name}`);
  return bind(expression, bindings);
}
function handlers(source: string, marker: string, bindings: Record<string, any>) {
  const ast = sourceAst(source); const found: Record<string, Function> = {};
  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) && node.getText(ast).includes(marker)) {
      for (const attr of node.attributes.properties) {
        if (ts.isJsxAttribute(attr) && attr.name.getText(ast).startsWith('on')
          && attr.initializer && ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
          found[attr.name.getText(ast)] = bind(attr.initializer.expression.getText(ast), bindings);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(ast); return found;
}
function harness(overrides: Record<string, any> = {}) {
  let editor: any = null; let mounts = 0;
  const bindings: Record<string, any> = {
    ledgerId: 37, canRecordCalendarNumber: true, canOpenCalendarDayDetail: false,
    canRecordCalendarCell: true, canOpenCalendarCell: false,
    day: 24, dayDateStr: '2026-11-24', getDateStr: () => '2026-11-24',
    getBeijingLedgerRecordToday, selectedTagId: 7, marginTargetUserId: 510025,
    isSelectedStockPortfolio: false, selectedTag: { name: '余额' }, selectedStockCalendarTag: null,
    calendarNumberTapRef: { current: null }, consumeLedgerCalendarDoubleTap,
    dayMap: new Map([['2026-11-24', { records: [{ images: ['offline-test.jpg'] }] }]]),
    openCalendarDayAttachments: vi.fn(), setCalendarDateDetail: vi.fn(), setShowImagePreview: vi.fn(),
    setShowStockPortfolio: vi.fn(),
    setCalendarNumberEditor: vi.fn((update: any) => {
      const next = typeof update === 'function' ? update(editor) : update;
      if (next !== editor) mounts++;
      editor = next;
    }),
    ...overrides,
  };
  bindings.handleDayClick = actual(aa, 'handleDayClick', bindings);
  bindings.openCalendarNumberEditor = actual(aa, 'openCalendarNumberEditor', bindings);
  return {
    bindings, events: handlers(aa, 'consumeLedgerCalendarDoubleTap(calendarNumberTapRef', bindings),
    editor: () => editor, mounts: () => mounts,
  };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-25T00:00:00Z')); });
afterEach(() => vi.useRealTimers());

describe('管理员只双击登记，普通用户点击仅放大照片：执行真实日期事件', () => {
  it.each([false, true])('有/无照片=%s，管理员第一击不挂任何遮罩，450ms第二击进入登记', (hasImages) => {
    const h = harness({ dayMap: new Map([['2026-11-24', { records: [{ images: hasImages ? ['offline-test.jpg'] : [] }] }]]) });
    h.events.onClick();
    expect(h.editor()).toBeNull();
    expect(h.bindings.openCalendarDayAttachments).not.toHaveBeenCalled();
    expect(h.bindings.setCalendarDateDetail).not.toHaveBeenCalled();
    vi.advanceTimersByTime(450); h.events.onClick();
    expect(h.editor()).toEqual({ categoryId: 7, date: '2026-11-24' });
    expect(h.bindings.setShowImagePreview).toHaveBeenCalledWith(false);
  });
  it('真实owner第一击同样不弹维护快览，第二击后尾随dblclick不重建scope', () => {
    const h = harness({ canOpenCalendarDayDetail: true, canOpenCalendarCell: true });
    h.events.onClick();
    expect(h.bindings.setCalendarDateDetail).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200); h.events.onClick();
    const scope = h.editor(); h.events.onDoubleClick();
    expect(h.editor()).toBe(scope);
    expect(h.mounts()).toBe(1);
  });
  it('单击等700ms无任何界面，超时再点击不算双击', () => {
    const h = harness(); h.events.onClick(); vi.advanceTimersByTime(700);
    expect(h.editor()).toBeNull(); h.events.onClick(); expect(h.editor()).toBeNull();
    expect(h.bindings.openCalendarDayAttachments).not.toHaveBeenCalled();
  });
  it.each(['onPointerCancel', 'onTouchMove'])('%s之后点击不会与取消前第一次点击配对', (event) => {
    const h = harness(); h.events.onClick(); h.events[event]();
    vi.advanceTimersByTime(200); h.events.onClick(); expect(h.editor()).toBeNull();
  });
  it.each([
    { memberRole: 'member', userId: 510025 },
    { memberRole: 'owner', userId: 510025 },
    { memberRole: 'super_admin', userId: 510025 },
    { memberRole: 'admin', userId: 510025, isViewingAs: true },
    { memberRole: 'owner', userId: 870413, isViewingAs: true },
  ])('普通/伪owner/系统角色/代看身份 $memberRole 均只照片、不登记', (identity) => {
    const canRecordCalendarNumber = canRecordLedger37Calendar({ ledgerId: 37, ownerId: 870413, ...identity });
    expect(canRecordCalendarNumber).toBe(false);
    const h = harness({ canRecordCalendarNumber, canRecordCalendarCell: false, canOpenCalendarCell: true });
    h.events.onClick(); h.events.onDoubleClick();
    expect(h.bindings.openCalendarDayAttachments).toHaveBeenCalledWith('2026-11-24');
    expect(h.editor()).toBeNull();
    expect(h.bindings.setCalendarDateDetail).not.toHaveBeenCalled();
  });
  it('普通用户无照片点击无界面；未来日即使直接调用处理函数也不能查看或登记', () => {
    const member = harness({ canRecordCalendarNumber: false, canRecordCalendarCell: false, canOpenCalendarCell: true, dayMap: new Map() });
    member.events.onClick(); expect(member.bindings.openCalendarDayAttachments).not.toHaveBeenCalled();
    const future = harness({ getDateStr: () => '2999-01-01', canRecordCalendarCell: false, canOpenCalendarCell: false });
    future.events.onClick(); future.events.onDoubleClick(); future.bindings.handleDayClick(1); future.bindings.openCalendarNumberEditor(1);
    expect(future.editor()).toBeNull(); expect(future.bindings.openCalendarDayAttachments).not.toHaveBeenCalled();
  });
  it('股票成员点击进持仓、股票owner保留原快览，非37保留原单击快览', () => {
    const member = harness({ isSelectedStockPortfolio: true, canRecordCalendarCell: false, canOpenCalendarCell: true });
    member.events.onClick(); expect(member.bindings.setShowStockPortfolio).toHaveBeenCalledWith(true);
    const owner = harness({ isSelectedStockPortfolio: true, canOpenCalendarDayDetail: true, canRecordCalendarCell: false, canOpenCalendarCell: true });
    owner.events.onClick(); expect(owner.bindings.setCalendarDateDetail).toHaveBeenCalledWith(expect.objectContaining({ isStockPortfolio: true }));
    const other = harness({ ledgerId: 52, canRecordCalendarNumber: false, canRecordCalendarCell: false, canOpenCalendarCell: true, canOpenCalendarDayDetail: true });
    other.events.onClick(); expect(other.bindings.setCalendarDateDetail).toHaveBeenCalled();
  });
  it('日期格原有未来、非交易日及股票禁登记条件没有放宽', () => {
    const base = { canRecordCalendarNumber: true, isNonTrading: false, isSelectedStockPortfolio: false, selectedTagId: 7, dayDateStr: '2026-11-24' };
    expect(actual(aa, 'canRecordCalendarCell', base)).toBe(true);
    for (const patch of [{ isNonTrading: true }, { isSelectedStockPortfolio: true }, { selectedTagId: null }, { dayDateStr: '2999-01-01' }, { canRecordCalendarNumber: false }]) {
      expect(actual(aa, 'canRecordCalendarCell', { ...base, ...patch })).toBeFalsy();
    }
  });
});

describe('两个入口统一click双击且不串scope', () => {
  it('600ms边界、同日期不同标签/身份、倒退时钟都正确判定', () => {
    const ref: { current: LedgerCalendarTap | null } = { current: null };
    expect(consumeLedgerCalendarDoubleTap(ref, 'user:7:24', 1000)).toBe(false);
    expect(consumeLedgerCalendarDoubleTap(ref, 'user:7:24', 1600)).toBe(true);
    expect(ref.current).toBeNull();
    for (const key of ['user:8:24', 'other:7:24', 'user:7:25']) {
      ref.current = { key: 'user:7:24', at: 1000 };
      expect(consumeLedgerCalendarDoubleTap(ref, key, 1200)).toBe(false);
    }
    ref.current = { key: 'user:7:24', at: 1000 };
    expect(consumeLedgerCalendarDoubleTap(ref, 'user:7:24', 900)).toBe(false);
  });
  it('AI日历不依赖PointerEvent，两click进入；pointerup/touchend不重复计数', () => {
    const bindings = { enabled: true, selectedId: 7, viewerUserId: 510025, dayDate: '2026-11-24', lastTap: { current: null }, consumeLedgerCalendarDoubleTap, openNumber: vi.fn() };
    const events = handlers(recorder, 'consumeLedgerCalendarDoubleTap(lastTap', bindings);
    events.onClick(); expect(bindings.openNumber).not.toHaveBeenCalled();
    vi.advanceTimersByTime(450); events.onClick(); expect(bindings.openNumber).toHaveBeenCalledWith('2026-11-24');
    expect(events.onPointerUp).toBeUndefined(); expect(events.onTouchEnd).toBeUndefined();
    expect(handlers(aa, 'consumeLedgerCalendarDoubleTap(calendarNumberTapRef', harness().bindings).onPointerUp).toBeUndefined();
  });
  it('AI未来日不登记，换标签月份身份时清理待配对点击', () => {
    const bindings = { enabled: false, selectedId: 7, viewerUserId: 510025, dayDate: '2999-01-01', lastTap: { current: null }, consumeLedgerCalendarDoubleTap, openNumber: vi.fn() };
    const events = handlers(recorder, 'consumeLedgerCalendarDoubleTap(lastTap', bindings);
    events.onClick(); events.onClick(); events.onDoubleClick(); expect(bindings.openNumber).not.toHaveBeenCalled();
    expect(recorder).toContain('useEffect(() => { lastTap.current = null; }, [month, selectedId, viewerUserId])');
    expect(aa).toContain('[ledgerId, selectedTagId, calendarDate.year, calendarDate.month, marginTargetUserId, canRecordCalendarNumber]');
  });
});

describe('登记页兼容旧WebView真实输入，仍挡无输入来源的残余click', () => {
  it.each(['onPointerDownCapture', 'onTouchStartCapture', 'onMouseDownCapture'])('%s之后真实click可用；无输入来源的click仍拦截', (start) => {
    const freshPointer = { current: false };
    const events = handlers(dialog, 'onTouchStartCapture', { freshPointer });
    const residual = { detail: 1, preventDefault: vi.fn(), stopPropagation: vi.fn() };
    events.onClickCapture(residual); expect(residual.preventDefault).toHaveBeenCalledOnce();
    events[start]({ button: 0 });
    const real = { detail: 1, preventDefault: vi.fn(), stopPropagation: vi.fn() };
    events.onClickCapture(real); expect(real.preventDefault).not.toHaveBeenCalled();
  });
  it('键盘click不拦，放大镜只更新预览，不保存/上传', () => {
    const events = handlers(dialog, 'onTouchStartCapture', { freshPointer: { current: false } });
    const keyboard = { detail: 0, preventDefault: vi.fn(), stopPropagation: vi.fn() };
    events.onClickCapture(keyboard); expect(keyboard.preventDefault).not.toHaveBeenCalled();
    const setPreview = vi.fn();
    const zoom = handlers(dialog, 'setPreview(image.imageUrl)', { setPreview, image: { imageUrl: 'offline-test.jpg' } });
    zoom.onClick(); expect(setPreview).toHaveBeenCalledWith('offline-test.jpg');
  });
  it('getCalendarEntry精确匹配独立httpLink，同一认证fetch保持不变', () => {
    const ast = sourceAst(main); let condition = '';
    const visit = (node: ts.Node) => {
      if (ts.isMethodDeclaration(node) && node.name.getText(ast) === 'condition') condition = node.getText(ast);
      ts.forEachChild(node, visit);
    };
    visit(ast);
    const route = bind(`({${condition}}).condition`, { isAdminWalletRequest: () => false, isT0JournalRequest: () => false });
    expect(route({ path: 'ledger.getCalendarEntry' })).toBe(true);
    expect(route({ path: 'ledger.getCalendarEntryExtra' })).toBe(false);
    expect(route({ path: 'ledger.getTransactions' })).toBe(false);
    expect(main).toContain('true: httpLink({ url: trpcEndpoint, transformer: superjson, fetch: trpcFetch })');
  });
});
