/**
 * OKX 交易助手路由
 * 使用 OKX REST API 直接请求，不依赖命令行工具
 * 仅限 jiang 用户访问账户数据
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";
import crypto from "crypto";

// OKX API 配置（从环境变量读取，fallback 到硬编码用于 jiang 专属功能）
const OKX_API_KEY = process.env.OKX_API_KEY || "0e3116db-352d-45f8-b07d-ce80d448f991";
const OKX_SECRET_KEY = process.env.OKX_SECRET_KEY || "7CB6ADBF45521042E2143D165ADA3397";
const OKX_PASSPHRASE = process.env.OKX_PASSPHRASE || "Miao@20190603";
const OKX_BASE_URL = "https://www.okx.com";

// 生成 OKX API 签名
function signOKX(timestamp: string, method: string, path: string, body: string = ""): string {
  const msg = timestamp + method + path + body;
  return crypto.createHmac("sha256", OKX_SECRET_KEY).update(msg).digest("base64");
}

// 带认证的 OKX API 请求
async function okxPrivateRequest(path: string): Promise<any> {
  const timestamp = new Date().toISOString();
  const sign = signOKX(timestamp, "GET", path);

  const res = await fetch(`${OKX_BASE_URL}${path}`, {
    method: "GET",
    headers: {
      "OK-ACCESS-KEY": OKX_API_KEY,
      "OK-ACCESS-SIGN": sign,
      "OK-ACCESS-TIMESTAMP": timestamp,
      "OK-ACCESS-PASSPHRASE": OKX_PASSPHRASE,
      "Content-Type": "application/json",
    },
  });

  const data = await res.json();
  if (data.code !== "0") {
    throw new Error(`OKX API 错误: ${data.msg} (code: ${data.code})`);
  }
  return data.data;
}

// 公开行情请求（无需认证）
async function okxPublicRequest(path: string): Promise<any> {
  const res = await fetch(`${OKX_BASE_URL}${path}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
  const data = await res.json();
  if (data.code !== "0") {
    throw new Error(`OKX 行情 API 错误: ${data.msg}`);
  }
  return data.data;
}

// 权限检查：仅限 jiang 用户
function requireJiang(username: string) {
  if (username !== "jiang") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "此功能仅限管理员使用",
    });
  }
}

export const okxTraderRouter = router({
  // ===== 公开行情（无需登录）=====

  // 获取单个品种行情
  getTicker: publicProcedure
    .input(z.object({ instId: z.string() }))
    .query(async ({ input }) => {
      try {
        const data = await okxPublicRequest(`/api/v5/market/ticker?instId=${input.instId}`);
        const d = data[0];
        const last = parseFloat(d.last);
        const open24h = parseFloat(d.open24h);
        return {
          instId: d.instId,
          last,
          open24h,
          high24h: parseFloat(d.high24h),
          low24h: parseFloat(d.low24h),
          vol24h: parseFloat(d.vol24h),
          change24h: open24h > 0 ? (((last - open24h) / open24h) * 100).toFixed(2) : "0",
          ts: d.ts,
        };
      } catch (err: any) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `行情获取失败: ${err.message}`,
        });
      }
    }),

  // 批量获取多个品种行情
  getMultiTickers: publicProcedure
    .input(z.object({ instIds: z.array(z.string()) }))
    .query(async ({ input }) => {
      const results = await Promise.allSettled(
        input.instIds.map(async (instId) => {
          const data = await okxPublicRequest(`/api/v5/market/ticker?instId=${instId}`);
          const d = data[0];
          const last = parseFloat(d.last);
          const open24h = parseFloat(d.open24h);
          return {
            instId: d.instId,
            last,
            open24h,
            high24h: parseFloat(d.high24h),
            low24h: parseFloat(d.low24h),
            vol24h: parseFloat(d.vol24h),
            change24h: open24h > 0 ? (((last - open24h) / open24h) * 100).toFixed(2) : "0",
          };
        })
      );
      return results.map((r, i) =>
        r.status === "fulfilled"
          ? r.value
          : {
              instId: input.instIds[i],
              last: 0,
              open24h: 0,
              high24h: 0,
              low24h: 0,
              vol24h: 0,
              change24h: "0",
            }
      );
    }),

  // ===== 账户数据（需要登录 + jiang 权限）=====

  // 获取账户余额
  getBalance: protectedProcedure.query(async ({ ctx }) => {
    requireJiang(ctx.user.username);
    try {
      const data = await okxPrivateRequest("/api/v5/account/balance");
      const details = data[0]?.details || [];
      return details
        .filter((d: any) => parseFloat(d.eq) > 0.000001)
        .map((d: any) => ({
          ccy: d.ccy,
          eq: parseFloat(d.eq),
          availBal: parseFloat(d.availBal),
          frozenBal: parseFloat(d.frozenBal || "0"),
          usdValue: parseFloat(d.eqUsd || "0"),
        }))
        .sort((a: any, b: any) => b.usdValue - a.usdValue);
    } catch (err: any) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `余额查询失败: ${err.message}`,
      });
    }
  }),

  // 获取持仓
  getPositions: protectedProcedure.query(async ({ ctx }) => {
    requireJiang(ctx.user.username);
    try {
      const data = await okxPrivateRequest("/api/v5/account/positions");
      return data.map((p: any) => ({
        instId: p.instId,
        instType: p.instType,
        posSide: p.posSide,
        pos: parseFloat(p.pos),
        avgPx: parseFloat(p.avgPx),
        upl: parseFloat(p.upl),
        uplRatio: parseFloat(p.uplRatio),
        lever: parseFloat(p.lever),
        liqPx: p.liqPx ? parseFloat(p.liqPx) : null,
        markPx: parseFloat(p.markPx || "0"),
        margin: parseFloat(p.margin || "0"),
        ccy: p.ccy,
      }));
    } catch (err: any) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `持仓查询失败: ${err.message}`,
      });
    }
  }),

  // AI 对话（需要登录 + jiang 权限）
  chat: protectedProcedure
    .input(
      z.object({
        message: z.string().max(500),
        history: z.array(
          z.object({
            role: z.enum(["user", "assistant"]),
            content: z.string(),
          })
        ).max(20),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireJiang(ctx.user.username);

      // 获取实时行情作为上下文
      let marketContext = "";
      try {
        const tickers = await Promise.allSettled([
          okxPublicRequest("/api/v5/market/ticker?instId=BTC-USDT"),
          okxPublicRequest("/api/v5/market/ticker?instId=ETH-USDT"),
          okxPublicRequest("/api/v5/market/ticker?instId=SOL-USDT"),
        ]);

        const prices = tickers
          .map((r, i) => {
            const symbols = ["BTC", "ETH", "SOL"];
            if (r.status === "fulfilled") {
              const d = r.value[0];
              const last = parseFloat(d.last);
              const open24h = parseFloat(d.open24h);
              const change = open24h > 0 ? (((last - open24h) / open24h) * 100).toFixed(2) : "0";
              return `${symbols[i]}: $${last.toLocaleString()} (24h: ${change}%)`;
            }
            return null;
          })
          .filter(Boolean);

        marketContext = `\n\n当前实时行情（${new Date().toLocaleString("zh-CN")}）：\n${prices.join("\n")}`;
      } catch {}

      // 获取持仓作为上下文
      let positionContext = "";
      try {
        const positions = await okxPrivateRequest("/api/v5/account/positions");
        if (positions.length > 0) {
          const posStr = positions
            .map((p: any) => {
              const upl = parseFloat(p.upl);
              const uplSign = upl >= 0 ? "+" : "";
              return `${p.instId} ${p.posSide === "long" ? "多" : "空"} ${p.pos}张 均价${p.avgPx} 浮盈亏${uplSign}${upl.toFixed(2)}U`;
            })
            .join("\n");
          positionContext = `\n\n当前持仓：\n${posStr}`;
        }
      } catch {}

      const systemPrompt = `你是一个专业的加密货币交易助手，帮助用户分析行情、管理持仓和制定交易策略。
请用简洁专业的中文回答，提供有价值的分析和建议。
注意：所有交易建议仅供参考，不构成投资建议，用户需自行承担风险。${marketContext}${positionContext}`;

      const messages = [
        { role: "system" as const, content: systemPrompt },
        ...input.history.map((h) => ({
          role: h.role as "user" | "assistant",
          content: h.content,
        })),
        { role: "user" as const, content: input.message },
      ];

      const response = await invokeLLM({ featureKey: 'okx_trader_chat', messages });
      const reply = response.choices[0]?.message?.content || "抱歉，无法生成回复";

      return { reply };
    }),
});
