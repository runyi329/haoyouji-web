/** 仅去除数据名称末尾的退市注记，不删正式简称中的“退”字。 */
export function aiStockDisplayName(name: string, listStatus: string): string {
  if (listStatus !== "D") return name;
  return name.replace(/(?:\s*[（(]\s*退(?:市)?\s*[）)])+\s*$/u, "").trim();
}

/** 名称本身已标明退市时，不再重复添加灰色徽标。 */
export function aiStockNeedsDelistedBadge(displayName: string, listStatus: string): boolean {
  return listStatus === "D" && !/退(?:市)?$/u.test(displayName.trim());
}
