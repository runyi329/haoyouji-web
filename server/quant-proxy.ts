/**
 * 量化回测代理路由
 * 将 /api/quant/* 请求转发到本地 FastAPI 服务（端口 8001）
 */
import express from "express";

const router = express.Router();
const QUANT_BASE = "http://localhost:8001";

async function proxyRequest(
  req: express.Request,
  res: express.Response,
  path: string,
  method: "GET" | "POST" = "POST"
) {
  try {
    const url = `${QUANT_BASE}${path}`;
    const fetchOptions: RequestInit = {
      method,
      headers: { "Content-Type": "application/json" },
    };
    if (method === "POST" && req.body) {
      fetchOptions.body = JSON.stringify(req.body);
    }
    const upstream = await fetch(url, fetchOptions);
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err: any) {
    res.status(503).json({ detail: `量化服务暂不可用: ${err.message}` });
  }
}

// 健康检查
router.get("/api/quant/health", async (req, res) => {
  await proxyRequest(req, res, "/health", "GET");
});

// 自然语言策略解析
router.post("/api/quant/parse-strategy", async (req, res) => {
  await proxyRequest(req, res, "/parse-strategy");
});

// 执行回测
router.post("/api/quant/backtest", async (req, res) => {
  await proxyRequest(req, res, "/backtest");
});

// 导出 PDF
router.post("/api/quant/export-pdf", async (req, res) => {
  await proxyRequest(req, res, "/export-pdf");
});

export default router;
