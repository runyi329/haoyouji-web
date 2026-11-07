import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  findStockCodesByInitials,
  resetStockSearchInitialsCacheForTests,
} from "./stock-search-initials";

const newEase = { ts_code: "300502.SZ", name: "新易盛" };
const makeDb = (rows = [newEase]) => ({
  execute: vi.fn().mockResolvedValue([rows, []]),
});

beforeEach(() => resetStockSearchInitialsCacheForTests());
afterEach(() => {
  resetStockSearchInitialsCacheForTests();
  vi.restoreAllMocks();
});

describe("findStockCodesByInitials", () => {
  it("matches full, middle and trailing initials case-insensitively after trim", async () => {
    const db = makeDb();
    for (const keyword of ["XYS", "xys", "YS", "ys", "S", "s", "  xYs \n"]) {
      expect(await findStockCodesByInitials(db, keyword)).toEqual([newEase.ts_code]);
    }
    expect(await findStockCodesByInitials(db, "XS")).toEqual([]);
    expect(db.execute).toHaveBeenCalledTimes(1);
    expect(db.execute).toHaveBeenCalledWith("SELECT ts_code, name FROM ts_stock_basic");
  });

  it("does not query for empty, Chinese, numeric or mixed/symbol keywords", async () => {
    const db = makeDb();
    for (const keyword of ["", " \n ", "新易盛", "300502", "300502.SZ", "XYS1", "X新", "X Y", "*ST", "x-y", "é", "ＸＹＳ"]) {
      expect(await findStockCodesByInitials(db, keyword)).toEqual([]);
    }
    expect(db.execute).not.toHaveBeenCalled();
  });

  it("builds every abbreviation from metadata, retaining English/ST while filtering symbols, digits and spaces", async () => {
    const db = makeDb([
      { ts_code: "000001.SZ", name: " *ST 中 科 A1 " },
      { ts_code: "000002.SZ", name: "ABC新 易 盛3退" },
      { ts_code: "000003.SZ", name: "中科曙光" },
    ]);
    expect(await findStockCodesByInitials(db, "stzka")).toEqual(["000001.SZ"]);
    expect(await findStockCodesByInitials(db, "ABcxysT")).toEqual(["000002.SZ"]);
    expect(await findStockCodesByInitials(db, "yst")).toEqual(["000002.SZ"]);
    expect(await findStockCodesByInitials(db, "SG")).toEqual(["000003.SZ"]);
    expect(await findStockCodesByInitials(db, "xys")).toEqual(["000002.SZ"]);
  });

  it("reuses cached metadata until ten minutes elapse, then refreshes", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000);
    const db = makeDb();
    expect(await findStockCodesByInitials(db, "xys")).toEqual([newEase.ts_code]);
    now.mockReturnValue(1_000 + 10 * 60 * 1000 - 1);
    expect(await findStockCodesByInitials(db, "ys")).toEqual([newEase.ts_code]);
    expect(db.execute).toHaveBeenCalledTimes(1);
    db.execute.mockResolvedValue([[{ ts_code: "600000.SH", name: "浦发银行" }], []]);
    now.mockReturnValue(1_000 + 10 * 60 * 1000);
    expect(await findStockCodesByInitials(db, "pfyh")).toEqual(["600000.SH"]);
    expect(await findStockCodesByInitials(db, "xys")).toEqual([]);
    expect(db.execute).toHaveBeenCalledTimes(2);
  });

  it("shares a single pending build across concurrent callers", async () => {
    let resolve!: (value: any) => void;
    const db = { execute: vi.fn().mockReturnValue(new Promise((done) => { resolve = done; })) };
    const requests = ["XYS", "YS", "S"].map((keyword) => findStockCodesByInitials(db, keyword));
    expect(db.execute).toHaveBeenCalledTimes(1);
    resolve([[newEase], []]);
    expect(await Promise.all(requests)).toEqual([[newEase.ts_code], [newEase.ts_code], [newEase.ts_code]]);
    expect(await findStockCodesByInitials(db, "xys")).toEqual([newEase.ts_code]);
    expect(db.execute).toHaveBeenCalledTimes(1);
  });

  it("propagates build failures to all callers and retries rather than caching failure", async () => {
    const error = new Error("metadata unavailable");
    const db = makeDb();
    db.execute.mockRejectedValueOnce(error);
    const failed = await Promise.allSettled([
      findStockCodesByInitials(db, "xys"),
      findStockCodesByInitials(db, "ys"),
    ]);
    expect(failed).toEqual([
      { status: "rejected", reason: error },
      { status: "rejected", reason: error },
    ]);
    expect(db.execute).toHaveBeenCalledTimes(1);
    expect(await findStockCodesByInitials(db, "xys")).toEqual([newEase.ts_code]);
    expect(db.execute).toHaveBeenCalledTimes(2);
  });

  it("rejects malformed metadata rather than silently claiming no matches", async () => {
    const db = makeDb();
    db.execute.mockResolvedValueOnce({ rows: [] });
    await expect(findStockCodesByInitials(db, "xys")).rejects.toThrow("Invalid stock metadata result");
    db.execute.mockResolvedValueOnce([[{ ts_code: newEase.ts_code, name: null }], []]);
    await expect(findStockCodesByInitials(db, "xys")).rejects.toThrow("Invalid stock metadata row");
    expect(await findStockCodesByInitials(db, "xys")).toEqual([newEase.ts_code]);
    expect(db.execute).toHaveBeenCalledTimes(3);
  });
});
