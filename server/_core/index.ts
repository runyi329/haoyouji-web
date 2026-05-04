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
import { startTierScanner } from "../af-tier-scanner";
import { startPriceScanner } from "../price-scanner";
import { startFunderScanner } from "../funder-price-scanner";
import { startEnergyPriceScanner } from "../energy-price-scanner";
import { smsService } from "../sms-service";
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
      imageUrl: 'https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/redcube-hero_f052e330.webp',
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

async function initAgSyncSources() {
  try {
    const { getDbConnection } = await import('../db');
    const conn = await getDbConnection();
    if (!conn) return;

    // 固定使用 54 号账本（AG 图片提示词账本）
    const AG_LEDGER_ID = 54;
    console.log(`[AG初始化] AG 账本 ID: ${AG_LEDGER_ID}`);

    // 预置数据源列表
    const presetSources = [
      {
        name: 'OpenNana',
        api_url: 'https://api.opennana.com/api/prompts',
        model_name: 'flux',
        sync_rule: '增量同步策略：API按ID降序返回数据，每次同步从第1页开始，遇到已存在的ID即停止。通常只需拉取1-2页即可获取所有新内容，避免重复下载全量数据。图片自动上传至腾讯云COS存储。',
      },
      {
        name: 'aiart.pics',
        api_url: 'https://aiart.pics/api/prompts',
        model_name: 'nanoBanana-Pro',
        sync_rule: '增量同步策略：API使用offset分页（limit=20&offset=0），按publishedAt降序返回数据。每次同步从第1页开始，通过imageKey中的aiartpics_{id}_前缀判断是否已存在，遇到已存在的记录即停止。图片CDN地址为https://img1.aiart.pics/{path}，提示词在详情接口的prompts数组中，支持中文标题和标签。',
      },
    ];

    for (const source of presetSources) {
      const [existRows] = await (conn as any).execute(
        'SELECT id, ledger_id FROM ag_sync_sources WHERE name = ? LIMIT 1',
        [source.name]
      );
      if ((existRows as any[]).length === 0) {
        // 不存在则插入
        await (conn as any).execute(
          'INSERT INTO ag_sync_sources (ledger_id, name, api_url, model_name, sync_rule, status, last_max_id, total_synced) VALUES (?, ?, ?, ?, ?, \'active\', 0, 0)',
          [AG_LEDGER_ID, source.name, source.api_url, source.model_name, source.sync_rule]
        );
        console.log(`[AG初始化] 数据源「${source.name}」已创建`);
      } else {
        // 已存在：如果 ledger_id 不对则修正
        const existingLedgerId = (existRows as any[])[0].ledger_id;
        if (existingLedgerId !== AG_LEDGER_ID) {
          await (conn as any).execute(
            'UPDATE ag_sync_sources SET ledger_id = ? WHERE name = ?',
            [AG_LEDGER_ID, source.name]
          );
          console.log(`[AG初始化] 数据源「${source.name}」ledger_id 已从 ${existingLedgerId} 修正为 ${AG_LEDGER_ID}`);
        } else {
          console.log(`[AG初始化] 数据源「${source.name}」已存在且 ledger_id 正确，跳过`);
        }
      }
    }
    console.log('[AG初始化] ✅ 数据源初始化完成');
  } catch (error) {
    console.error('[AG初始化] 数据源初始化失败:', error instanceof Error ? error.message : error);
  }
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

  // 初始化 AG 同步数据源（确保 OpenNana 和 aiart.pics 记录存在）
  await initAgSyncSources();
  
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // 前端错误上报接口
  app.post('/api/log-client-error', (req, res) => {
    const { message, stack, componentStack, url, userAgent, timestamp } = req.body || {};
    console.error('[前端错误]', JSON.stringify({
      message: message?.substring(0, 300),
      stack: stack?.substring(0, 500),
      componentStack: componentStack?.substring(0, 500),
      url,
      timestamp,
    }, null, 2));
    res.json({ ok: true });
  });

  // 临时调试端点：查询59号账本equity_shares和ledger_members数据
  app.get('/api/debug/ledger59', async (_req: any, res: any) => {
    try {
      const { getDbConnection } = await import('../db.js');
      const db = await getDbConnection();
      if (!db) return res.json({ error: 'DB连接失败' });
      const [shares] = await (db as any).execute(
        'SELECT es.id, es.userId, es.shareType, es.shareCount, es.grantDate, u.name as userName FROM equity_shares es LEFT JOIN users u ON u.id = es.userId WHERE es.ledgerId=59 ORDER BY es.id'
      ) as any;
      const [members] = await (db as any).execute(
        'SELECT lm.userId, lm.role, u.name as userName FROM ledger_members lm LEFT JOIN users u ON u.id = lm.userId WHERE lm.ledgerId=59'
      ) as any;
      res.json({ shares, members, sharesCount: (shares as any[]).length, membersCount: (members as any[]).length });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
  // 临时调试端点：查询刘丽凡在59号账本的股权数据
  app.get('/api/debug/lilifan59', async (_req: any, res: any) => {
    try {
      const { getDbConnection } = await import('../db.js');
      const db = await getDbConnection();
      if (!db) return res.json({ error: 'DB连接失败' });
      // 找刘丽凡userId
      const [userRows] = await (db as any).execute(
        "SELECT id, username, nickname FROM users WHERE nickname LIKE '%刘丽凡%' OR username LIKE '%刘丽凡%' LIMIT 5"
      ) as any;
      const uid = userRows?.[0]?.id;
      if (!uid) return res.json({ error: '未找到刘丽凡用户', userRows });
      // ledger_members
      const [members] = await (db as any).execute(
        'SELECT * FROM ledger_members WHERE ledgerId=59 AND userId=?', [uid]
      ) as any;
      // equity_shares
      const [shares] = await (db as any).execute(
        'SELECT id, ledgerId, userId, shareType, shareCount, resourceWeight, capitalWeight, eventType, eventDate, createdAt FROM equity_shares WHERE ledgerId=59 AND userId=? ORDER BY createdAt DESC', [uid]
      ) as any;
      // equity_transfers
      const [transfers] = await (db as any).execute(
        'SELECT id, ledgerId, fromUserId, toUserId, fromShareCount, toShareCount, status, createdAt FROM equity_transfers WHERE ledgerId=59 AND (fromUserId=? OR toUserId=?) ORDER BY createdAt DESC', [uid, uid]
      ) as any;
      res.json({ uid, userInfo: userRows[0], members, shares, transfers });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 临时调试端点：查询52号账本动态消息数据
  app.get('/api/debug/ledger52', async (_req: any, res: any) => {
    try {
      const { getDbConnection } = await import('../db.js');
      const db = await getDbConnection();
      if (!db) return res.json({ error: 'DB连接失败' });
      // 查52号账本成员
      const [memberRows] = await (db as any).execute(
        'SELECT lm.userId, u.name, u.username FROM ledger_members lm LEFT JOIN users u ON u.id=lm.userId WHERE lm.ledgerId=52'
      ) as any;
      const memberIds = (memberRows as any[]).map((r: any) => r.userId);
      // 查充值记录
      let rechargeRows: any[] = [];
      if (memberIds.length > 0) {
        const ph = memberIds.map(() => '?').join(',');
        const [rows] = await (db as any).execute(
          `SELECT ro.id, ro.user_id, ro.amount, ro.currency, ro.status, ro.completed_at, ro.ledger_id, u.name, u.username FROM recharge_orders ro LEFT JOIN users u ON u.id=ro.user_id WHERE ro.user_id IN (${ph}) ORDER BY ro.completed_at DESC LIMIT 5`,
          memberIds
        ) as any;
        rechargeRows = rows;
      }
      // 查af_orders
      const [orderRows] = await (db as any).execute(
        'SELECT o.id, o.user_id, o.coin, o.side, o.amount, o.status, o.updated_at, u.name, u.username FROM af_orders o LEFT JOIN users u ON u.id=o.user_id WHERE o.ledger_id=52 ORDER BY o.updated_at DESC LIMIT 5'
      ) as any;
      res.json({ members: memberRows, memberCount: memberIds.length, memberIds, rechargeRows, orderRows });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 临时调试端点：查询equity_weights表数据
  app.get('/api/debug/equity-weights', async (_req: any, res: any) => {
    try {
      const { getDbConnection } = await import('../db.js');
      const db = await getDbConnection();
      if (!db) return res.json({ error: 'DB连接失败' });
      const [weights] = await (db as any).execute(
        'SELECT ew.user_id, ew.resource_weight, ew.capital_weight, u.name FROM equity_weights ew LEFT JOIN users u ON u.id = ew.user_id ORDER BY ew.user_id'
      ) as any;
      const [allUsers] = await (db as any).execute(
        'SELECT id, name FROM users ORDER BY id LIMIT 50'
      ) as any;
      res.json({ weights, allUsers, weightsCount: (weights as any[]).length });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // 临时调试端点：查询推荐关系原始数据（排查完成后删除）
  app.get('/api/debug/referrals/:userId', async (req, res) => {
    try {
      const { getDbConnection } = await import('../db.js');
      const db = await getDbConnection();
      if (!db) return res.json({ error: 'DB连接失败' });
      const userId = Number(req.params.userId);
      // 查该userId在users表的信息
      const [[userRow]] = await (db as any).execute('SELECT id, name, username, invited_by_user_id FROM users WHERE id = ? LIMIT 1', [userId]) as any;
      // 查该userId对应的contacts记录（linkedUserId字段）
      const [selfContacts] = await (db as any).execute('SELECT id, parentUserId, name, linkedUserId, referrerId FROM contacts WHERE linkedUserId = ? LIMIT 20', [userId]) as any;
      const selfIds = (selfContacts as any[]).map((c: any) => c.id);
      // 查referrerId指向这些contactId的记录
      let byReferrerId: any[] = [];
      if (selfIds.length > 0) {
        const ph = selfIds.map(() => '?').join(',');
        const [r] = await (db as any).execute(`SELECT id, parentUserId, name, referrerId, linkedUserId FROM contacts WHERE referrerId IN (${ph}) LIMIT 30`, selfIds) as any;
        byReferrerId = r as any[];
      }
      // 查users.invited_by_user_id = userId的用户
      const [invitedUsers] = await (db as any).execute('SELECT id, name, username, invited_by_user_id FROM users WHERE invited_by_user_id = ? LIMIT 30', [userId]) as any;
      // 全局统计：查看推荐关系数据到底存在哪里
      const [[globalStats]] = await (db as any).execute(
        `SELECT 
          (SELECT COUNT(*) FROM contacts WHERE referrerId IS NOT NULL AND referrerId != 0) AS contactsWithReferrer,
          (SELECT COUNT(*) FROM users WHERE invited_by_user_id IS NOT NULL AND invited_by_user_id != 0) AS usersWithInviter,
          (SELECT COUNT(*) FROM referral_approvals) AS referralApprovalsTotal
        `
      ) as any;
      // 查contacts表中referrerId不为空的前5条样本
      const [sampleReferrers] = await (db as any).execute(
        'SELECT id, parentUserId, name, referrerId, linkedUserId FROM contacts WHERE referrerId IS NOT NULL AND referrerId != 0 LIMIT 5'
      ) as any;
      // 查users表中invited_by_user_id不为空的前5条样本
      const [sampleInvited] = await (db as any).execute(
        'SELECT id, name, username, invited_by_user_id FROM users WHERE invited_by_user_id IS NOT NULL AND invited_by_user_id != 0 LIMIT 5'
      ) as any;
      // 直接用getMemberStats同款SQL查询，对比两个接口的差异
      const [[memberStatsDirect]] = await (db as any).execute(
        'SELECT COUNT(*) as cnt FROM users WHERE invited_by_user_id = ?',
        [userId]
      ) as any;
      // 查询这些被邀请的用户的完整信息
      const [invitedByDirect] = await (db as any).execute(
        'SELECT id, name, username, avatar, invited_by_user_id FROM users WHERE invited_by_user_id = ? LIMIT 20',
        [userId]
      ) as any;
      res.json({ userId, userRow, selfContacts, selfIds, byReferrerId, invitedUsers, globalStats, sampleReferrers, sampleInvited, memberStatsDirect, invitedByDirect });
    } catch (e: any) {
      res.json({ error: e.message });
    }
  });

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
  // 食物热量扫描路由
  const foodCalorieModule = await import('../food-calorie-router.js');
  app.use(foodCalorieModule.default);
  const energyProxyModule = await import('../energy-proxy-router.js');
  app.use(energyProxyModule.default);
  // 黄金行情路由（Yahoo Finance）
  const goldTrackerModule = await import('../gold-tracker-router.js');
  app.use(goldTrackerModule.default);

  // 内部数字币数据补全接口（仅允许本机调用）
  app.post('/api/internal/sync-crypto', async (req: any, res: any) => {
    const ip = req.ip || req.socket?.remoteAddress || '';
    if (!ip.includes('127.0.0.1') && !ip.includes('::1') && ip !== 'localhost') {
      return res.status(403).json({ error: '仅允许本机调用' });
    }
    try {
      const { syncLatestFromBinance } = await import('../db-crypto.js');
      const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
      const results: any[] = [];
      for (const sym of symbols) {
        try {
          const r = await syncLatestFromBinance(sym);
          results.push({ symbol: sym, added: r.added, latestDate: r.latestDate });
          console.log(`[内部补全] ${sym} 新增 ${r.added} 条，最新日期: ${r.latestDate}`);
        } catch (e: any) {
          results.push({ symbol: sym, error: e.message });
          console.error(`[内部补全] ${sym} 失败:`, e.message);
        }
      }
      return res.json({ success: true, results });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

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

  server.listen(port, async () => {
    console.log(`Server running on http://localhost:${port}/`);
    // 部署成功后发送短信通知（已关闭）
    // const adminPhone = process.env.ADMIN_PHONE || "13127919173";
    // if (adminPhone) {
    //   smsService.sendCustomMessage(adminPhone, process.env.TENCENT_SMS_TEMPLATE_ID || "2623560", []).then(() => {
    //     console.log("[SMS] 部署通知短信已发送至", adminPhone);
    //   }).catch((err: any) => {
    //     console.warn("[SMS] 部署通知短信发送失败:", err.message);
    //   });
    // }
    
    // 启动区块链扫描器（收款地址从数据库读取，无需环境变量）
    startScanner();

    // 启动无损合约收益权档位扫描器（每4小时扫描一次）
    startTierScanner();

    // 启动实时价格扫描器（每60秒刷新 BTC/ETH/SOL 现货价格）
    startPriceScanner();

    // 启动资金方订单收益权扫描器（每4小时扫描一次，对齐北京时间整点）
    startFunderScanner();

    // 启动能源价格扫描器（每5分钟从 Yahoo Finance 更新石油/天然气价格）
    startEnergyPriceScanner();

    // 启动股票日线数据定时扫描器（每个交易日 BJT 15:30 自动增量写入 ts_daily）
    const { startStockDailyScanner } = await import('../stock-daily-scanner');
    startStockDailyScanner();

    // 启动港股日线数据定时扫描器（每个港股交易日 BJT 16:30 首触，无数据则每小时重试至 21:00）
    const { startHkStockDailyScanner } = await import('../hk-stock-daily-scanner');
    startHkStockDailyScanner();

    // ─── 内嵌定时备份任务（每天北京时间凌晨 2:00 精确触发）───
    const scheduleBackup = () => {
      // 计算距离下次 BJT 02:00 的毫秒数
      const now = new Date();
      const bjtNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
      const target = new Date(Date.UTC(
        bjtNow.getUTCFullYear(), bjtNow.getUTCMonth(), bjtNow.getUTCDate(),
        2 - 8, 0, 0, 0  // BJT 02:00 = UTC 18:00 前一天
      ));
      if (target.getTime() <= now.getTime()) target.setUTCDate(target.getUTCDate() + 1);
      const ms = target.getTime() - now.getTime();
      const nextStr = target.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
      console.log(`[定时备份] 下次触发时间: ${nextStr} (BJT 02:00)`);
      setTimeout(async () => {
        try {
          const dateKey = new Date().toISOString().slice(0, 10);
          console.log(`[定时备份] 触发每日备份任务 (BJT 02:00) - ${dateKey}`);
          const { checkAndExecuteBackups } = await import('../backup-service');
          await checkAndExecuteBackups();
          console.log(`[定时备份] 备份任务完成 - ${dateKey}`);
        } catch (err) {
          console.error('[定时备份] 执行失败:', err);
        } finally {
          scheduleBackup(); // 无论成败都设置下一次
        }
      }, ms);
    };
    scheduleBackup();
    console.log('[定时备份] 已注册，每天北京时间凌晨 02:00 精确触发一次');
    // ──────────────────────────────────────────────────────

    // ─── 竞猜每日结算定时任务（每天北京时间 00:01 精确触发）───
    const scheduleSettle = () => {
      const now = new Date();
      const bjtNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
      // 目标：BJT 00:01 = UTC 16:01 前一天
      const target = new Date(Date.UTC(
        bjtNow.getUTCFullYear(), bjtNow.getUTCMonth(), bjtNow.getUTCDate(),
        0 - 8, 1, 0, 0  // BJT 00:01 = UTC 16:01 前一天
      ));
      if (target.getTime() <= now.getTime()) target.setUTCDate(target.getUTCDate() + 1);
      const ms = target.getTime() - now.getTime();
      const nextStr = target.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
      console.log(`[竞猜结算] 下次触发时间: ${nextStr} (BJT 00:01)`);
      setTimeout(async () => {
        try {
          const dateKey = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
          console.log(`[竞猜结算] 触发每日结算任务 (BJT 00:01) - 结算日期: ${dateKey}`);
          const { settleDailyBets } = await import('../prediction-router');
          const result = await settleDailyBets();
          console.log(`[竞猜结算] 完成: 结算${result.settled}单，中奖${result.won}单，派奖${result.totalPayout.toFixed(2)}U`);
        } catch (err) {
          console.error('[竞猜结算] 执行失败:', err);
        } finally {
          scheduleSettle(); // 无论成败都设置下一次
        }
      }, ms);
    };
    scheduleSettle();
    console.log('[竞猜结算] 已注册，每天北京时间 00:01 精确触发一次');
    // ──────────────────────────────────────────────────────

    // ─── 数字币（BTC/ETH）：每日 UTC 00:10 自动拉取最新日线数据 ─────────────────
    const CRYPTO_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];

    const scheduleCryptoSync = () => {
      const now = new Date();
      const { syncLatestFromBinance } = require('../db-crypto');

      // 每天 UTC 00:10 触发（Binance 日线 UTC 00:00 收盘）
      const target = new Date(Date.UTC(
        now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
        0, 10, 0, 0
      ));
      if (target.getTime() <= now.getTime()) target.setUTCDate(target.getUTCDate() + 1);
      const ms = target.getTime() - now.getTime();
      const nextStr = target.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
      console.log(`[数字币同步] 下次触发时间: ${nextStr}`);

      setTimeout(async () => {
        try {
          for (const sym of CRYPTO_SYMBOLS) {
            try {
              const r = await syncLatestFromBinance(sym);
              console.log(`[数字币同步] ${sym} 新增 ${r.added} 条，最新日期 ${r.latestDate}`);
            } catch (e: any) {
              console.error(`[数字币同步] ${sym} 拉取失败:`, e.message);
            }
          }
        } finally {
          scheduleCryptoSync();
        }
      }, ms);
    };
    scheduleCryptoSync();
    console.log('[数字币同步] 已注册，每天 UTC 00:10 自动拉取 BTC/ETH 日线数据');

    // 启动时立即补齐所有缺失数据（数字币 + 美股）
    setTimeout(async () => {
      const { syncLatestFromBinance, syncStocksFromTushare } = require('../db-crypto');
      console.log('[启动补齐] 开始补齐所有标的缺失数据...');
      // 数字币：从 Binance 拉取
      for (const sym of CRYPTO_SYMBOLS) {
        try {
          const r = await syncLatestFromBinance(sym);
          console.log(`[启动补齐] ${sym} 新增 ${r.added} 条，最新日期 ${r.latestDate}`);
        } catch (e: any) {
          console.error(`[启动补齐] ${sym} 失败:`, e.message);
        }
      }
      // 美股：用 Tushare us_daily 按日期批量拉取（一次调用拿所有股票当天数据）
      try {
        const r = await syncStocksFromTushare();
        console.log(`[启动补齐] 美股七姐妹 共新增 ${r.added} 条，处理日期: ${r.dates.join(', ')}`);
      } catch (e: any) {
        console.error('[启动补齐] 美股 Tushare 失败:', e.message);
      }
      console.log('[启动补齐] 全部完成');
    }, 5000); // 服务器启动5秒后执行，避免启动期间资源竞争
    // ──────────────────────────────────────────────────────

    // ─── 美股七姐妹：每小时检查 + 每日数据拉取 + 结算定时任务 ────────────────────────
    // 改为每小时检查一次（而非精确到某时刻的 setTimeout），确保服务器重启后最多1小时内补齐数据
    // 美股收盘时间：夏令时 BJT 04:00，冬令时 BJT 05:00
    const US_STOCKS = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'TSLA', 'META'];

    const runUSStockSync = async () => {
      const { isUSDST, syncStocksFromTushare, isUSTradingDay } = require('../db-crypto');
      const now = new Date();
      const bjtNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
      const bjtHour = bjtNow.getUTCHours();
      const dst = isUSDST(now);
      // 美股收盘后（夏令时 BJT 04:00+，冬令时 BJT 05:00+）才拉取
      const closeHourBJT = dst ? 4 : 5;
      if (bjtHour < closeHourBJT) {
        console.log(`[美股同步] 当前 BJT ${bjtHour}:xx，美股尚未收盘（收盘时间 BJT ${closeHourBJT}:00），跳过`);
        return;
      }

      // 结算日期：BJT 今天的前一天（美东昨天）
      const yesterday = new Date(bjtNow);
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      const targetDate = yesterday.toISOString().slice(0, 10);

      if (!isUSTradingDay(targetDate)) {
        console.log(`[美股同步] ${targetDate} 为非交易日，跳过`);
        return;
      }

      // 用 Tushare us_daily 按日期批量拉取（一次调用拿所有7只股票当天数据）
      let anyAdded = false;
      try {
        const r = await syncStocksFromTushare();
        if (r.added > 0) {
          console.log(`[美股同步] 七姐妹 共新增 ${r.added} 条，处理日期: ${r.dates.join(', ')}`);
          anyAdded = true;
        }
      } catch (e: any) {
        console.error('[美股同步] Tushare 拉取失败:', e.message);
      }

      // 有新数据时才触发结算
      if (anyAdded) {
        try {
          const { settleDailyBets } = await import('../prediction-router');
          const result = await settleDailyBets(targetDate);
          console.log(`[美股结算] ${targetDate} 完成: 结算${result.settled}单，中奖${result.won}单，派奖${result.totalPayout.toFixed(2)}U`);
        } catch (err) {
          console.error('[美股结算] 执行失败:', err);
        }
      }
    };

    // 每小时执行一次检查
    setInterval(runUSStockSync, 60 * 60 * 1000);
    // 启动时也立即执行一次（5秒后，避免与启动补齐冲突）
    setTimeout(runUSStockSync, 8000);
    console.log('[美股同步] 已注册，每小时检查一次，美股收盘后自动拉取数据并结算');
    // ──────────────────────────────────────────────────────
  });
}

startServer().catch(console.error);
