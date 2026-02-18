import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { getDb, getDbConnection } from "../db";

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

async function runMigrations() {
  try {
    const conn = await getDbConnection();
    if (!conn) {
      console.log('[迁移] 无法获取数据库连接，跳过迁移');
      return;
    }

    // 检查 user_profiles 表是否存在
    const [tables] = await conn.execute(
      "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_profiles'"
    ) as any[];

    if (!tables || tables.length === 0) {
      console.log('[迁移] user_profiles 表不存在，跳过列检查');
      return;
    }

    // 获取 user_profiles 表的所有列
    const [columns] = await conn.execute(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_profiles'"
    ) as any[];

    const existingColumns = new Set((columns as any[]).map((c: any) => c.COLUMN_NAME));
    console.log('[迁移] user_profiles 现有列:', Array.from(existingColumns).join(', '));

    // 需要添加的列及其定义
    const requiredColumns: { name: string; definition: string; after: string }[] = [
      { name: 'payment_method', definition: "ENUM('bank_card', 'digital_wallet', 'alipay', 'wechat')", after: 'verified_at' },
      { name: 'wallet_network', definition: 'VARCHAR(50)', after: 'bank_account_name' },
      { name: 'wallet_qr_code_url', definition: 'TEXT', after: 'digital_wallet_address' },
      { name: 'alipay_account_name', definition: 'VARCHAR(100)', after: 'alipay_account' },
      { name: 'alipay_qr_code_url', definition: 'TEXT', after: 'alipay_account_name' },
      { name: 'wechat_qr_code_url', definition: 'TEXT', after: 'alipay_qr_code_url' },
      { name: 'wechat_account_name', definition: 'VARCHAR(100)', after: 'wechat_qr_code_url' },
    ];

    let migrated = 0;
    for (const col of requiredColumns) {
      if (!existingColumns.has(col.name)) {
        try {
          const alterSql = `ALTER TABLE user_profiles ADD COLUMN \`${col.name}\` ${col.definition} AFTER \`${col.after}\``;
          console.log(`[迁移] 执行: ${alterSql}`);
          await conn.execute(alterSql);
          migrated++;
        } catch (err: any) {
          // 如果 AFTER 列不存在，尝试不指定位置
          if (err.code === 'ER_BAD_FIELD_ERROR') {
            try {
              const alterSql2 = `ALTER TABLE user_profiles ADD COLUMN \`${col.name}\` ${col.definition}`;
              console.log(`[迁移] 重试: ${alterSql2}`);
              await conn.execute(alterSql2);
              migrated++;
            } catch (err2) {
              console.error(`[迁移] 添加列 ${col.name} 失败:`, err2);
            }
          } else {
            console.error(`[迁移] 添加列 ${col.name} 失败:`, err);
          }
        }
      }
    }

    // 删除旧的 wechat_account 列（如果存在）
    if (existingColumns.has('wechat_account') && !existingColumns.has('wechat_account_name')) {
      try {
        await conn.execute('ALTER TABLE user_profiles DROP COLUMN `wechat_account`');
        console.log('[迁移] 已删除旧列 wechat_account');
      } catch (err) {
        console.error('[迁移] 删除 wechat_account 列失败:', err);
      }
    }

    if (migrated > 0) {
      console.log(`[迁移] 成功添加了 ${migrated} 个列到 user_profiles 表`);
    } else {
      console.log('[迁移] user_profiles 表结构已是最新');
    }
  } catch (error) {
    console.error('[迁移] 执行迁移失败:', error);
  }
}

async function startServer() {
  // 执行数据库迁移
  await runMigrations();
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
  // User profile management router
  const userProfileModule = await import('../user-profile-api.js');
  app.use('/api/user', userProfileModule.default);
  // Admin user profile router
  const adminUserProfileModule = await import('../admin-user-profile-api.js');
  app.use('/api/admin', adminUserProfileModule.default);
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
