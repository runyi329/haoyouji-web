import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { getDb } from "../db";

async function initFieldCategories() {
  try {
    const { contactFieldCategories } = await import('../../drizzle/schema');
    const db = await getDb();
    if (!db) return;
    
    const categories = [
      '星座', '生日', '血型', '属相', '年龄', '身高', '鞋码', '民族',
      '饮食', '习惯', '健康', '性格', '品牌', '娱乐',
      '公司', '行业', '类型', '职业', '征信', '财务', '法务', '劳务',
      '税务', '人事', '公户', '私户',
      '电话', '微信', '邮箱', '地址'
    ];
    
    const existing = await db.select().from(contactFieldCategories);
    const existingNames = new Set(existing.map(c => c.name));
    
    // 使用管理员ID（28）
    const adminUserId = 28;
    
    let created = 0;
    for (const name of categories) {
      if (!existingNames.has(name)) {
        await db.insert(contactFieldCategories).values({
          name,
          icon: '',
          parentCategoryId: null,
          parentUserId: adminUserId,
          createdAt: new Date(),
        });
        created++;
      }
    }
    
    if (created > 0) {
      console.log(`[初始化] 创建了 ${created} 个字段分类`);
    }
  } catch (error) {
    console.error('[初始化] 字段分类创建失败:', error);
  }
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  // 初始化字段分类
  await initFieldCategories();
  
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // AI search router
  const aiSearchModule = await import('../ai-search.js');
  app.use(aiSearchModule.default);
  // AI prompts management router
  const aiPromptsModule = await import('../ai-prompts.js');
  app.use(aiPromptsModule.default);
  // Company reports management router
  const companyReportsModule = await import('../company-reports.js');
  app.use(companyReportsModule.default);
  // Ledger export router
  const ledgerExportModule = await import('../ledger-export.js');
  app.use(ledgerExportModule.default);
  // Valuation management routers
  const valuationModule = await import('../valuation-api.js');
  app.use('/api/valuation', valuationModule.default);
  const adminValuationModule = await import('../admin-valuation-api.js');
  app.use('/api/admin/valuation', adminValuationModule.default);

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
