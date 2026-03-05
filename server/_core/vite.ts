import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import { createServer as createViteServer } from "vite";
import viteConfig from "../../vite.config";

// 商家路径到 merchantCode 的映射
const MERCHANT_PATH_MAP: Record<string, string> = {
  '/wine': 'cx8618',
};

// 从数据库获取商家分享信息（用于服务端 OG meta 注入）
async function getMerchantMetaForPath(urlPath: string): Promise<{
  title: string;
  description: string;
  image: string;
  icon: string;
} | null> {
  try {
    // 匹配商家路径（支持 /wine 及其子路径 /wine/*）
    const basePath = '/' + urlPath.split('/').filter(Boolean)[0];
    const merchantCode = MERCHANT_PATH_MAP[basePath];
    if (!merchantCode) return null;

    const { getDb } = await import('../db');
    const { merchants } = await import('../../drizzle/schema');
    const { eq } = await import('drizzle-orm');
    const db = await getDb();
    if (!db) return null;

    const rows = await db.select().from(merchants).where(eq(merchants.merchantCode, merchantCode)).limit(1);
    if (!rows || rows.length === 0) return null;
    const m = rows[0] as any;

    const title = m.share_title || m.shopName || '脉动';
    const description = m.share_description || m.shopDescription || '';
    const image = m.share_cover_image || m.share_logo || m.shopLogoUrl || '';
    const icon = m.share_logo || m.shopLogoUrl || '';
    return { title, description, image, icon };
  } catch {
    return null;
  }
}

// 将 OG meta 标签注入到 HTML 的 <head> 中
function injectMetaTags(html: string, meta: {
  title: string;
  description: string;
  image: string;
  icon: string;
  url: string;
}): string {
  const metaTags = `
    <title>${escapeHtml(meta.title)}</title>
    <meta property="og:title" content="${escapeHtml(meta.title)}" />
    <meta property="og:description" content="${escapeHtml(meta.description)}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${escapeHtml(meta.url)}" />
    ${meta.image ? `<meta property="og:image" content="${escapeHtml(meta.image)}" />` : ''}
    ${meta.image ? `<meta property="og:image:width" content="400" />` : ''}
    ${meta.image ? `<meta property="og:image:height" content="400" />` : ''}
    <meta name="description" content="${escapeHtml(meta.description)}" />
    ${meta.icon ? `<link rel="apple-touch-icon" href="${escapeHtml(meta.icon)}" />` : ''}
    ${meta.icon ? `<link rel="icon" type="image/webp" href="${escapeHtml(meta.icon)}" />` : ''}
  `;
  // 在 </head> 前插入 meta 标签
  return html.replace('</head>', `${metaTags}</head>`);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath =
    process.env.NODE_ENV === "development"
      ? path.resolve(import.meta.dirname, "../..", "dist", "public")
      : path.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  app.use(express.static(distPath, {
    setHeaders: (res, filePath) => {
      // 设置正确的MIME类型
      if (filePath.endsWith('.js')) {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      } else if (filePath.endsWith('.mjs')) {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      } else if (filePath.endsWith('.css')) {
        res.setHeader('Content-Type', 'text/css; charset=utf-8');
      }
    }
  }));

  // fall through to index.html only for HTML navigation requests
  app.use("*", async (req, res) => {
    // 如果请求的是资源文件（JS/CSS/图片等），返回404而不是index.html
    const ext = path.extname(req.originalUrl);
    if (ext && ext !== '.html') {
      return res.status(404).send('Not Found');
    }

    // 禁止浏览器缓存HTML，解决Safari PWA模式下返回时显示旧页面的问题
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');

    try {
      let html = await fs.promises.readFile(path.resolve(distPath, "index.html"), "utf-8");

      // 尝试为商家页面注入动态 OG meta 标签（让微信分享显示商家自己的 Logo）
      const urlPath = req.originalUrl.split('?')[0];
      const merchantMeta = await getMerchantMetaForPath(urlPath);
      if (merchantMeta) {
        const protocol = req.headers['x-forwarded-proto'] || 'https';
        const host = req.headers['x-forwarded-host'] || req.headers.host || 'jiangyuchen.cn';
        const fullUrl = `${protocol}://${host}${urlPath}`;
        html = injectMetaTags(html, {
          ...merchantMeta,
          url: fullUrl,
        });
      }

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch {
      // 降级：直接发送文件
      res.sendFile(path.resolve(distPath, "index.html"));
    }
  });
}
