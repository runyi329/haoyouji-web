import express, { type Express } from "express";
import { acceptLogisticsCallback } from "./miban-logistics";

export function registerMibanLogisticsCallback(app: Express) {
  app.post("/api/miban/logistics/kuaidi100/callback",
    express.urlencoded({ limit: "128kb", extended: false, parameterLimit: 8 }),
    async (req, res) => {
      res.setHeader("Cache-Control", "no-store");
      const id = req.query.id;
      const param = req.body?.param;
      const sign = req.body?.sign;
      if (typeof id !== "string" || !/^[a-f0-9]{64}$/.test(id) ||
          typeof param !== "string" || Buffer.byteLength(param, "utf8") > 128 * 1024 ||
          typeof sign !== "string" || !/^[A-Fa-f0-9]{32}$/.test(sign)) {
        res.status(400).json({ result: false, returnCode: "400", message: "无效回调" });
        return;
      }
      try {
        const accepted = await acceptLogisticsCallback({ id, param, sign });
        if (!accepted) {
          res.status(403).json({ result: false, returnCode: "403", message: "回调验证未通过" });
          return;
        }
        // The service saves the valid update BEFORE returning true, including abort.
        // Carrier receipt is informational, not customer confirmation or wallet settlement.
        res.json({ result: true, returnCode: "200", message: "成功" });
      } catch {
        console.warn("[MibanLogistics] 回调暂未保存");
        res.status(500).json({ result: false, returnCode: "500", message: "暂未保存，请重试" });
      }
    });
}
