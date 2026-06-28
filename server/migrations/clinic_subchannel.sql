-- ============================================================
-- 诊所子渠道下放：把诊所建模为 wecom_channels 里的虚拟子渠道
-- 父渠道（如 channel_id=4 牙伴在线）作为兜底层
-- 诊所子渠道作为优先层，AI 配置/规则/知识库/素材/语料按其 channel_id 存取
-- ============================================================

-- 1. 诊所子渠道映射表：(service_type, tenant_id) -> 诊所子渠道 channel_id
CREATE TABLE IF NOT EXISTS wecom_clinic_channel (
  id INT NOT NULL AUTO_INCREMENT,
  parent_channel_id INT NOT NULL COMMENT '父渠道（微信客服）wecom_channels.id，兜底层',
  service_type VARCHAR(50) NOT NULL DEFAULT 'yaban' COMMENT '服务商类型',
  service_tenant_id INT NOT NULL COMMENT '诊所租户ID yaban_clinic.tenant_id',
  clinic_channel_id INT NOT NULL COMMENT '诊所专属子渠道 wecom_channels.id，优先层',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_service_tenant (service_type, service_tenant_id),
  UNIQUE KEY uk_clinic_channel (clinic_channel_id),
  KEY idx_parent (parent_channel_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='诊所->子渠道映射(权限下放)';
