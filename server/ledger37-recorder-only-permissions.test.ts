import { describe, expect, it } from 'vitest';
import { canRecordLedger37Calendar, isLedger37FullManager } from '../shared/ledger37-permissions';

const ownerId = 870413;
const input = (userId: number, memberRole: string, isViewingAs = false) => ({ ledgerId: 37, ownerId, userId, memberRole, isViewingAs });

describe('37号唯一owner全权，委派管理员只有日历数字能力', () => {
  it('真实owner允许全部管理和数字登记，不依赖昵称或系统角色', () => {
    expect(isLedger37FullManager(input(ownerId, 'owner'))).toBe(true);
    expect(canRecordLedger37Calendar(input(ownerId, 'owner'))).toBe(true);
  });
  it.each([510025, 2040145, 4952766, 4957303, 4957372])('委派管理员%s只能登记数字，不能完整管理', (id) => {
    expect(isLedger37FullManager(input(id, 'admin'))).toBe(false);
    expect(canRecordLedger37Calendar(input(id, 'admin'))).toBe(true);
  });
  it.each(['member', 'viewer', 'owner', 'super_admin', 'admin_system'])('非owner角色%s不能伪造管理或登记能力', (role) => {
    expect(isLedger37FullManager(input(99, role))).toBe(false);
    expect(canRecordLedger37Calendar(input(99, role))).toBe(false);
  });
  it.each([input(ownerId, 'owner', true), input(510025, 'admin', true)])('任何代看均不能管理或登记：%j', (value) => {
    expect(isLedger37FullManager(value)).toBe(false);
    expect(canRecordLedger37Calendar(value)).toBe(false);
  });
  it('账本转移所有者后按新ownerId生效，不硬编码JIMG昵称或当前ID', () => {
    expect(isLedger37FullManager({ ...input(ownerId, 'owner'), ownerId: 42 })).toBe(false);
    expect(isLedger37FullManager({ ...input(42, 'member'), ownerId: 42 })).toBe(true);
  });
  it.each([null, undefined, 0, '', 'broken', -1])('所有者缺失或非法%s时全权失败关闭', (value) => {
    expect(isLedger37FullManager({ ...input(ownerId, 'owner'), ownerId: value })).toBe(false);
  });
  it.each([0, -1, 1.2, NaN])('无效操作者%s不能登记或管理', (userId) => {
    expect(isLedger37FullManager(input(userId, 'admin'))).toBe(false);
    expect(canRecordLedger37Calendar(input(userId, 'admin'))).toBe(false);
  });
  it.each([1, 36, 52, 59])('此37专用权限不能扩展到其他账本%s', (ledgerId) => {
    expect(isLedger37FullManager({ ...input(ownerId, 'owner'), ledgerId })).toBe(false);
    expect(canRecordLedger37Calendar({ ...input(510025, 'admin'), ledgerId })).toBe(false);
  });
});
