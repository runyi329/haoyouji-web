-- 导入现有商城分类与商品数据（匹配现有表结构；幂等：仅 tenant_id=1 自营商品）
SET NAMES utf8mb4;

DELETE FROM shop_category WHERE tenant_id = 1;
INSERT INTO shop_category (tenant_id, code, name, icon, sort_order, status) VALUES
(1, 'care',    '口腔护理', '/yaban-shop/cat_care.webp',    1, 1),
(1, 'implant', '种植牙',   '/yaban-shop/cat_implant.webp', 2, 1),
(1, 'ortho',   '正畸矫正', '/yaban-shop/cat_ortho.webp',   3, 1),
(1, 'clean',   '洁牙美白', '/yaban-shop/cat_clean.webp',   4, 1),
(1, 'surgery', '拔牙补牙', '/yaban-shop/cat_surgery.webp', 5, 1);

DELETE FROM shop_product WHERE tenant_id = 1 AND source = 'self';
INSERT INTO shop_product
  (tenant_id, source, category_code, kind, name, subtitle, price, original_price, image, sales, tags, description, legacy_code, sort_order, status)
VALUES
(1, 'self', 'care', 'product', '声波电动牙刷', '高频清洁 · 护龈软毛', 199, 299, '/yaban-shop/p1001_toothbrush.webp', 1280, '热销',
 '["采用高频声波震动技术，深入清洁牙缝与牙龈沟。","配备护龈软毛刷头，温和不伤牙釉质。","续航约 30 天，IPX7 级防水，可整机水洗。"]', 'p1001', 1, 1),
(1, 'self', 'care', 'product', '抗敏感修护牙膏', '舒缓牙本质敏感', 39, 59, '/yaban-shop/p1002_toothpaste.webp', 3560, '热销',
 '["含硝酸钾配方，有效缓解冷热酸甜刺激引起的牙齿敏感。","温和清洁，长期使用帮助修护牙釉质。","建议每日早晚使用，每次刷牙不少于两分钟。"]', 'p1002', 2, 1),
(1, 'self', 'care', 'product', '牙线棒家庭装', '细滑不伤龈 · 50 支', 25, NULL, '/yaban-shop/p1003_floss.webp', 2100, '',
 '["高强度细滑牙线，轻松清除牙缝食物残渣。","弓形设计便于后牙清洁，单手即可操作。","家庭实惠装，每盒 50 支。"]', 'p1003', 3, 1),
(1, 'self', 'care', 'product', '漱口水清新装', '长效抑菌 · 无酒精', 49, 69, '/yaban-shop/p1004_mouthwash.webp', 1640, '',
 '["无酒精温和配方，长效抑制口腔细菌。","持久清新口气，含漱后不刺激口腔黏膜。","建议刷牙后使用，含漱约 30 秒后吐出。"]', 'p1004', 4, 1),
(1, 'self', 'implant', 'service', '韩国进口种植牙单颗', '含植体 + 基台 + 牙冠', 4980, 6800, '/yaban-shop/s2001_implant_kr.webp', 320, '定金,到院结算',
 '["采用韩国进口种植系统，适合大多数缺牙修复需求。","费用含植体、基台与牙冠，具体方案以面诊为准。","线上支付为预约定金，余款到院结算。"]', 's2001', 5, 1),
(1, 'self', 'implant', 'service', '瑞士进口种植牙单颗', '高端植体 · 长效稳固', 8800, 12800, '/yaban-shop/s2002_implant_swiss.webp', 156, '定金,到院结算',
 '["瑞士高端种植系统，骨结合能力强，长期稳固。","适合对种植体品质有较高要求的患者。","线上支付为预约定金，余款到院结算。"]', 's2002', 6, 1),
(1, 'self', 'ortho', 'service', '隐形矫正全程套餐', '透明牙套 · 舒适美观', 19800, 25800, '/yaban-shop/s3001_ortho_clear.webp', 88, '定金,到院结算',
 '["采用透明隐形矫治器，美观舒适，可自行摘戴。","全程包含方案设计、矫治器与定期复诊。","线上支付为预约定金，余款到院结算。"]', 's3001', 7, 1),
(1, 'self', 'ortho', 'service', '金属托槽矫正套餐', '经济实用 · 矫治高效', 12800, 16800, '/yaban-shop/s3002_ortho_metal.webp', 110, '定金,到院结算',
 '["传统金属托槽矫正，性价比高，矫治效果稳定。","适合各类牙齿排列不齐、咬合异常的矫治。","线上支付为预约定金，余款到院结算。"]', 's3002', 8, 1),
(1, 'self', 'clean', 'service', '超声波洁牙', '去牙结石 · 护牙龈', 198, 298, '/yaban-shop/s4001_clean_ultrasonic.webp', 680, '到院结算',
 '["超声波洁治去除牙结石与牙菌斑，预防牙龈炎。","建议每半年至一年洁牙一次，维护口腔健康。","可线上预约下单，到院完成诊疗。"]', 's4001', 9, 1),
(1, 'self', 'clean', 'service', '冷光美白', '快速提亮牙齿色阶', 880, 1280, '/yaban-shop/s4002_whitening.webp', 240, '定金,到院结算',
 '["冷光美白技术快速提亮牙齿色阶，效果自然。","单次诊疗约一小时，由专业医师操作。","线上支付为预约定金，余款到院结算。"]', 's4002', 10, 1),
(1, 'self', 'surgery', 'service', '智齿拔除', '微创操作 · 含麻醉', 380, 580, '/yaban-shop/s5001_extraction.webp', 520, '到院结算',
 '["微创拔牙操作，含局部麻醉，减轻术中不适。","复杂阻生智齿费用以面诊评估为准。","可线上预约下单，到院完成诊疗。"]', 's5001', 11, 1),
(1, 'self', 'surgery', 'service', '树脂补牙', '美学修复 · 当次完成', 280, 380, '/yaban-shop/s5002_filling.webp', 760, '到院结算',
 '["采用复合树脂材料修复龋齿，颜色接近天然牙。","多数情况当次就诊即可完成修复。","可线上预约下单，到院完成诊疗。"]', 's5002', 12, 1);
