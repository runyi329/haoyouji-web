"use strict";
/**
 * 模拟人脉数据生成器
 * 用于自动生成随机的人脉联系人数据
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateMockContact = generateMockContact;
exports.generateRandomTag = generateRandomTag;
exports.generateRandomTags = generateRandomTags;
exports.generateRandomInteraction = generateRandomInteraction;
exports.startAutoGenerate = startAutoGenerate;
exports.stopAutoGenerate = stopAutoGenerate;
exports.isAutoGenerateRunning = isAutoGenerateRunning;
exports.getAutoGenerateStatus = getAutoGenerateStatus;
// 中文姓氏库
var surnames = [
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
var maleNames = [
    '伟', '强', '磊', '军', '勇', '杰', '涛', '明', '超', '华',
    '刚', '辉', '鹏', '飞', '斌', '波', '宇', '浩', '凯', '健',
    '俊', '峰', '志', '建', '文', '博', '威', '龙', '林', '海',
    '天', '宏', '亮', '成', '东', '平', '国', '忠', '新', '立',
    '永', '晨', '阳', '旭', '昊', '睿', '泽', '翔', '航', '瑞',
    '嘉', '轩', '铭', '皓', '然', '霖', '乐', '彦', '宸', '逸'
];
// 女性名字库
var femaleNames = [
    '芳', '娜', '敏', '静', '丽', '艳', '娟', '霞', '秀', '玲',
    '桂', '英', '华', '慧', '红', '云', '燕', '萍', '琴', '梅',
    '莉', '婷', '雪', '琳', '晶', '欣', '倩', '蕾', '薇', '洁',
    '颖', '露', '瑶', '怡', '婉', '雅', '璐', '妍', '茜', '菲',
    '悦', '琪', '萱', '诗', '涵', '梦', '佳', '思', '雯', '彤',
    '馨', '瑾', '璇', '媛', '韵', '蓉', '珊', '宁', '岚', '妮'
];
// 地区列表
var regions = [
    '北京', '天津', '河北', '山西', '内蒙古', '辽宁', '吉林', '黑龙江',
    '上海', '江苏', '浙江', '安徽', '福建', '江西', '山东', '河南',
    '湖北', '湖南', '广东', '广西', '海南', '重庆', '四川', '贵州',
    '云南', '西藏', '陕西', '甘肃', '青海', '宁夏', '新疆', '香港',
    '澳门', '台湾'
];
// 城市详细地址
var cityAddresses = {
    '北京': ['朝阳区建国路88号SOHO现代城', '海淀区中关村大街1号', '东城区王府井大街255号', '西城区金融街7号'],
    '上海': ['浦东新区陆家嘴环路1000号', '静安区南京西路1266号', '徐汇区淮海中路999号', '黄浦区外滩中山东一路12号'],
    '广东': ['广州市天河区珠江新城华夏路8号', '深圳市南山区科技园南区', '东莞市松山湖高新技术产业开发区', '佛山市禅城区季华五路'],
    '浙江': ['杭州市西湖区文三路90号', '宁波市鄞州区天童南路666号', '温州市鹿城区车站大道', '嘉兴市南湖区中环南路'],
    '江苏': ['南京市鼓楼区汉中路2号', '苏州市工业园区苏州大道东', '无锡市滨湖区太湖新城', '常州市新北区太湖东路']
};
// 公司名称模板
var companyPrefixes = ['上海', '北京', '深圳', '杭州', '广州', '南京', '成都', '武汉', '西安', '苏州'];
var companyMiddles = ['华创', '盛达', '鼎盛', '恒信', '瑞丰', '中天', '博远', '嘉禾', '金鹏', '宏图', '明远', '永恒', '天成', '万达', '新世纪'];
var companySuffixes = ['投资管理', '科技', '贸易', '实业', '咨询', '金融', '资产管理', '商务', '信息技术', '网络科技'];
// 银行列表
var banks = [
    '中国工商银行', '中国建设银行', '中国农业银行', '中国银行',
    '交通银行', '招商银行', '浦发银行', '中信银行', '民生银行',
    '兴业银行', '光大银行', '华夏银行', '平安银行', '广发银行'
];
// 邮箱域名
var emailDomains = ['qq.com', '163.com', '126.com', 'gmail.com', 'outlook.com', 'sina.com', 'foxmail.com'];
/**
 * 生成随机整数
 */
function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
/**
 * 从数组中随机选择一个元素
 */
function randomChoice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}
/**
 * 生成随机手机号
 */
function generatePhone() {
    var prefixes = ['130', '131', '132', '133', '134', '135', '136', '137', '138', '139',
        '150', '151', '152', '153', '155', '156', '157', '158', '159',
        '170', '171', '172', '173', '175', '176', '177', '178',
        '180', '181', '182', '183', '184', '185', '186', '187', '188', '189'];
    return randomChoice(prefixes) + String(randomInt(10000000, 99999999));
}
/**
 * 生成随机邮箱
 */
function generateEmail(name) {
    var pinyin = name.toLowerCase().replace(/[^a-z]/g, '') || 'user';
    var domain = randomChoice(emailDomains);
    var suffix = randomInt(100, 9999);
    return "".concat(pinyin).concat(suffix, "@").concat(domain);
}
/**
 * 生成随机银行账号
 */
function generateBankAccount() {
    return '622' + String(randomInt(1000000000000000, 9999999999999999)).slice(0, 16);
}
/**
 * 生成随机公司名称
 */
function generateCompanyName() {
    return randomChoice(companyPrefixes) + randomChoice(companyMiddles) + randomChoice(companySuffixes) + '有限公司';
}
/**
 * 生成随机税号
 */
function generateTaxNumber() {
    var prefix = '91' + String(randomInt(100000, 999999));
    var suffix = 'MA' + String(randomInt(1, 9)) + 'K' + String(randomInt(1, 9)) + 'XYZ' + String(randomInt(10, 99));
    return prefix + suffix;
}
/**
 * 生成随机详细地址
 */
function generateAddress(region) {
    var addresses = cityAddresses[region] || ["".concat(region, "\u5E02\u4E2D\u5FC3\u5546\u4E1A\u533A").concat(randomInt(1, 999), "\u53F7")];
    return randomChoice(addresses) + "".concat(randomInt(1, 50), "\u5C42").concat(randomInt(101, 9999), "\u5BA4");
}
/**
 * 生成一个随机的模拟联系人数据
 */
function generateMockContact(options) {
    if (options === void 0) { options = {}; }
    var _a = options.includePhone, includePhone = _a === void 0 ? true : _a, _b = options.includeEmail, includeEmail = _b === void 0 ? true : _b, _c = options.includeAddress, includeAddress = _c === void 0 ? true : _c, _d = options.includeBankAccount, includeBankAccount = _d === void 0 ? true : _d, _e = options.includeCompany, includeCompany = _e === void 0 ? true : _e, _f = options.includeInvoiceInfo, includeInvoiceInfo = _f === void 0 ? true : _f;
    // 随机性别
    var gender = Math.random() > 0.5 ? '男' : '女';
    // 生成姓名
    var surname = randomChoice(surnames);
    var givenName = gender === '男'
        ? randomChoice(maleNames) + (Math.random() > 0.5 ? randomChoice(maleNames) : '')
        : randomChoice(femaleNames) + (Math.random() > 0.5 ? randomChoice(femaleNames) : '');
    var name = surname + givenName;
    // 昵称（取名字的一部分或全名）
    var title = Math.random() > 0.5 ? givenName : name;
    // 地区
    var region = randomChoice(regions);
    var contact = {
        name: name,
        title: title,
        gender: gender,
        region: region
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
        var companyName = contact.company || generateCompanyName();
        contact.invoiceInfo = {
            companyName: companyName,
            taxNumber: generateTaxNumber()
        };
    }
    return contact;
}
// 联络方式列表
var interactionTypes = ['电话', '微信', '见面', '邮件', '短信', '视频通话', '微信语音', '微信视频'];
// 随机标签库
var randomTags = [
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
function generateRandomTag() {
    return randomChoice(randomTags);
}
/**
 * 生成多个不重复的随机标签
 */
function generateRandomTags(count) {
    var shuffled = __spreadArray([], randomTags, true).sort(function () { return Math.random() - 0.5; });
    return shuffled.slice(0, Math.min(count, shuffled.length));
}
// 联络备注模板
var interactionNotes = [
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
    '', // 空备注（快捷联络）
];
/**
 * 生成随机联络记录数据
 */
function generateRandomInteraction() {
    return {
        type: randomChoice(interactionTypes),
        notes: randomChoice(interactionNotes),
    };
}
var autoGenerateTasks = new Map();
/**
 * 获取今天的日期字符串 (YYYY-MM-DD)
 */
function getTodayDateString() {
    var now = new Date();
    // 使用北京时间
    var beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    return beijingTime.toISOString().split('T')[0];
}
/**
 * 启动自动生成任务（每天执行）
 */
function startAutoGenerate(userId, config, createContactCallback, createInteractionCallback, addTagCallback, getRandomContactIds) {
    var _this = this;
    // 如果已有任务，先停止
    stopAutoGenerate(userId);
    var today = getTodayDateString();
    // 创建定时器，每分钟检查一次
    var timer = setInterval(function () { return __awaiter(_this, void 0, void 0, function () {
        var taskConfig, currentDate, mockData, contactIds, randomContactId, interaction, contactIds, randomContactId, tagName, e_1, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 11, , 12]);
                    taskConfig = autoGenerateTasks.get(userId);
                    if (!taskConfig)
                        return [2 /*return*/];
                    currentDate = getTodayDateString();
                    // 如果日期变了，重置计数器
                    if (currentDate !== taskConfig.lastRunDate) {
                        taskConfig.lastRunDate = currentDate;
                        taskConfig.todayNewCount = 0;
                        taskConfig.todayInteractionCount = 0;
                        taskConfig.todayTagCount = 0;
                        console.log("[AutoGenerate] \u7528\u6237 ".concat(userId, " \u65B0\u7684\u4E00\u5929\uFF0C\u91CD\u7F6E\u8BA1\u6570\u5668"));
                    }
                    if (!(taskConfig.todayNewCount < taskConfig.dailyNewContacts)) return [3 /*break*/, 2];
                    mockData = generateMockContact(taskConfig.options);
                    return [4 /*yield*/, createContactCallback(mockData)];
                case 1:
                    _a.sent();
                    taskConfig.todayNewCount++;
                    console.log("[AutoGenerate] \u7528\u6237 ".concat(userId, " \u751F\u6210\u4E86\u65B0\u4EBA\u8109: ").concat(mockData.name, " (\u4ECA\u65E5\u7B2C").concat(taskConfig.todayNewCount, "\u4E2A)"));
                    _a.label = 2;
                case 2:
                    if (!(taskConfig.todayInteractionCount < taskConfig.dailyRandomInteractions)) return [3 /*break*/, 5];
                    return [4 /*yield*/, getRandomContactIds()];
                case 3:
                    contactIds = _a.sent();
                    if (!(contactIds.length > 0)) return [3 /*break*/, 5];
                    randomContactId = contactIds[Math.floor(Math.random() * contactIds.length)];
                    interaction = generateRandomInteraction();
                    return [4 /*yield*/, createInteractionCallback(randomContactId, interaction.type, interaction.notes)];
                case 4:
                    _a.sent();
                    taskConfig.todayInteractionCount++;
                    console.log("[AutoGenerate] \u7528\u6237 ".concat(userId, " \u968F\u673A\u8054\u7EDC\u4E86\u4EBA\u8109ID: ").concat(randomContactId, " (\u4ECA\u65E5\u7B2C").concat(taskConfig.todayInteractionCount, "\u6B21)"));
                    _a.label = 5;
                case 5:
                    if (!(taskConfig.todayTagCount < taskConfig.dailyRandomTags)) return [3 /*break*/, 10];
                    return [4 /*yield*/, getRandomContactIds()];
                case 6:
                    contactIds = _a.sent();
                    if (!(contactIds.length > 0)) return [3 /*break*/, 10];
                    randomContactId = contactIds[Math.floor(Math.random() * contactIds.length)];
                    tagName = generateRandomTag();
                    _a.label = 7;
                case 7:
                    _a.trys.push([7, 9, , 10]);
                    return [4 /*yield*/, addTagCallback(randomContactId, tagName)];
                case 8:
                    _a.sent();
                    taskConfig.todayTagCount++;
                    console.log("[AutoGenerate] \u7528\u6237 ".concat(userId, " \u7ED9\u4EBA\u8109ID: ").concat(randomContactId, " \u6253\u4E86\u6807\u7B7E: ").concat(tagName, " (\u4ECA\u65E5\u7B2C").concat(taskConfig.todayTagCount, "\u4E2A)"));
                    return [3 /*break*/, 10];
                case 9:
                    e_1 = _a.sent();
                    // 标签可能已存在，忽略错误
                    console.log("[AutoGenerate] \u7ED9\u4EBA\u8109ID: ".concat(randomContactId, " \u6253\u6807\u7B7E\u5931\u8D25\uFF0C\u53EF\u80FD\u5DF2\u5B58\u5728"));
                    return [3 /*break*/, 10];
                case 10: return [3 /*break*/, 12];
                case 11:
                    error_1 = _a.sent();
                    console.error("[AutoGenerate] \u7528\u6237 ".concat(userId, " \u81EA\u52A8\u4EFB\u52A1\u5931\u8D25:"), error_1);
                    return [3 /*break*/, 12];
                case 12: return [2 /*return*/];
            }
        });
    }); }, 60 * 1000); // 每分钟检查一次
    autoGenerateTasks.set(userId, {
        timer: timer,
        dailyNewContacts: config.dailyNewContacts,
        dailyRandomInteractions: config.dailyRandomInteractions,
        dailyRandomTags: config.dailyRandomTags,
        options: config.options,
        lastRunDate: today,
        todayNewCount: 0,
        todayInteractionCount: 0,
        todayTagCount: 0,
    });
    console.log("[AutoGenerate] \u7528\u6237 ".concat(userId, " \u542F\u52A8\u81EA\u52A8\u4EFB\u52A1\uFF0C\u6BCF\u5929\u751F\u6210").concat(config.dailyNewContacts, "\u4E2A\u65B0\u4EBA\u8109\uFF0C\u968F\u673A\u8054\u7EDC").concat(config.dailyRandomInteractions, "\u6B21\uFF0C\u6253\u6807\u7B7E").concat(config.dailyRandomTags, "\u4E2A"));
    return true;
}
/**
 * 停止自动生成任务
 */
function stopAutoGenerate(userId) {
    var taskConfig = autoGenerateTasks.get(userId);
    if (taskConfig) {
        clearInterval(taskConfig.timer);
        autoGenerateTasks.delete(userId);
        console.log("[AutoGenerate] \u7528\u6237 ".concat(userId, " \u505C\u6B62\u81EA\u52A8\u4EFB\u52A1"));
        return true;
    }
    return false;
}
/**
 * 检查用户是否有正在运行的自动生成任务
 */
function isAutoGenerateRunning(userId) {
    return autoGenerateTasks.has(userId);
}
/**
 * 获取自动生成任务的状态
 */
function getAutoGenerateStatus(userId) {
    var taskConfig = autoGenerateTasks.get(userId);
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
