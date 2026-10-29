import { Router, type Request, type Response } from "express";

const router = Router();

const COS_EXPORT_IMAGE_HOST =
  "haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com";
const ALLOWED_IMAGE_PATH_PREFIXES = [
  "/miban-shebei/",
  "/miban-pear/",
  "/assets/miban/",
] as const;
const ALLOWED_CONTENT_TYPES = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 10_000;

function getAllowedImageUrl(value: unknown): URL | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 2_048)
    return null;

  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.hostname !== COS_EXPORT_IMAGE_HOST ||
      url.port ||
      url.username ||
      url.password ||
      !ALLOWED_IMAGE_PATH_PREFIXES.some(prefix =>
        url.pathname.startsWith(prefix)
      )
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

async function readImageBody(response: globalThis.Response): Promise<Buffer> {
  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_IMAGE_BYTES) {
    throw new Error("image-too-large");
  }
  if (!response.body) throw new Error("missing-image-body");

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > MAX_IMAGE_BYTES) {
        await reader.cancel();
        throw new Error("image-too-large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map(chunk => Buffer.from(chunk)));
}

/**
 * 订单 PNG 生成专用的同源图片读取端点。
 * 仅允许本项目的公开 COS 商品图固定目录，不跟随重定向、不接受任意 URL，
 * 因而不会成为开放代理或 SSRF 入口。
 */
router.get("/api/miban/export-image", async (req: Request, res: Response) => {
  const source = Array.isArray(req.query.src)
    ? req.query.src[0]
    : req.query.src;
  const url = getAllowedImageUrl(source);
  if (!url) return res.status(400).json({ error: "invalid image source" });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  const abortOnDisconnect = () => controller.abort();
  req.once("aborted", abortOnDisconnect);

  try {
    const upstream = await fetch(url, {
      signal: controller.signal,
      redirect: "manual",
      headers: {
        Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif;q=0.9",
      },
    });
    if (!upstream.ok) {
      return res.status(502).json({ error: "image unavailable" });
    }

    const contentType = (upstream.headers.get("content-type") || "")
      .split(";", 1)[0]
      .trim()
      .toLowerCase();
    if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
      return res.status(415).json({ error: "unsupported image type" });
    }

    const body = await readImageBody(upstream);
    res.set({
      "Content-Type": contentType,
      "Content-Length": String(body.byteLength),
      "Cache-Control": "public, max-age=86400",
      "Cross-Origin-Resource-Policy": "same-origin",
      "X-Content-Type-Options": "nosniff",
    });
    return res.status(200).end(body);
  } catch (error) {
    if (controller.signal.aborted) {
      return res.status(504).json({ error: "image request timed out" });
    }
    return res.status(502).json({ error: "image unavailable" });
  } finally {
    clearTimeout(timeout);
    req.off("aborted", abortOnDisconnect);
  }
});

export default router;
