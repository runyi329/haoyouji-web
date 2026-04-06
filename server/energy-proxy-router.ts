import { Router } from "express";
import https from "https";

const router = Router();

// 通用代理函数：转发请求到币安期货API
function proxyBinance(path: string, res: any) {
  const url = `https://fapi.binance.com${path}`;
  https.get(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
    }
  }, (apiRes) => {
    let data = "";
    apiRes.on("data", (chunk) => { data += chunk; });
    apiRes.on("end", () => {
      try {
        const json = JSON.parse(data);
        res.json(json);
      } catch (e) {
        res.status(500).json({ error: "Parse error", raw: data.slice(0, 200) });
      }
    });
  }).on("error", (err) => {
    res.status(500).json({ error: err.message });
  });
}

// 标记价格（包含资金费率和下次结算时间）
router.get("/api/energy/premium/:symbol", (req, res) => {
  proxyBinance(`/fapi/v1/premiumIndex?symbol=${req.params.symbol}`, res);
});

// 24小时行情
router.get("/api/energy/ticker/:symbol", (req, res) => {
  proxyBinance(`/fapi/v1/ticker/24hr?symbol=${req.params.symbol}`, res);
});

// 未平仓合约量
router.get("/api/energy/openInterest/:symbol", (req, res) => {
  proxyBinance(`/fapi/v1/openInterest?symbol=${req.params.symbol}`, res);
});

// 资金费率历史
router.get("/api/energy/fundingRate/:symbol", (req, res) => {
  const limit = req.query.limit || "32";
  proxyBinance(`/fapi/v1/fundingRate?symbol=${req.params.symbol}&limit=${limit}`, res);
});

export default router;
