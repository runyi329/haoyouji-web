import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = (name: string) =>
  readFileSync(new URL(`../client/src/pages/miban/${name}.tsx`, import.meta.url), "utf8");

const nav = page("NavBar");
const userMenu = nav.slice(nav.indexOf("function UserMenu("), nav.indexOf("function PersonalWalletEntry("));

describe("supplier administration shortcut cleanup", () => {
  it("does not duplicate supplier administration in the avatar menu", () => {
    expect(userMenu).not.toContain("供货商管理");
    expect(userMenu).not.toContain("/admin?tab=suppliers");
    expect(userMenu).not.toContain("supplierAdmin");
  });

  it("keeps supplier workspace, management and other existing menu entries", () => {
    for (const label of ["供货商中心", "管理后台", "物流服务状态", "钱包充值", "扫码邀请", "退出登录"])
      expect(userMenu).toContain(label);
    expect(userMenu).toContain("hasSupplierAccess &&");
    expect(nav).toContain('supplierAccess.data?.isAdmin === true');
    expect(nav).toContain("(supplierAdmin || (supplierAccess.data?.suppliers.length ?? 0) > 0)");
  });

  it("retains the administrator supplier tab and its original component", () => {
    const admin = page("UnifiedAdmin");
    expect(admin).toContain('label: "供货商管理"');
    expect(admin).toContain('activeTab === "suppliers" && isSupplierAdmin && <SupplierAdminPanel />');
    expect(page("SupplierAdminPanel")).toContain("supplierApi.adminSave.useMutation");
  });
});
