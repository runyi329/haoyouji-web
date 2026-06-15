export interface MedicalHistoryItem {
  id: string;
  name: string; // 标准疾病名称
  category: string; // 所属系统分类
  pinyin: string; // 拼音首字母（用于快速搜索）
  aliases: string[]; // 同义词/俗称（用于模糊搜索匹配）
  relatedTags?: string[]; // 隐藏的关联细项标签（如分级/用药/并发症/家族史等，搜索命中时展开）
}

export const MEDICAL_HISTORY_CATEGORIES = [
  "妊娠与女性健康",
  "心血管系统",
  "内分泌与代谢",
  "呼吸系统",
  "消化系统",
  "肝胆与肾脏",
  "神经与精神",
  "泌尿与生殖",
  "骨骼与关节",
  "血液系统",
  "肿瘤与免疫",
  "传染病",
  "口腔专科史",
  "过敏与用药",
  "其他手术与外伤",
];

export const MEDICAL_HISTORY_DICT: MedicalHistoryItem[] = [
  // 妊娠与女性健康（牙科诊疗高度关注：用药、X光、麻醉、体位均受限）
  {
    id: "pg_1", name: "怀孕", category: "妊娠与女性健康", pinyin: "hy", aliases: ["妊娠", "有孕", "怀孕了", "孕妇", "已孕"],
    relatedTags: ["孕早期(1-12周)", "孕中期(13-27周)", "孕晚期(28周以上)", "预产期临近", "高危妊娠", "妊娠期高血压", "妊娠期糖尿病", "需避免X光检查", "需谨慎用药与麻醉"]
  },
  { id: "pg_2", name: "备孕中", category: "妊娠与女性健康", pinyin: "byz", aliases: ["准备怀孕", "计划怀孕", "试管备孕"] },
  { id: "pg_3", name: "哺乳期", category: "妊娠与女性健康", pinyin: "brq", aliases: ["哺乳", "母乳喂养中", "喂奶期"], relatedTags: ["需谨慎用药(经乳汁分泌)"] },
  { id: "pg_4", name: "月经期", category: "妊娠与女性健康", pinyin: "yjq", aliases: ["来例假", "生理期", "经期"] },
  { id: "pg_5", name: "妊娠期高血压", category: "妊娠与女性健康", pinyin: "rsqgxy", aliases: ["孕期高血压", "妊高症"] },
  { id: "pg_6", name: "妊娠期糖尿病", category: "妊娠与女性健康", pinyin: "rsqtnb", aliases: ["孕期糖尿病", "妊娠糖尿病"] },
  { id: "pg_7", name: "多囊卵巢综合征", category: "妊娠与女性健康", pinyin: "dnlczhz", aliases: ["多囊"] },
  { id: "pg_8", name: "更年期/绝经", category: "妊娠与女性健康", pinyin: "gnqjj", aliases: ["更年期", "绝经", "围绝经期"] },

  // 心血管系统
  {
    id: "cv_1", name: "高血压", category: "心血管系统", pinyin: "gxy", aliases: ["血压高", "血压偏高", "高血压病"],
    relatedTags: ["高血压1级(轻度)", "高血压2级(中度)", "高血压3级(重度)", "规律服降压药", "未规律服药", "血压控制良好", "血压控制不稳定", "高血压性心脏病", "高血压肾病", "有家族遗传史"]
  },
  { id: "cv_2", name: "低血压", category: "心血管系统", pinyin: "dxy", aliases: ["血压低", "血压偏低"] },
  {
    id: "cv_3", name: "冠心病", category: "心血管系统", pinyin: "gxb", aliases: ["冠状动脉粥样硬化", "心肌缺血", "心绞痛"],
    relatedTags: ["心绞痛频发", "陈旧性心肌梗死", "长期服抗凝/抗血小板药", "有家族遗传史"]
  },
  {
    id: "cv_4", name: "心脏支架植入史", category: "心血管系统", pinyin: "xzzjzrs", aliases: ["心脏支架", "冠脉支架", "有支架"],
    relatedTags: ["近半年内植入", "一年以上植入", "长期服双抗药", "长期服单抗药"]
  },
  { id: "cv_5", name: "心脏起搏器植入史", category: "心血管系统", pinyin: "xzqbqzrs", aliases: ["起搏器", "心脏起搏器"] },
  {
    id: "cv_6", name: "心律失常", category: "心血管系统", pinyin: "xlsc", aliases: ["心律不齐", "早搏", "房颤", "心颤", "心动过速"],
    relatedTags: ["房颤", "室性早搏", "心动过缓", "心动过速", "长期服抗凝药"]
  },
  { id: "cv_7", name: "心力衰竭", category: "心血管系统", pinyin: "xlsj", aliases: ["心衰", "心脏扩张", "心肌病"] },
  { id: "cv_8", name: "先天性心脏病", category: "心血管系统", pinyin: "xtxxzb", aliases: ["先心病", "心脏有杂音"] },
  { id: "cv_9", name: "心脏瓣膜病", category: "心血管系统", pinyin: "xzbmb", aliases: ["二尖瓣", "心脏瓣膜手术", "瓣膜置换"] },
  { id: "cv_10", name: "心肌梗死史", category: "心血管系统", pinyin: "xjgss", aliases: ["心梗", "心肌梗塞"], relatedTags: ["半年内新发", "陈旧性心梗", "长期服抗凝药"] },
  { id: "cv_11", name: "下肢静脉曲张/血栓", category: "心血管系统", pinyin: "xzjmqzxs", aliases: ["静脉曲张", "深静脉血栓", "腿上血栓"] },

  // 内分泌与代谢
  {
    id: "ed_1", name: "糖尿病", category: "内分泌与代谢", pinyin: "tnb", aliases: ["血糖高", "高血糖", "血糖偏高"],
    relatedTags: ["1型糖尿病", "2型糖尿病", "口服降糖药", "注射胰岛素", "血糖控制良好", "血糖控制不稳定", "有低血糖发作史", "糖尿病视网膜病变", "糖尿病肾病", "糖尿病足", "有家族遗传史"]
  },
  { id: "ed_2", name: "低血糖", category: "内分泌与代谢", pinyin: "dxt", aliases: ["血糖低", "血糖偏低"] },
  {
    id: "ed_3", name: "高脂血症", category: "内分泌与代谢", pinyin: "gzxz", aliases: ["高血脂", "血脂高", "高胆固醇", "胆固醇高"],
    relatedTags: ["长期服降脂药(他汀类)", "有家族遗传史"]
  },
  {
    id: "ed_4", name: "甲状腺功能亢进", category: "内分泌与代谢", pinyin: "jzxgnkj", aliases: ["甲亢"],
    relatedTags: ["规律服抗甲状腺药", "碘131治疗史", "甲亢控制良好", "甲亢未控制"]
  },
  {
    id: "ed_5", name: "甲状腺功能减退", category: "内分泌与代谢", pinyin: "jzxgnjt", aliases: ["甲减"],
    relatedTags: ["长期服优甲乐", "甲功指标正常"]
  },
  { id: "ed_6", name: "甲状腺炎/结节", category: "内分泌与代谢", pinyin: "jzxyjj", aliases: ["桥本氏甲状腺炎", "甲状腺结节", "甲状腺瘤"] },
  {
    id: "ed_7", name: "痛风", category: "内分泌与代谢", pinyin: "tf", aliases: ["高尿酸", "尿酸高"],
    relatedTags: ["长期服降尿酸药", "急性发作期", "痛风石"]
  },
  { id: "ed_8", name: "肥胖症", category: "内分泌与代谢", pinyin: "fpz", aliases: ["体重超标", "BMI偏高"] },
  { id: "ed_9", name: "库欣综合征/长期用激素", category: "内分泌与代谢", pinyin: "kxzhzcqyjs", aliases: ["长期吃激素", "糖皮质激素", "强的松"], relatedTags: ["长期口服激素", "近期大剂量激素"] },

  // 呼吸系统
  {
    id: "rs_1", name: "支气管哮喘", category: "呼吸系统", pinyin: "zqgxc", aliases: ["哮喘"],
    relatedTags: ["随身携带气雾剂", "近期有急性发作", "控制良好", "有家族遗传史"]
  },
  { id: "rs_2", name: "慢性支气管炎", category: "呼吸系统", pinyin: "mxzqgy", aliases: ["慢支", "老慢支"] },
  { id: "rs_3", name: "慢性阻塞性肺病", category: "呼吸系统", pinyin: "mxzsxfb", aliases: ["慢阻肺", "COPD"] },
  { id: "rs_4", name: "鼻炎/鼻窦炎", category: "呼吸系统", pinyin: "bybdy", aliases: ["过敏性鼻炎", "慢性鼻炎", "鼻窦炎"] },
  { id: "rs_5", name: "肺炎史", category: "呼吸系统", pinyin: "fys", aliases: ["肺炎"] },
  { id: "rs_6", name: "睡眠呼吸暂停", category: "呼吸系统", pinyin: "smhxzt", aliases: ["打呼噜", "鼾症", "OSA"] },
  { id: "rs_7", name: "肺气肿/肺纤维化", category: "呼吸系统", pinyin: "fqzfwhh", aliases: ["肺气肿", "肺纤维化"] },

  // 消化系统
  {
    id: "gi_1", name: "胃溃疡/十二指肠溃疡", category: "消化系统", pinyin: "wkysezcky", aliases: ["胃肠溃疡", "胃溃疡", "有点胃病", "慢性胃病"],
    relatedTags: ["近期有胃出血史", "幽门螺杆菌(Hp)阳性", "规律服抑酸药"]
  },
  { id: "gi_2", name: "胃食管反流病", category: "消化系统", pinyin: "wsgflb", aliases: ["反流性胃炎", "反酸", "容易恶心"] },
  { id: "gi_3", name: "慢性胃炎", category: "消化系统", pinyin: "mxwy", aliases: ["胃炎", "浅表性胃炎", "萎缩性胃炎"] },
  { id: "gi_4", name: "肠易激/炎症性肠病", category: "消化系统", pinyin: "cyjyzxcb", aliases: ["肠炎", "溃疡性结肠炎", "克罗恩病", "肠胃不好"] },

  // 肝胆与肾脏
  { id: "li_1", name: "脂肪肝", category: "肝胆与肾脏", pinyin: "zfg", aliases: ["肝脏问题"] },
  { id: "li_2", name: "胆结石/胆囊炎", category: "肝胆与肾脏", pinyin: "djsdny", aliases: ["胆结石", "胆囊手术", "胆囊切除"] },
  { id: "li_3", name: "肝硬化", category: "肝胆与肾脏", pinyin: "gyh", aliases: ["肝功能不全"], relatedTags: ["代偿期", "失代偿期", "有食管胃底静脉曲张", "凝血功能差"] },
  { id: "li_4", name: "肝功能异常", category: "肝胆与肾脏", pinyin: "ggnyc", aliases: ["转氨酶高", "肝功能不好"] },
  {
    id: "li_5", name: "慢性肾脏病", category: "肝胆与肾脏", pinyin: "mxszb", aliases: ["肾炎", "肾功能不全", "肾脏问题"],
    relatedTags: ["肾功能不全代偿期", "尿毒症期", "维持性血液透析", "腹膜透析", "肾移植术后"]
  },
  { id: "li_6", name: "肾结石/肾囊肿", category: "肝胆与肾脏", pinyin: "sjssnz", aliases: ["肾囊肿", "肾结石"] },

  // 神经与精神
  {
    id: "ns_1", name: "脑梗死/脑缺血", category: "神经与精神", pinyin: "ngsnqx", aliases: ["脑梗", "轻微脑梗", "脑血栓", "中风", "供血不足"],
    relatedTags: ["半年内新发", "陈旧性脑梗", "长期服抗凝/抗血小板药", "遗留肢体障碍"]
  },
  { id: "ns_2", name: "脑出血", category: "神经与精神", pinyin: "ncx", aliases: ["脑溢血", "中风"] },
  {
    id: "ns_3", name: "癫痫", category: "神经与精神", pinyin: "dx", aliases: ["羊癫疯", "抽搐"],
    relatedTags: ["规律服抗癫痫药", "近期有发作", "控制良好", "有家族遗传史"]
  },
  { id: "ns_4", name: "帕金森病", category: "神经与精神", pinyin: "pjsb", aliases: ["帕金森", "手抖"] },
  { id: "ns_5", name: "抑郁/焦虑症", category: "神经与精神", pinyin: "yyjlz", aliases: ["抑郁症", "焦虑症"], relatedTags: ["长期服抗抑郁/抗焦虑药"] },
  { id: "ns_6", name: "失眠/睡眠障碍", category: "神经与精神", pinyin: "smsmza", aliases: ["失眠", "睡不好", "长期吃安眠药"] },
  { id: "ns_7", name: "偏头痛", category: "神经与精神", pinyin: "ptt", aliases: ["头痛", "经常头疼"] },
  { id: "ns_8", name: "晕厥/眩晕史", category: "神经与精神", pinyin: "yjxys", aliases: ["晕倒", "头晕", "美尼尔", "晕针"] },
  { id: "ns_9", name: "认知障碍/阿尔茨海默", category: "神经与精神", pinyin: "rzzaarcm", aliases: ["老年痴呆", "记忆力差"] },

  // 泌尿与生殖
  { id: "ur_3", name: "前列腺增生", category: "泌尿与生殖", pinyin: "qlxzs", aliases: ["前列腺肥大"] },
  { id: "ur_4", name: "尿失禁", category: "泌尿与生殖", pinyin: "nsj", aliases: ["膀胱不好"] },
  { id: "ur_5", name: "泌尿系统感染", category: "泌尿与生殖", pinyin: "mnxtgr", aliases: ["尿路感染", "膀胱炎"] },

  // 骨骼与关节
  {
    id: "bo_1", name: "骨质疏松", category: "骨骼与关节", pinyin: "gzss", aliases: ["骨密度低", "骨头疏松"],
    relatedTags: ["长期服双膦酸盐类药", "近期用过抗骨质疏松针剂"]
  },
  { id: "bo_2", name: "风湿/类风湿性关节炎", category: "骨骼与关节", pinyin: "fslfssgjy", aliases: ["风湿", "关节炎", "关节不好"], relatedTags: ["长期服免疫抑制剂", "长期服激素"] },
  { id: "bo_3", name: "颈椎/腰椎病", category: "骨骼与关节", pinyin: "jzyzb", aliases: ["腰椎不好", "腰椎手术", "颈椎病", "腰间盘突出"] },
  { id: "bo_4", name: "关节置换术后", category: "骨骼与关节", pinyin: "gjzhshs", aliases: ["换关节", "髋关节置换", "膝关节置换", "人工关节"] },
  { id: "bo_5", name: "强直性脊柱炎", category: "骨骼与关节", pinyin: "qzxjzy", aliases: ["强直", "脊柱僵硬"] },

  // 血液系统
  { id: "he_1", name: "贫血", category: "血液系统", pinyin: "px", aliases: ["有点贫血", "缺铁性贫血", "血色素低"] },
  { id: "he_2", name: "血小板减少", category: "血液系统", pinyin: "xxbjs", aliases: ["血小板低", "容易出血", "紫癜"] },
  { id: "he_3", name: "凝血功能障碍", category: "血液系统", pinyin: "nxgnza", aliases: ["血友病", "凝血差", "伤口难止血"] },
  { id: "he_4", name: "白血病/淋巴瘤", category: "血液系统", pinyin: "bxblbl", aliases: ["白血病", "淋巴瘤", "血癌"] },

  // 肿瘤与免疫
  {
    id: "on_1", name: "恶性肿瘤史", category: "肿瘤与免疫", pinyin: "exzls", aliases: ["癌症", "肿瘤", "癌症术后", "胃癌", "肝癌", "肠癌", "乳腺癌", "甲状腺癌", "肾癌", "肺癌"],
    relatedTags: ["手术切除史", "化疗史", "放疗史", "靶向/免疫治疗中", "头颈部放疗史", "有家族遗传史"]
  },
  { id: "on_2", name: "良性肿瘤/息肉", category: "肿瘤与免疫", pinyin: "lxzlxr", aliases: ["息肉", "胃息肉", "囊肿"] },
  { id: "on_3", name: "免疫系统疾病", category: "肿瘤与免疫", pinyin: "myxtjb", aliases: ["红斑狼疮", "干燥综合征", "免疫力低", "自身免疫病"], relatedTags: ["长期服免疫抑制剂", "长期服激素"] },
  { id: "on_4", name: "器官移植史", category: "肿瘤与免疫", pinyin: "qgyzs", aliases: ["换肾", "换肝", "移植术后"], relatedTags: ["长期服抗排异药"] },

  // 传染病
  {
    id: "in_1", name: "乙型肝炎", category: "传染病", pinyin: "yxgy", aliases: ["乙肝", "小三阳", "大三阳"],
    relatedTags: ["乙肝携带者(肝功正常)", "活动性乙肝", "大三阳", "小三阳", "长期服抗病毒药"]
  },
  { id: "in_2", name: "丙型肝炎", category: "传染病", pinyin: "bxgy", aliases: ["丙肝", "HCV"], relatedTags: ["丙肝携带者", "已抗病毒治愈", "治疗中"] },
  { id: "in_2b", name: "甲型肝炎", category: "传染病", pinyin: "jxgy", aliases: ["甲肝", "HAV"] },
  { id: "in_2c", name: "戊型/丁型肝炎", category: "传染病", pinyin: "wxdxgy", aliases: ["戊肝", "丁肝"] },
  { id: "in_3", name: "结核病", category: "传染病", pinyin: "jhb", aliases: ["肺结核", "结核", "痨病"], relatedTags: ["活动性结核(传染期)", "已治愈", "正在抗结核治疗"] },
  { id: "in_4", name: "梅毒", category: "传染病", pinyin: "md", aliases: ["TP阳性", "梅毒血清阳性"], relatedTags: ["潜伏期", "已规范治疗"] },
  { id: "in_5", name: "艾滋病/HIV", category: "传染病", pinyin: "azbhiv", aliases: ["HIV", "艾滋", "HIV阳性", "艾滋病毒携带"], relatedTags: ["HIV携带者", "已抗病毒治疗", "免疫功能低下"] },
  { id: "in_5b", name: "淋病", category: "传染病", pinyin: "lb", aliases: ["淋菌感染", "性病"] },
  { id: "in_5c", name: "生殖器疱疹", category: "传染病", pinyin: "szqpz", aliases: ["生殖器疱疹", "性病"] },
  { id: "in_9", name: "尖锐湿疣/HPV感染", category: "传染病", pinyin: "jrsyhpv", aliases: ["HPV", "人乳头瘤病毒", "尖锐湿疣"] },
  { id: "in_6", name: "新型冠状病毒感染", category: "传染病", pinyin: "xxgzbdgr", aliases: ["新冠", "新冠阳性", "COVID"] },
  { id: "in_6b", name: "流行性感冒", category: "传染病", pinyin: "lxxgm", aliases: ["甲流", "乙流", "流感"] },
  { id: "in_6c", name: "水痘", category: "传染病", pinyin: "sd", aliases: ["水痘"] },
  { id: "in_6d", name: "流行性腮腺炎", category: "传染病", pinyin: "lxxsxy", aliases: ["腮腺炎", "挫腮腺炎"] },
  { id: "in_6e", name: "麻疹/风疹", category: "传染病", pinyin: "mzfz", aliases: ["麻疹", "风疹"] },
  { id: "in_7", name: "单纯疱疹(唇疱疹)", category: "传染病", pinyin: "dccpz", aliases: ["唇疱疹", "上火起泡", "单纯疱疹", "口角起泡"] },
  { id: "in_7b", name: "带状疱疹", category: "传染病", pinyin: "dzpz", aliases: ["带状疱疹", "缠腰龙"] },
  { id: "in_8", name: "手足口病", category: "传染病", pinyin: "szkb", aliases: ["手足口"] },
  { id: "in_10", name: "幽门螺杆菌(Hp)感染", category: "传染病", pinyin: "ymlxgjhp", aliases: ["幽门螺杆菌", "Hp阳性", "胃里有菌"] },
  { id: "in_11", name: "传染性腹泻/痢疾", category: "传染病", pinyin: "crxffljl", aliases: ["痢疾", "伤寒", "肠道传染"] },
  { id: "in_12", name: "口腔念珠菌感染", category: "传染病", pinyin: "kqnzjgr", aliases: ["鹅口疮", "真菌感染", "口腔霉菌"] },
  { id: "in_13", name: "狂犬病暴露史", category: "传染病", pinyin: "qqbblbls", aliases: ["被狗咬", "被猫抓", "狂犬疫苗"] },
  { id: "in_14", name: "疟疾史", category: "传染病", pinyin: "njs", aliases: ["疟疾", "被虫咬传染"] },
  { id: "in_15", name: "其他传染病/传染病接触史", category: "传染病", pinyin: "qtcrbjcs", aliases: ["传染病接触", "传染病史"] },

  // 口腔专科史
  { id: "de_1", name: "牙周病史", category: "口腔专科史", pinyin: "yzbs", aliases: ["牙周炎", "牙龈出血", "牙齿松动"] },
  { id: "de_2", name: "正畸史", category: "口腔专科史", pinyin: "zjs", aliases: ["牙齿矫正", "带过牙套"] },
  { id: "de_3", name: "种植史", category: "口腔专科史", pinyin: "zzs", aliases: ["种过牙", "种植牙"] },
  { id: "de_4", name: "拔牙史", category: "口腔专科史", pinyin: "bys", aliases: ["拔过牙", "拔智齿"] },
  { id: "de_5", name: "夜磨牙/紧咬牙", category: "口腔专科史", pinyin: "ymyjyjy", aliases: ["磨牙症"] },
  { id: "de_6", name: "颞下颌关节疾病", category: "口腔专科史", pinyin: "nxhgjjb", aliases: ["挂钩疼", "张口受限", "关节弹响"] },
  { id: "de_7", name: "头颈部放疗史", category: "口腔专科史", pinyin: "tjbfls", aliases: ["放疗"] }, // 牙科极重要：放疗后拔牙易引起骨坏死
  { id: "de_8", name: "局麻不良反应史", category: "口腔专科史", pinyin: "jmblfys", aliases: ["打麻药晕", "麻药过敏", "拔牙晕厥"] },
  { id: "de_9", name: "拔牙出血不止史", category: "口腔专科史", pinyin: "bycxbzs", aliases: ["拔牙后出血", "伤口难愈合", "出血不止"] },

  // 过敏与用药
  { id: "al_1", name: "青霉素过敏", category: "过敏与用药", pinyin: "qmsgm", aliases: ["抗生素过敏"] },
  { id: "al_2", name: "头孢类过敏", category: "过敏与用药", pinyin: "tblgm", aliases: ["头孢过敏"] },
  { id: "al_3", name: "麻醉药过敏", category: "过敏与用药", pinyin: "mzygm", aliases: ["局麻药过敏", "利多卡因过敏"] },
  { id: "al_4", name: "其他药物过敏", category: "过敏与用药", pinyin: "qtywgm", aliases: ["药物过敏", "磺胺过敏", "阿司匹林过敏"] },
  { id: "al_5", name: "食物/接触物过敏", category: "过敏与用药", pinyin: "swjcwgm", aliases: ["鸡蛋过敏", "海鲜过敏", "过敏体质", "湿疹", "皮炎", "金属过敏", "乳胶过敏"] },
  { id: "al_6", name: "长期服用抗凝/抗血小板药", category: "过敏与用药", pinyin: "cqfykngxxby", aliases: ["阿司匹林", "华法林", "波立维", "抗凝药", "容易出血"] },
  { id: "al_7", name: "长期服用降压/降糖/降脂药", category: "过敏与用药", pinyin: "cqfyjyjtjzy", aliases: ["高血压用药", "他汀类", "降糖药", "降压药"] },
  { id: "al_8", name: "双膦酸盐类药物史", category: "过敏与用药", pinyin: "slsylyws", aliases: ["骨质疏松药", "唑来膦酸", "阿仑膦酸钠"] }, // 牙科重要：可能引起颌骨坏死
  { id: "al_9", name: "长期服用激素/免疫抑制剂", category: "过敏与用药", pinyin: "cqfyjsmyyzj", aliases: ["长期吃激素", "强的松", "免疫抑制剂"] },

  // 其他手术与外伤
  { id: "ot_1", name: "重大手术史", category: "其他手术与外伤", pinyin: "zdsss", aliases: ["剖腹产", "阑尾炎手术", "肺部手术", "胃贲门手术", "甲状腺全切", "做过大手术"] },
  { id: "ot_2", name: "外伤史/骨折", category: "其他手术与外伤", pinyin: "wssgz", aliases: ["骨折", "车祸", "外伤"] },
  { id: "ot_3", name: "听力/视力障碍", category: "其他手术与外伤", pinyin: "tlslza", aliases: ["耳朵背", "耳鸣", "白内障", "青光眼"] },
  { id: "ot_4", name: "晕针/晕血史", category: "其他手术与外伤", pinyin: "yzyxs", aliases: ["晕针", "晕血", "怕打针"] },
  { id: "ot_5", name: "近期发热/感冒", category: "其他手术与外伤", pinyin: "jqfrgm", aliases: ["发烧", "感冒", "身体不适"] },
];
