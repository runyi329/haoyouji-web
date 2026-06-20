/**
 * 模拟人脉数据生成器
 * 用于自动生成随机的人脉联系人数据
 */

// 中文姓氏库
const surnames = [
  '王', '李', '张', '刘', '陈', '杨', '黄', '赵', '周', '吴',
  '徐', '孙', '马', '胡', '朱', '郭', '何', '高', '林', '罗',
  '郑', '梁', '谢', '宋', '唐', '许', '韩', '冯', '邓', '曹',
  '彭', '曾', '萧', '田', '董', '潘', '袁', '蔡', '蒋', '余',
  '于', '杜', '叶', '程', '魏', '苏', '吕', '丁', '任', '沈',
  '姚', '卢', '傅', '钟', '姜', '崔', '谭', '廖', '范', '汪',
  '陆', '金', '石', '戴', '贾', '韦', '夏', '邱', '方', '侯',
  '邹', '熊', '孟', '秦', '白', '江', '阎', '薛', '尹', '段',
  '雷', '黎', '史', '龙', '贺', '顾', '毛', '郝', '龚', '邵',
  '万', '钱', '严', '覃', '武', '戚', '孔', '向', '汤', '常'
];

// 男性名字库
const maleNames = [
  '伟', '强', '磊', '军', '勇', '杰', '涛', '明', '超', '华',
  '刚', '辉', '鹏', '飞', '斌', '波', '宇', '浩', '凯', '健',
  '俊', '峰', '志', '建', '文', '博', '威', '龙', '林', '海',
  '天', '宏', '亮', '成', '东', '平', '国', '忠', '新', '立',
  '永', '晨', '阳', '旭', '昊', '睿', '泽', '翔', '航', '瑞',
  '嘉', '轩', '铭', '皓', '然', '霖', '乐', '彦', '宸', '逸'
];

// 女性名字库
const femaleNames = [
  '芳', '娜', '敏', '静', '丽', '艳', '娟', '霞', '秀', '玲',
  '桂', '英', '华', '慧', '红', '云', '燕', '萍', '琴', '梅',
  '莉', '婷', '雪', '琳', '晶', '欣', '倩', '蕾', '薇', '洁',
  '颖', '露', '瑶', '怡', '婉', '雅', '璐', '妍', '茜', '菲',
  '悦', '琪', '萱', '诗', '涵', '梦', '佳', '思', '雯', '彤',
  '馨', '瑾', '璇', '媛', '韵', '蓉', '珊', '宁', '岚', '妮'
];

// 地区列表
const regions = [
  '北京', '天津', '河北', '山西', '内蒙古', '辽宁', '吉林', '黑龙江',
  '上海', '江苏', '浙江', '安徽', '福建', '江西', '山东', '河南',
  '湖北', '湖南', '广东', '广西', '海南', '重庆', '四川', '贵州',
  '云南', '西藏', '陕西', '甘肃', '青海', '宁夏', '新疆', '香港',
  '澳门', '台湾'
];

// 城市详细地址
const cityAddresses: Record<string, string[]> = {
  '北京': ['朝阳区建国路88号SOHO现代城', '海淀区中关村大街1号', '东城区王府井大街255号', '西城区金融街7号'],
  '上海': ['浦东新区陆家嘴环路1000号', '静安区南京西路1266号', '徐汇区淮海中路999号', '黄浦区外滩中山东一路12号'],
  '广东': ['广州市天河区珠江新城华夏路8号', '深圳市南山区科技园南区', '东莞市松山湖高新技术产业开发区', '佛山市禅城区季华五路'],
  '浙江': ['杭州市西湖区文三路90号', '宁波市鄞州区天童南路666号', '温州市鹿城区车站大道', '嘉兴市南湖区中环南路'],
  '江苏': ['南京市鼓楼区汉中路2号', '苏州市工业园区苏州大道东', '无锡市滨湖区太湖新城', '常州市新北区太湖东路']
};

// 公司名称模板
const companyPrefixes = ['上海', '北京', '深圳', '杭州', '广州', '南京', '成都', '武汉', '西安', '苏州'];
const companyMiddles = ['华创', '盛达', '鼎盛', '恒信', '瑞丰', '中天', '博远', '嘉禾', '金鹏', '宏图', '明远', '永恒', '天成', '万达', '新世纪'];
const companySuffixes = ['投资管理', '科技', '贸易', '实业', '咨询', '金融', '资产管理', '商务', '信息技术', '网络科技'];

// 银行列表
const banks = [
  '中国工商银行', '中国建设银行', '中国农业银行', '中国银行',
  '交通银行', '招商银行', '浦发银行', '中信银行', '民生银行',
  '兴业银行', '光大银行', '华夏银行', '平安银行', '广发银行'
];

// 邮箱域名
const emailDomains = ['qq.com', '163.com', '126.com', 'gmail.com', 'outlook.com', 'sina.com', 'foxmail.com'];

/**
 * 生成随机整数
 */
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * 从数组中随机选择一个元素
 */
function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * 生成随机手机号
 */
function generatePhone(): string {
  const prefixes = ['130', '131', '132', '133', '134', '135', '136', '137', '138', '139',
                    '150', '151', '152', '153', '155', '156', '157', '158', '159',
                    '170', '171', '172', '173', '175', '176', '177', '178',
                    '180', '181', '182', '183', '184', '185', '186', '187', '188', '189'];
  return randomChoice(prefixes) + String(randomInt(10000000, 99999999));
}

/**
 * 生成随机邮箱
 */
function generateEmail(name: string): string {
  const pinyin = name.toLowerCase().replace(/[^a-z]/g, '') || 'user';
  const domain = randomChoice(emailDomains);
  const suffix = randomInt(100, 9999);
  return `${pinyin}${suffix}@${domain}`;
}

/**
 * 生成随机银行账号
 */
function generateBankAccount(): string {
  return '622' + String(randomInt(1000000000000000, 9999999999999999)).slice(0, 16);
}

/**
 * 生成随机公司名称
 */
function generateCompanyName(): string {
  return randomChoice(companyPrefixes) + randomChoice(companyMiddles) + randomChoice(companySuffixes) + '有限公司';
}

/**
 * 生成随机税号
 */
function generateTaxNumber(): string {
  const prefix = '91' + String(randomInt(100000, 999999));
  const suffix = 'MA' + String(randomInt(1, 9)) + 'K' + String(randomInt(1, 9)) + 'XYZ' + String(randomInt(10, 99));
  return prefix + suffix;
}

/**
 * 生成随机详细地址
 */
function generateAddress(region: string): string {
  const addresses = cityAddresses[region] || [`${region}市中心商业区${randomInt(1, 999)}号`];
  return randomChoice(addresses) + `${randomInt(1, 50)}层${randomInt(101, 9999)}室`;
}

export interface MockContactOptions {
  includePhone?: boolean;
  includeEmail?: boolean;
  includeAddress?: boolean;
  includeBankAccount?: boolean;
  includeCompany?: boolean;
  includeInvoiceInfo?: boolean;
}

export interface MockContactData {
  // 基础信息
  name: string;
  title: string;
  gender: '男' | '女';
  region: string;
  
  // 扩展信息
  phone?: string;
  email?: string;
  address?: {
    recipient: string;
    phone: string;
    detail: string;
  };
  bankAccount?: {
    accountName: string;
    bankName: string;
    accountNumber: string;
  };
  company?: string;
  invoiceInfo?: {
    companyName: string;
    taxNumber: string;
  };
}

/**
 * 生成一个随机的模拟联系人数据
 */
export function generateMockContact(options: MockContactOptions = {}): MockContactData {
  const {
    includePhone = true,
    includeEmail = true,
    includeAddress = true,
    includeBankAccount = true,
    includeCompany = true,
    includeInvoiceInfo = true
  } = options;

  // 随机性别
  const gender: '男' | '女' = Math.random() > 0.5 ? '男' : '女';
  
  // 生成姓名
  const surname = randomChoice(surnames);
  const givenName = gender === '男' 
    ? randomChoice(maleNames) + (Math.random() > 0.5 ? randomChoice(maleNames) : '')
    : randomChoice(femaleNames) + (Math.random() > 0.5 ? randomChoice(femaleNames) : '');
  const name = surname + givenName;
  
  // 昵称（取名字的一部分或全名）
  const title = Math.random() > 0.5 ? givenName : name;
  
  // 地区
  const region = randomChoice(regions);
  
  const contact: MockContactData = {
    name,
    title,
    gender,
    region
  };

  // 可选字段
  if (includePhone) {
    contact.phone = generatePhone();
  }

  if (includeEmail) {
    contact.email = generateEmail(name);
  }

  if (includeAddress) {
    contact.address = {
      recipient: name,
      phone: contact.phone || generatePhone(),
      detail: generateAddress(region)
    };
  }

  if (includeBankAccount) {
    contact.bankAccount = {
      accountName: name,
      bankName: randomChoice(banks) + randomChoice(['北京', '上海', '广州', '深圳', '杭州']) + '分行',
      accountNumber: generateBankAccount()
    };
  }

  if (includeCompany) {
    contact.company = generateCompanyName();
  }

  if (includeInvoiceInfo) {
    const companyName = contact.company || generateCompanyName();
    contact.invoiceInfo = {
      companyName,
      taxNumber: generateTaxNumber()
    };
  }

  return contact;
}

// 联络方式列表
const interactionTypes = ['电话', '微信', '见面', '邮件', '短信', '视频通话', '微信语音', '微信视频'];

// 随机标签库
const randomTags = [
  // 关系类
  '重要客户', '潜在客户', '合作伙伴', '朋友', '同事', '同学', '亲戚', '邻居', '老师', '学生',
  // 行业类
  '金融行业', '科技行业', '房地产', '医疗健康', '教育行业', '制造业', '零售业', '餐饮业', '文化娱乐', '体育运动',
  // 特征类
  '高净值', '活跃用户', '待跟进', '已成交', '有转介绍能力', '决策者', '影响力大', '信任度高',
  // 地域类
  '北京地区', '上海地区', '广深地区', '江浙地区', '海外',
  // 兴趣类
  '爱好高尔夫', '爱好旅游', '爱好美食', '爱好运动', '爱好阅读', '爱好音乐', '爱好摄影',
  // 其他
  'VIP', '核心人脉', '待维护', '新认识', '老朋友', '年度重点', '项目相关', '投资相关'
];

/**
 * 生成随机标签
 */
export function generateRandomTag(): string {
  return randomChoice(randomTags);
}

/**
 * 生成多个不重复的随机标签
 */
export function generateRandomTags(count: number): string[] {
  const shuffled = [...randomTags].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

// 联络备注模板
const interactionNotes = [
  '日常问候',
  '聊了聊近况',
  '讨论了合作事宜',
  '约了下次见面',
  '分享了一些行业信息',
  '帮忙介绍了新朋友',
  '讨论了投资机会',
  '交流了市场动态',
  '确认了下次会议时间',
  '发送了节日祝福',
  '感谢上次的帮助',
  '询问了项目进展',
  '分享了好消息',
  '约了吃饭',
  '寄送了礼物',
  '帮忙处理了一些事情',
  '',  // 空备注（快捷联络）
];

/**
 * 生成随机联络记录数据
 */
export function generateRandomInteraction(): { type: string; notes: string } {
  return {
    type: randomChoice(interactionTypes),
    notes: randomChoice(interactionNotes),
  };
}

// 自动生成任务状态存储（内存中）
interface AutoTaskConfig {
  timer: NodeJS.Timeout;
  dailyNewContacts: number;
  dailyRandomInteractions: number;
  dailyRandomTags: number;  // 每天随机打标签数量
  options: MockContactOptions;
  lastRunDate: string; // YYYY-MM-DD 格式
  todayNewCount: number;
  todayInteractionCount: number;
  todayTagCount: number;  // 今日已打标签数量
}

const autoGenerateTasks: Map<number, AutoTaskConfig> = new Map();

/**
 * 获取今天的日期字符串 (YYYY-MM-DD)
 */
function getTodayDateString(): string {
  const now = new Date();
  // 使用北京时间
  const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return beijingTime.toISOString().split('T')[0];
}

export interface AutoGenerateConfig {
  dailyNewContacts: number;  // 每天生成新人脉数量
  dailyRandomInteractions: number;  // 每天随机联络数量
  dailyRandomTags: number;  // 每天随机打标签数量（总量）
  options: MockContactOptions;  // 生成内容选项
}

/**
 * 启动自动生成任务（每天执行）
 */
export function startAutoGenerate(
  userId: number, 
  config: AutoGenerateConfig,
  createContactCallback: (data: MockContactData) => Promise<number>,
  createInteractionCallback: (contactId: number, type: string, notes: string) => Promise<void>,
  addTagCallback: (contactId: number, tagName: string) => Promise<void>,
  getRandomContactIds: () => Promise<number[]>
): boolean {
  // 如果已有任务，先停止
  stopAutoGenerate(userId);
  
  const today = getTodayDateString();
  
  // 创建定时器，每分钟检查一次
  const timer = setInterval(async () => {
    try {
      const taskConfig = autoGenerateTasks.get(userId);
      if (!taskConfig) return;
      
      const currentDate = getTodayDateString();
      
      // 如果日期变了，重置计数器
      if (currentDate !== taskConfig.lastRunDate) {
        taskConfig.lastRunDate = currentDate;
        taskConfig.todayNewCount = 0;
        taskConfig.todayInteractionCount = 0;
        taskConfig.todayTagCount = 0;
        console.log(`[AutoGenerate] 用户 ${userId} 新的一天，重置计数器`);
      }
      
      // 检查是否还需要生成新人脉
      if (taskConfig.todayNewCount < taskConfig.dailyNewContacts) {
        const mockData = generateMockContact(taskConfig.options);
        await createContactCallback(mockData);
        taskConfig.todayNewCount++;
        console.log(`[AutoGenerate] 用户 ${userId} 生成了新人脉: ${mockData.name} (今日第${taskConfig.todayNewCount}个)`);
      }
      
      // 检查是否还需要随机联络
      if (taskConfig.todayInteractionCount < taskConfig.dailyRandomInteractions) {
        const contactIds = await getRandomContactIds();
        if (contactIds.length > 0) {
          // 随机选择一个联系人
          const randomContactId = contactIds[Math.floor(Math.random() * contactIds.length)];
          const interaction = generateRandomInteraction();
          await createInteractionCallback(randomContactId, interaction.type, interaction.notes);
          taskConfig.todayInteractionCount++;
          console.log(`[AutoGenerate] 用户 ${userId} 随机联络了人脉ID: ${randomContactId} (今日第${taskConfig.todayInteractionCount}次)`);
        }
      }
      
      // 检查是否还需要随机打标签
      if (taskConfig.todayTagCount < taskConfig.dailyRandomTags) {
        const contactIds = await getRandomContactIds();
        if (contactIds.length > 0) {
          // 随机选择一个联系人
          const randomContactId = contactIds[Math.floor(Math.random() * contactIds.length)];
          const tagName = generateRandomTag();
          try {
            await addTagCallback(randomContactId, tagName);
            taskConfig.todayTagCount++;
            console.log(`[AutoGenerate] 用户 ${userId} 给人脉ID: ${randomContactId} 打了标签: ${tagName} (今日第${taskConfig.todayTagCount}个)`);
          } catch (e) {
            // 标签可能已存在，忽略错误
            console.log(`[AutoGenerate] 给人脉ID: ${randomContactId} 打标签失败，可能已存在`);
          }
        }
      }
      
    } catch (error) {
      console.error(`[AutoGenerate] 用户 ${userId} 自动任务失败:`, error);
    }
  }, 60 * 1000); // 每分钟检查一次
  
  autoGenerateTasks.set(userId, {
    timer,
    dailyNewContacts: config.dailyNewContacts,
    dailyRandomInteractions: config.dailyRandomInteractions,
    dailyRandomTags: config.dailyRandomTags,
    options: config.options,
    lastRunDate: today,
    todayNewCount: 0,
    todayInteractionCount: 0,
    todayTagCount: 0,
  });
  
  console.log(`[AutoGenerate] 用户 ${userId} 启动自动任务，每天生成${config.dailyNewContacts}个新人脉，随机联络${config.dailyRandomInteractions}次，打标签${config.dailyRandomTags}个`);
  
  return true;
}

/**
 * 停止自动生成任务
 */
export function stopAutoGenerate(userId: number): boolean {
  const taskConfig = autoGenerateTasks.get(userId);
  if (taskConfig) {
    clearInterval(taskConfig.timer);
    autoGenerateTasks.delete(userId);
    console.log(`[AutoGenerate] 用户 ${userId} 停止自动任务`);
    return true;
  }
  return false;
}

/**
 * 检查用户是否有正在运行的自动生成任务
 */
export function isAutoGenerateRunning(userId: number): boolean {
  return autoGenerateTasks.has(userId);
}

/**
 * 获取自动生成任务的状态
 */
export function getAutoGenerateStatus(userId: number): {
  isRunning: boolean;
  config?: {
    dailyNewContacts: number;
    dailyRandomInteractions: number;
    dailyRandomTags: number;
    todayNewCount: number;
    todayInteractionCount: number;
    todayTagCount: number;
  };
} {
  const taskConfig = autoGenerateTasks.get(userId);
  if (!taskConfig) {
    return { isRunning: false };
  }
  return {
    isRunning: true,
    config: {
      dailyNewContacts: taskConfig.dailyNewContacts,
      dailyRandomInteractions: taskConfig.dailyRandomInteractions,
      dailyRandomTags: taskConfig.dailyRandomTags,
      todayNewCount: taskConfig.todayNewCount,
      todayInteractionCount: taskConfig.todayInteractionCount,
      todayTagCount: taskConfig.todayTagCount,
    },
  };
}
