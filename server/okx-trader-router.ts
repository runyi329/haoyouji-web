/**
 * OKX 交易助手路由
 * 通过 okx-trade-cli 命令行工具调用 OKX API
 * API Key 存储在 ~/.okx/config.toml，不暴露给前端
 */
import { router, protectedProcedure, publicProcedure } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { exec } from "child_process";
import { promisify } from "util";
import { invokeLLM } from "./_core/llm";

const execAsync = promisify(exec);

// 执行 okx CLI 命令并返回 JSON 结果
async function runOkxCmd(args: string): Promise<any> {
  try {
    const { stdout, stderr } = await execAsync(`okx --json ${args}`, {
      timeout: 15000,
      env: { ...process.env, HOME: process.env.HOME || "/home/ubuntu" },
    });
    if (stderr && stderr.includes("Error")) {
      throw new Error(stderr.trim());
    }
    return JSON.parse(stdout.trim());
  } catch (err: any) {
    if (err.code === "ETIMEDOUT") {
      throw new TRPCError({ code: "TIMEOUT", message: "OKX API 请求超时" });
    }
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: err.message || "OKX API 调用失败",
    });
  }
}

// 只允许 jiang 用户访问的权限检查
function requireJiang(username: string) {
  if (username !== "jiang") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "仅限授权用户访问",
    });
  }
}

export const okxTraderRouter = router({
  // ===== 行情数据（公开，无需 API Key）=====
  // 获取单个币种行情
  getTicker: publicProcedure
    .input(z.object({ instId: z.string() })) // e.g. BTC-USDT
    .query(async ({ input }) => {
      try {
        const { stdout } = await execAsync(
          `okx --json market ticker ${input.instId}`,
          {
            timeout: 10000,
            env: { ...process.env, HOME: process.env.HOME || "/home/ubuntu" },
          }
        );
        const raw = JSON.parse(stdout.trim());
        const data = Array.isArray(raw) ? raw[0] : raw;
        return {
          instId: data.instId,
          last: parseFloat(data.last),
          open24h: parseFloat(data.open24h),
          high24h: parseFloat(data.high24h),
          low24h: parseFloat(data.low24h),
          vol24h: parseFloat(data.vol24h),
          change24h:
            data.open24h && data.last
              ? (
                  ((parseFloat(data.last) - parseFloat(data.open24h)) /
                    parseFloat(data.open24h)) *
                  100
                ).toFixed(2)
              : "0",
          ts: data.ts,
        };
      } catch (err: any) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `行情获取失败: ${err.message}`,
        });
      }
    }),

  // 批量获取多个币种行情
  getMultiTickers: publicProcedure
    .input(z.object({ instIds: z.array(z.string()) }))
    .query(async ({ input }) => {
      const results = await Promise.allSettled(
        input.instIds.map(async (instId) => {
          const { stdout } = await execAsync(
            `okx --json market ticker ${instId}`,
            {
              timeout: 10000,
              env: {
                ...process.env,
                HOME: process.env.HOME || "/home/ubuntu",
              },
            }
          );
          const raw = JSON.parse(stdout.trim());
          const data = Array.isArray(raw) ? raw[0] : raw;
          return {
            instId: data.instId,
            last: parseFloat(data.last),
            open24h: parseFloat(data.open24h),
            high24h: parseFloat(data.high24h),
            low24h: parseFloat(data.low24h),
            vol24h: parseFloat(data.vol24h),
            change24h:
              data.open24h && data.last
                ? (
                    ((parseFloat(data.last) - parseFloat(data.open24h)) /
                      parseFloat(data.open24h)) *
                    100
                  ).toFixed(2)
                : "0",
          };
        })
      );
      return results.map((r, i) =>
        r.status === "fulfilled"
          ? r.value
          : { instId: input.instIds[i], error: "获取失败" }
      );
    }),

  // ===== 账户数据（需要登录 + jiang 权限）=====
  // 获取账户余额
  getBalance: protectedProcedure.query(async ({ ctx }) => {
    requireJiang(ctx.user.username);
    const raw = await runOkxCmd("account balance");
    const data = Array.isArray(raw) ? raw[0] : raw;
    // 过滤出有余额的币种
    const details = data?.details || [];
    return details
      .filter((d: any) => parseFloat(d.eq) > 0.000001)
      .map((d: any) => ({
        ccy: d.ccy,
        eq: parseFloat(d.eq),
        eqUsd: parseFloat(d.eqUsd),
        availBal: parseFloat(d.availBal),
        frozenBal: parseFloat(d.frozenBal || "0"),
      }))
      .sort((a: any, b: any) => b.eqUsd - a.eqUsd);
  }),

  // 获取持仓信息
  getPositions: protectedProcedure.query(async ({ ctx }) => {
    requireJiang(ctx.user.username);
    const data = await runOkxCmd("account positions");
    return (data as any[]).map((p) => ({
      instId: p.instId,
      instType: p.instType,
      side: p.posSide,
      pos: parseFloat(p.pos),
      avgPx: parseFloat(p.avgPx),
      upl: parseFloat(p.upl),
      uplRatio: parseFloat(p.uplRatio || "0"),
      lever: parseFloat(p.lever),
      liqPx: p.liqPx ? parseFloat(p.liqPx) : null,
      margin: p.margin ? parseFloat(p.margin) : null,
    }));
  }),

  // ===== AI 交易助手对话（需要登录 + jiang 权限）=====
  chat: protectedProcedure
    .input(
      z.object({
        message: z.string().max(500),
        history: z
          .array(
            z.object({
              role: z.enum(["user", "assistant"]),
              content: z.string(),
            })
          )
          .optional()
          .default([]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireJiang(ctx.user.username);

      // 获取实时数据作为上下文
      let contextData = "";
      try {
        // 并行获取行情、余额、持仓
        const [btcTicker, ethTicker, balance, positions] = await Promise.allSettled([
          execAsync("okx --json market ticker BTC-USDT", {
            timeout: 8000,
            env: { ...process.env, HOME: process.env.HOME || "/home/ubuntu" },
          }),
          execAsync("okx --json market ticker ETH-USDT", {
            timeout: 8000,
            env: { ...process.env, HOME: process.env.HOME || "/home/ubuntu" },
          }),
          execAsync("okx --json account balance", {
            timeout: 8000,
            env: { ...process.env, HOME: process.env.HOME || "/home/ubuntu" },
          }),
          execAsync("okx --json account positions", {
            timeout: 8000,
            env: { ...process.env, HOME: process.env.HOME || "/home/ubuntu" },
          }),
        ]);

        const now = new Date().toLocaleString("zh-CN", {
          timeZone: "Asia/Shanghai",
        });
        contextData = `\n\n【实时数据 - ${now}】\n`;

        if (btcTicker.status === "fulfilled") {
          const d = JSON.parse(btcTicker.value.stdout.trim());
          const chg = d.open24h
            ? (
                ((parseFloat(d.last) - parseFloat(d.open24h)) /
                  parseFloat(d.open24h)) *
                100
              ).toFixed(2)
            : "0";
          contextData += `BTC价格: $${parseFloat(d.last).toLocaleString()} (24h: ${parseFloat(chg) >= 0 ? "+" : ""}${chg}%)\n`;
        }
        if (ethTicker.status === "fulfilled") {
          const d = JSON.parse(ethTicker.value.stdout.trim());
          const chg = d.open24h
            ? (
                ((parseFloat(d.last) - parseFloat(d.open24h)) /
                  parseFloat(d.open24h)) *
                100
              ).toFixed(2)
            : "0";
          contextData += `ETH价格: $${parseFloat(d.last).toLocaleString()} (24h: ${parseFloat(chg) >= 0 ? "+" : ""}${chg}%)\n`;
        }

        if (balance.status === "fulfilled") {
          const balData = JSON.parse(balance.value.stdout.trim());
          const details = balData[0]?.details || [];
          const mainAssets = details
            .filter((d: any) => parseFloat(d.eq) > 0.01)
            .sort((a: any, b: any) => parseFloat(b.eqUsd) - parseFloat(a.eqUsd))
            .slice(0, 5)
            .map((d: any) => `${d.ccy}: ${parseFloat(d.eq).toFixed(4)} (≈$${parseFloat(d.eqUsd).toFixed(2)})`)
            .join(", ");
          contextData += `账户余额: ${mainAssets}\n`;
        }

        if (positions.status === "fulfilled") {
          const posData = JSON.parse(positions.value.stdout.trim());
          if (posData.length > 0) {
            contextData += `当前持仓:\n`;
            posData.forEach((p: any) => {
              const upl = parseFloat(p.upl);
              contextData += `  ${p.instId} ${p.posSide === "long" ? "多" : "空"} ${p.pos}张 均价:${p.avgPx} 浮盈亏:${upl >= 0 ? "+" : ""}${upl.toFixed(2)}U 杠杆:${p.lever}x\n`;
            });
          } else {
            contextData += `当前持仓: 无\n`;
          }
        }
      } catch (e) {
        contextData = "\n\n【注意：实时数据获取部分失败，以下回答基于已有信息】\n";
      }

      const systemPrompt = `你是一个专业的加密货币交易助手，服务于OKX平台的专业投资者。
你的职责：
1. 解读实时行情数据，提供专业的市场分析
2. 分析账户持仓风险，给出仓位管理建议
3. 回答关于加密货币、合约交易、风险管理的专业问题
4. 提供交易策略建议（但不直接执行交易）

注意事项：
- 回答简洁专业，直接给出结论
- 涉及风险时要明确提示
- 不要过度乐观，要客观分析
- 使用中文回答${contextData}`;

      const messages = [
        ...input.history.map((h) => ({
          role: h.role as "user" | "assistant",
          content: h.content,
        })),
        { role: "user" as const, content: input.message },
      ];

      const response = await invokeLLM({
        messages: [{ role: "system", content: systemPrompt }, ...messages],
      });

      const answer =
        response.choices?.[0]?.message?.content || "抱歉，无法获取回答";
      return { answer };
    }),
});
