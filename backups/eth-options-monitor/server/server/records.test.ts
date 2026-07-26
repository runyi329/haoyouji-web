/**
 * 持仓记录接口测试
 * 测试 records.list / records.add / records.delete 三个 tRPC 过程
 * 使用 mock 替换数据库调用，不依赖真实数据库连接
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { Request, Response } from "express";

// Mock 数据库辅助函数
vi.mock("./db", () => ({
  upsertUser: vi.fn(),
  getUserByOpenId: vi.fn(),
  getBuyRecordsByClientId: vi.fn(),
  insertBuyRecord: vi.fn(),
  deleteBuyRecord: vi.fn(),
}));

import * as db from "./db";

function createContext() {
  const req = {
    headers: {},
    cookies: {},
  } as unknown as Request;
  const res = {
    clearCookie: vi.fn(),
    cookie: vi.fn(),
  } as unknown as Response;
  return { req, res, user: null };
}

describe("records router", () => {
  const clientId = "test-client-123";
  const caller = appRouter.createCaller(createContext());

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records.list returns records for clientId", async () => {
    const mockRecords = [
      {
        id: "rec-1",
        clientId,
        instrumentName: "ETH-25SEP26-3000-C",
        strike: 3000,
        expiryLabel: "2026/09/25",
        annualizedRate: 0.15,
        markPriceUsd: 120,
        ethPriceAtBuy: 2500,
        trueBreakeven: 3200,
        note: "test",
        createdAt: new Date(),
        userId: null,
      },
    ];
    vi.mocked(db.getBuyRecordsByClientId).mockResolvedValue(mockRecords as any);

    const result = await caller.records.list({ clientId });
    expect(result).toHaveLength(1);
    expect(result[0].instrumentName).toBe("ETH-25SEP26-3000-C");
    expect(db.getBuyRecordsByClientId).toHaveBeenCalledWith(clientId);
  });

  it("records.add inserts a record and returns success", async () => {
    vi.mocked(db.insertBuyRecord).mockResolvedValue(undefined as any);

    const result = await caller.records.add({
      id: "rec-2",
      clientId,
      instrumentName: "ETH-25DEC26-3500-C",
      strike: 3500,
      expiryLabel: "2026/12/25",
      annualizedRate: 0.18,
      markPriceUsd: 200,
      ethPriceAtBuy: 2600,
      trueBreakeven: 3800,
      note: "买入测试",
    });

    expect(result.success).toBe(true);
    expect(db.insertBuyRecord).toHaveBeenCalledOnce();
  });

  it("records.delete removes a record and returns success", async () => {
    vi.mocked(db.deleteBuyRecord).mockResolvedValue(undefined as any);

    const result = await caller.records.delete({ id: "rec-1", clientId });
    expect(result.success).toBe(true);
    expect(db.deleteBuyRecord).toHaveBeenCalledWith("rec-1", clientId);
  });
});
