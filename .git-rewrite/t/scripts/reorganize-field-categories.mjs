import mysql from 'mysql2/promise';

const DATABASE_URL = process.env.DATABASE_URL;

// 树状分类结构定义
const categoryTree = [
  {
    name: '📍 地址',
    icon: '📍',
    children: [
      '快递地址',
      '公司地址',
      '家庭地址',
      '办公地址',
      '户籍地址',
      '常住地址',
    ]
  },
  {
    name: '📞 联系方式',
    icon: '📞',
    children: [
      '手机号码',
      '座机号码',
      '微信号',
      'QQ号',
      '邮箱',
      '公司电话',
      '公司邮箱',
    ]
  },
  {
    name: '💼 职业信息',
    icon: '💼',
    children: [
      '公司名称',
      '职位',
      '部门',
      '工号',
      '行业',
      '入职日期',
    ]
  },
  {
    name: '🎂 个人信息',
    icon: '🎂',
    children: [
      '生日',
      '血型',
      '星座',
      '爱好',
      '学历',
      '毕业院校',
      '专业',
    ]
  },
  {
    name: '🌐 社交账号',
    icon: '🌐',
    children: [
      '个人网站',
      '领英主页',
      '微博',
      '抖音',
      '小红书',
      'Facebook',
      'Twitter',
      'Instagram',
    ]
  },
  {
    name: '💳 其他信息',
    icon: '💳',
    children: [
      '银行卡号',
      '身份证号',
      '护照号',
      '车牌号',
      '驾驶证号',
      '紧急联系人',
      '紧急联系电话',
      '备注',
    ]
  },
];

async function reorganizeCategories() {
  const conn = await mysql.createConnection(DATABASE_URL);
  
  try {
    console.log('开始重新组织字段类目...\n');
    
    // 1. 删除所有现有类目
    await conn.query('DELETE FROM contact_field_categories WHERE parentUserId = 0');
    console.log('✓ 已清空现有类目');
    
    // 2. 插入主分类和子分类
    let sortOrder = 1;
    
    for (const mainCategory of categoryTree) {
      // 插入主分类
      const [mainResult] = await conn.query(
        `INSERT INTO contact_field_categories 
         (parentUserId, parentCategoryId, name, icon, fieldType, sortOrder, isRequired) 
         VALUES (0, 0, ?, ?, 'text', ?, 0)`,
        [mainCategory.name, mainCategory.icon, sortOrder++]
      );
      
      const mainCategoryId = mainResult.insertId;
      console.log(`✓ 创建主分类: ${mainCategory.name} (ID: ${mainCategoryId})`);
      
      // 插入子分类
      for (const childName of mainCategory.children) {
        // 根据字段名设置字段类型
        let fieldType = 'text';
        if (childName.includes('日期') || childName === '生日') {
          fieldType = 'date';
        }
        
        await conn.query(
          `INSERT INTO contact_field_categories 
           (parentUserId, parentCategoryId, name, fieldType, sortOrder, isRequired) 
           VALUES (0, ?, ?, ?, ?, 0)`,
          [mainCategoryId, childName, fieldType, sortOrder++]
        );
      }
      
      console.log(`  └─ 添加了 ${mainCategory.children.length} 个子分类\n`);
    }
    
    // 3. 验证结果
    const [mainCategories] = await conn.query(
      'SELECT * FROM contact_field_categories WHERE parentUserId = 0 AND parentCategoryId = 0 ORDER BY sortOrder'
    );
    
    const [subCategories] = await conn.query(
      'SELECT * FROM contact_field_categories WHERE parentUserId = 0 AND parentCategoryId != 0 ORDER BY sortOrder'
    );
    
    console.log(`\n✅ 重新组织完成！`);
    console.log(`   主分类数量: ${mainCategories.length}`);
    console.log(`   子分类数量: ${subCategories.length}`);
    console.log(`   总计: ${mainCategories.length + subCategories.length} 个类目\n`);
    
    // 显示主分类列表
    console.log('主分类列表:');
    for (const cat of mainCategories) {
      const [children] = await conn.query(
        'SELECT COUNT(*) as count FROM contact_field_categories WHERE parentCategoryId = ?',
        [cat.id]
      );
      console.log(`  ${cat.icon} ${cat.name} (${children[0].count} 个子分类)`);
    }
    
  } catch (error) {
    console.error('❌ 错误:', error.message);
    throw error;
  } finally {
    await conn.end();
  }
}

reorganizeCategories().catch(console.error);
