-- 为已绑定诊所生成子渠道并写入映射（幂等）
-- 子渠道：channel_type='kf'，project_key='yaban:<tenant_id>'，kf_id 继承父渠道

-- 用存储过程遍历 wecom_channel_service_binding 中尚未生成子渠道的诊所
DELIMITER //
DROP PROCEDURE IF EXISTS seed_clinic_channels //
CREATE PROCEDURE seed_clinic_channels()
BEGIN
  DECLARE done INT DEFAULT 0;
  DECLARE v_parent INT;
  DECLARE v_type VARCHAR(50);
  DECLARE v_tenant INT;
  DECLARE v_name VARCHAR(100);
  DECLARE v_kf VARCHAR(64);
  DECLARE v_new_ch INT;
  DECLARE cur CURSOR FOR
    SELECT b.channel_id, b.service_type, b.service_tenant_id, b.service_tenant_name, c.kf_id
    FROM wecom_channel_service_binding b
    LEFT JOIN wecom_channels c ON c.id = b.channel_id
    WHERE NOT EXISTS (
      SELECT 1 FROM wecom_clinic_channel m
      WHERE m.service_type = b.service_type AND m.service_tenant_id = b.service_tenant_id
    );
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = 1;

  OPEN cur;
  read_loop: LOOP
    FETCH cur INTO v_parent, v_type, v_tenant, v_name, v_kf;
    IF done THEN LEAVE read_loop; END IF;

    -- 创建诊所子渠道
    INSERT INTO wecom_channels (name, channel_type, project_key, kf_id, is_enabled)
    VALUES (CONCAT(v_name, '·诊所专属'), 'kf', CONCAT(v_type, ':', v_tenant), v_kf, 1);
    SET v_new_ch = LAST_INSERT_ID();

    -- 写入映射
    INSERT INTO wecom_clinic_channel (parent_channel_id, service_type, service_tenant_id, clinic_channel_id)
    VALUES (v_parent, v_type, v_tenant, v_new_ch);

    -- 为诊所子渠道创建一个空的私有知识库
    INSERT INTO wecom_knowledge_bases (name, description, channel_type, channel_id, is_system, is_shared)
    VALUES (CONCAT(v_name, '·私有知识库'), '诊所专属知识库', 'kf', v_new_ch, 0, 0);
  END LOOP;
  CLOSE cur;
END //
DELIMITER ;

CALL seed_clinic_channels();
DROP PROCEDURE seed_clinic_channels;
