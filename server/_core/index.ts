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
  // 量化回测代理路由
  const quantProxyModule = await import('../quant-proxy.js');
  app.use(quantProxyModule.default);

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

    // 启动无损合约收益权档位扫描器（每4小时扫描一次）
    startTierScanner();

    // 启动实时价格扫描器（每60秒刷新 BTC/ETH/SOL 现货价格）
    startPriceScanner();

    // 启动资金方订单收益权扫描器（每4小时扫描一次，对齐北京时间整点）
    startFunderScanner();

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

    // ─── 股票类抽奖自动开奖任务（北京时间 15:01/15:02/15:03 触发）───
    // 上证/深证收盘时间为北京时间 15:00（UTC 07:00）
    // 策略：15:01 首次尝试，失败则每分钟重试，直到 15:30 放弃
    // 只处理 draw_at 日期 = 今天 且 external_seed_type 为股票类的活动
    const stockDrawAttempted = new Map<string, number>(); // key: 'YYYY-MM-DD_activityId', value: 尝试次数
    setInterval(async () => {
      try {
        const now = new Date();
        const bjHour = (now.getUTCHours() + 8) % 24;
        const bjMinute = now.getUTCMinutes();
        // 在 15:01-15:30 之间每分钟尝试（扩大窗口，防止错过）
        if (bjHour !== 15 || bjMinute < 1 || bjMinute > 30) return;

        const todayBJ = new Date(now.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
        const { getDbConnection } = await import('../db');
        const conn = await getDbConnection();
        if (!conn) return;

        // 查询今天到期的股票类活动（状态为 active 或 open）
        // 使用宽松的时间范围匹配，避免 CONVERT_TZ 时区偏差导致匹配失败
        // draw_at 在北京时间当天任意时到15:30之间（UTC 00:00 到 07:30）
        const todayStart = `${todayBJ} 00:00:00`;
        const todayEnd = `${todayBJ} 23:59:59`;
        const [rows] = await conn.execute(
          `SELECT id, title, external_seed_type, draw_at FROM lottery_activities
           WHERE (status='active' OR status='open')
             AND auto_draw_enabled=1
             AND external_seed_type IN ('sh_index', 'sz_index')
             AND (DATE(draw_at) = ? OR (draw_at >= ? AND draw_at <= ?))`,
          [todayBJ, todayStart, todayEnd]
        ) as any[];

        if (!Array.isArray(rows) || rows.length === 0) return;

        const { executeDrawForActivity } = await import('../lottery-router');
        for (const activity of rows) {
          const attemptKey = `${todayBJ}_${activity.id}`;
          const attempts = stockDrawAttempted.get(attemptKey) || 0;
          if (attempts >= 3) continue; // 已尝试3次，放弃

          stockDrawAttempted.set(attemptKey, attempts + 1);
          console.log(`[自动开奖] 尝试第${attempts + 1}次 - 活动「${activity.title}」(id=${activity.id})`);

          const result = await executeDrawForActivity(activity.id);
          if (result.success) {
            console.log(`[自动开奖] ✅ 活动「${activity.title}」开奖成功，共 ${result.winners?.length || 0} 位获奖者`);
            stockDrawAttempted.set(attemptKey, 99); // 标记已成功，不再重试
          } else {
            console.warn(`[自动开奖] ⚠️ 活动「${activity.title}」第${attempts + 1}次失败: ${result.error}`);
          }
        }
      } catch (err) {
        console.error('[自动开奖] 定时任务执行出错:', err);
      }
    }, 60 * 1000); // 每分钟检查一次
    console.log('[自动开奖] 已注册，每天北京时间 15:01-15:03 自动触发股票类抽奖开奖');
    // ──────────────────────────────────────────────────────

    // ─── QQ 在线人数定时抓取（每分钟一次）───
    let lastQQFetchTime = '';
    setInterval(async () => {
      try {
        const res = await fetch('https://www.qq09.com/api/external/list-tecent-online/tecentOnline');
        if (!res.ok) return;
        const json = await res.json() as any;
        const list: Array<{ onlineTime: string; onlineNum: number; onlineChange: number }> = json?.data?.list;
        if (!Array.isArray(list) || list.length === 0) return;
        const latest = list[0];
        if (!latest || latest.onlineTime === lastQQFetchTime) return;
        lastQQFetchTime = latest.onlineTime;
        // 生成期号：YYYYMMDDHHII（取统计时间）
        const t = latest.onlineTime; // '2026-03-23 01:23:01'
        const issueNo = Number(t.replace(/[-: ]/g, '').slice(0, 12));
        const numStr = String(latest.onlineNum);
        const last1 = Number(numStr.slice(-1));
        const last2 = Number(numStr.slice(-2));
        const last3 = Number(numStr.slice(-3));
        const { getDbConnection } = await import('../db');
        const conn = await getDbConnection();
        if (!conn) return;
        await (conn as any).execute(
          `INSERT IGNORE INTO qq_online_records (issue_no, online_time, online_num, online_change, last1, last2, last3)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [issueNo, latest.onlineTime, latest.onlineNum, latest.onlineChange, last1, last2, last3]
        );
        console.log(`[QQ在线] 已记录 ${latest.onlineTime} 在线人数 ${latest.onlineNum.toLocaleString()}`);
      } catch (err) {
        console.error('[QQ在线] 抓取失败:', err);
      }
    }, 60 * 1000); // 每分钟抓取一次
    console.log('[QQ在线] 定时抓取任务已启动，每分钟记录一次腾讯在线人数');
    // ──────────────────────────────────────────────────────
  });
}

startServer().catch(console.error);
