import type { Express } from "express";
import { timingSafeEqual } from "node:crypto";

const COOKIE = "miban_logistics_preview";
function equal(left: string, right: string) {
  const a = Buffer.from(left), b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Explicit sandbox-only preview protection, never a production authentication method. */
export function registerMibanLogisticsPreviewGuard(app: Express) {
  const token = process.env.MIBAN_PREVIEW_ACCESS_TOKEN;
  if (process.env.NODE_ENV === "production" || process.env.FAST_PREVIEW !== "true" || !token) return;
  app.use((req, res, next) => {
    const queryToken = typeof req.query.preview === "string" ? req.query.preview : "";
    const cookie = (req.headers.cookie ?? "").split(";").map(value => value.trim()).find(value => value.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1) ?? "";
    if (!equal(queryToken, token) && !equal(cookie, token)) {
      res.status(403).send("临时预览需要专用链接，请使用本任务提供的完整地址。");
      return;
    }
    if (queryToken) res.cookie(COOKIE, token, { httpOnly: true, sameSite: "lax", maxAge: 6 * 60 * 60 * 1000, secure: req.headers["x-forwarded-proto"] === "https" });
    res.setHeader("Referrer-Policy", "no-referrer");
    // The only allowed POST contacts the logistics provider; no orders/wallets are written.
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && req.path !== "/api/trpc/order.logisticsTest") {
      res.status(403).json({ error: { json: { message: "物流预览不允许修改正式业务数据", code: -32003, data: { code: "FORBIDDEN", httpStatus: 403 } } } });
      return;
    }
    next();
  });
}
