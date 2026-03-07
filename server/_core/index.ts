import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { getDb } from "../db";
import { startScanner } from "../blockchain-scanner";
import { ensureBeautyTables } from "../db-beauty-init";

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

async function initRedCubeProduct() {
  try {
    const { beautyBrands, beautyProducts, beautyProductCategories } = await import('../../drizzle/beauty-schema');
    const { eq } = await import('drizzle-orm');
    const db = await getDb();
    if (!db) return;

    // 检查商品是否已存在
    const existing = await db.select().from(beautyProducts)
      .where(eq(beautyProducts.name, '红立方光焕能舱'))
      .limit(1);
    if (existing.length > 0) return;

    // 确保品牌存在
    let brandId: number;
    const existingBrand = await db.select().from(beautyBrands)
      .where(eq(beautyBrands.name, 'IDEALIGHT'))
      .limit(1);
    if (existingBrand.length > 0) {
      brandId = existingBrand[0].id;
    } else {
      await db.insert(beautyBrands).values({
        name: 'IDEALIGHT',
        description: '上海佰时特健康科技有限公司旗下品牌，专注红光生物光疗设备研发，产品通过国家CMA计量认证与CNAS实验室认证。',
        logoUrl: null,
        bannerUrl: null,
        isActive: 1,
        sortOrder: 0,
      });
      const newBrand = await db.select().from(beautyBrands)
        .where(eq(beautyBrands.name, 'IDEALIGHT')).limit(1);
      brandId = newBrand[0].id;
    }

    // 确保分类存在
    let categoryId: number;
    const existingCat = await db.select().from(beautyProductCategories)
      .where(eq(beautyProductCategories.name, '健康仪器'))
      .limit(1);
    if (existingCat.length > 0) {
      categoryId = existingCat[0].id;
    } else {
      await db.insert(beautyProductCategories).values({
        name: '健康仪器',
        type: 'health',
        isActive: 1,
        sortOrder: 0,
      });
      const newCat = await db.select().from(beautyProductCategories)
        .where(eq(beautyProductCategories.name, '健康仪器')).limit(1);
      categoryId = newCat[0].id;
    }

    // 插入商品
    const description = `红立方光焕能舱 | 给身体充能

【产品亮点】
精准黄金波长 · 超大能量密度 · 网络远程监控 · 智能恒温保护
定时时间控制 · 两档速度选择 · 智能语音提示 · 独立新风系统

【六大核心功效】
1. 焕活身体活力，提升精气神——温和唤醒身体能量，让人更有精神、不易疲惫
2. 促进身体循环，周身舒畅——助力气血顺畅运行，改善身体发沉、手脚易凉的状态
3. 温和排浊，身体更轻松——微微出汗，帮助代谢多余湿气与浊物，体感轻盈舒适
4. 舒缓身心，提升睡眠质量——放松神经，帮助睡得更安稳，晨起更有活力
5. 焕亮肌肤状态，透出好气色——温和养护肌肤，让肤色更透亮、肤质更细腻
6. 调理身体状态，体质更稳定——长期坚持，帮助身体保持良好状态，日常更有活力

【科学原理】
红光波长630–680nm，属于生物活性光，可安全穿透皮下8–10mm，激活细胞线粒体产生ATP（细胞能量），促进一氧化氮（NO）释放，改善微循环。

【产品规格】
型号：RQ-22 | 品牌：IDEALIGHT | 生产商：上海佰时特健康科技有限公司
检测标准：GB 4706.1-2005 | 检测结论：合格品 | 报告编号：W02414500335

【认证资质】CMA计量认证 · CNAS实验室认证 · 国际互认资质`;

    await db.insert(beautyProducts).values({
      name: '红立方光焕能舱',
      description,
      price: '30000.00',
      imageUrl: 'https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/redcube-hero_f052e330.jpg',
      brandId,
      categoryId,
      specification: '型号 RQ-22',
      stock: 99,
      isActive: 1,
      sortOrder: 0,
    });
    console.log('[初始化] 红立方光焕能舱商品已创建');
  } catch (error) {
    console.error('[初始化] 红立方商品创建失败:', error instanceof Error ? error.message : error);
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
  // 确保奢贝美容院数据库表存在
  await ensureBeautyTables();
  // 初始化红立方商品
  await initRedCubeProduct();
  
  // 初始化数据库（确保意见本等功能所需字段存在）
  const { initDatabase } = await import('../db-init');
  await initDatabase();
  
  // 添加管理员为企业成员
  const { addAdminAsMember } = await import('../add-admin-member');
  await addAdminAsMember();
  
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
  // 支付宝 WAP 支付路由
  const alipayRouterModule = await import('../alipay-router.js');
  app.use(alipayRouterModule.default);

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
    
    // 启动区块链扫描器（收款地址从数据库读取，无需环境变量）
    startScanner();

    // ─── 内嵌定时备份任务（每天北京时间凌晨 2:00 执行）───
    // 北京时间 = UTC+8，凌晨 2:00 BJT = UTC 18:00（前一天）
    // 策略：每分钟检查一次当前 UTC 时间是否为 18:00（即 BJT 02:00），
    // 并用一个标志位保证同一天只触发一次。
    let lastBackupDate = '';
    setInterval(async () => {
      try {
        const now = new Date();
        // UTC 18:00 = 北京时间 02:00
        if (now.getUTCHours() === 18 && now.getUTCMinutes() === 0) {
          const todayKey = now.toISOString().slice(0, 10); // 'YYYY-MM-DD'
          if (lastBackupDate !== todayKey) {
            lastBackupDate = todayKey;
            console.log(`[定时备份] 触发每日备份任务 (BJT 02:00) - ${todayKey}`);
            const { checkAndExecuteBackups } = await import('../backup-service');
            await checkAndExecuteBackups();
            console.log(`[定时备份] 备份任务完成 - ${todayKey}`);
          }
        }
      } catch (err) {
        console.error('[定时备份] 执行失败:', err);
      }
    }, 60 * 1000); // 每分钟检查一次
    console.log('[定时备份] 已注册，每天北京时间凌晨 02:00 自动执行');
    // ──────────────────────────────────────────────────────
  });
}

startServer().catch(console.error);
