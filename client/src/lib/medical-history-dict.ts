export interface MedicalHistoryItem {
  id: string;
  name: string; // 标准疾病名称
  category: string; // 所属系统分类
  pinyin: string; // 拼音首字母（用于快速搜索）
  aliases: string[]; // 同义词/俗称（用于模糊搜索匹配）
}

export const MEDICAL_HISTORY_CATEGORIES = [
  "心血管系统",
  "内分泌与代谢",
  "呼吸系统",
  "消化系统",
  "神经与精神",
  "泌尿与生殖",
  "骨骼与关节",
  "肿瘤与免疫",
  "传染病",
  "口腔专科史",
  "过敏与用药",
  "其他手术与外伤"
];

export const MEDICAL_HISTORY_DICT: MedicalHistoryItem[] = [
  // 心血管系统
  { id: "cv_1", name: "高血压", category: "心血管系统", pinyin: "gxy", aliases: ["血压高", "血压偏高", "高血压病"] },
  { id: "cv_2", name: "低血压", category: "心血管系统", pinyin: "dxy", aliases: ["血压低", "血压偏低"] },
  { id: "cv_3", name: "冠心病", category: "心血管系统", pinyin: "gxb", aliases: ["冠状动脉粥样硬化", "心肌缺血", "心绞痛"] },
  { id: "cv_4", name: "心脏支架植入史", category: "心血管系统", pinyin: "xzzjzrs", aliases: ["心脏支架", "冠脉支架", "有支架"] },
  { id: "cv_5", name: "心脏起搏器植入史", category: "心血管系统", pinyin: "xzqbqzrs", aliases: ["起搏器", "心脏起搏器"] },
  { id: "cv_6", name: "心律失常", category: "心血管系统", pinyin: "xlsc", aliases: ["心律不齐", "早搏", "房颤", "心颤", "心动过速"] },
  { id: "cv_7", name: "心力衰竭", category: "心血管系统", pinyin: "xlsj", aliases: ["心衰", "心脏扩张", "心肌病"] },
  { id: "cv_8", name: "先天性心脏病", category: "心血管系统", pinyin: "xtxxzb", aliases: ["先心病", "心脏有杂音"] },
  { id: "cv_9", name: "心脏瓣膜病", category: "心血管系统", pinyin: "xzbmb", aliases: ["二尖瓣", "心脏瓣膜手术"] },

  // 内分泌与代谢
  { id: "ed_1", name: "糖尿病", category: "内分泌与代谢", pinyin: "tnb", aliases: ["血糖高", "高血糖", "血糖偏高"] },
  { id: "ed_2", name: "低血糖", category: "内分泌与代谢", pinyin: "dxt", aliases: ["血糖低", "血糖偏低"] },
  { id: "ed_3", name: "高脂血症", category: "内分泌与代谢", pinyin: "gzxz", aliases: ["高血脂", "血脂高", "高胆固醇", "胆固醇高"] },
  { id: "ed_4", name: "甲状腺功能亢进", category: "内分泌与代谢", pinyin: "jzxgnkj", aliases: ["甲亢"] },
  { id: "ed_5", name: "甲状腺功能减退", category: "内分泌与代谢", pinyin: "jzxgnjt", aliases: ["甲减"] },
  { id: "ed_6", name: "甲状腺炎/结节", category: "内分泌与代谢", pinyin: "jzxyjj", aliases: ["桥本氏甲状腺炎", "甲状腺结节", "甲状腺瘤"] },
  { id: "ed_7", name: "痛风", category: "内分泌与代谢", pinyin: "tf", aliases: ["高尿酸", "尿酸高"] },

  // 呼吸系统
  { id: "rs_1", name: "支气管哮喘", category: "呼吸系统", pinyin: "zqgxc", aliases: ["哮喘"] },
  { id: "rs_2", name: "慢性支气管炎", category: "呼吸系统", pinyin: "mxzqgy", aliases: ["慢支", "老慢支"] },
  { id: "rs_3", name: "慢性阻塞性肺病", category: "呼吸系统", pinyin: "mxzsxfb", aliases: ["慢阻肺", "COPD"] },
  { id: "rs_4", name: "鼻炎", category: "呼吸系统", pinyin: "by", aliases: ["过敏性鼻炎", "慢性鼻炎"] },
  { id: "rs_5", name: "肺炎史", category: "呼吸系统", pinyin: "fys", aliases: ["肺炎"] },

  // 消化系统
  { id: "gi_1", name: "胃溃疡/十二指肠溃疡", category: "消化系统", pinyin: "wkysezcky", aliases: ["胃肠溃疡", "胃溃疡", "有点胃病", "慢性胃病"] },
  { id: "gi_2", name: "胃食管反流病", category: "消化系统", pinyin: "wsgflb", aliases: ["反流性胃炎", "反酸", "容易恶心"] },
  { id: "gi_3", name: "脂肪肝", category: "消化系统", pinyin: "zfg", aliases: ["肝脏问题"] },
  { id: "gi_4", name: "胆结石/胆囊炎", category: "消化系统", pinyin: "djsdny", aliases: ["胆结石", "胆囊手术"] },
  { id: "gi_5", name: "肝硬化", category: "消化系统", pinyin: "gyh", aliases: ["肝功能不全"] },

  // 神经与精神
  { id: "ns_1", name: "脑梗死/脑缺血", category: "神经与精神", pinyin: "ngsnqx", aliases: ["脑梗", "轻微脑梗", "脑血栓", "中风", "供血不足"] },
  { id: "ns_2", name: "脑出血", category: "神经与精神", pinyin: "ncx", aliases: ["脑溢血", "中风"] },
  { id: "ns_3", name: "癫痫", category: "神经与精神", pinyin: "dx", aliases: ["羊癫疯"] },
  { id: "ns_4", name: "帕金森病", category: "神经与精神", pinyin: "pjsb", aliases: ["帕金森"] },
  { id: "ns_5", name: "抑郁/焦虑症", category: "神经与精神", pinyin: "yyjlz", aliases: ["抑郁症", "焦虑症"] },

  // 泌尿与生殖
  { id: "ur_1", name: "慢性肾脏病", category: "泌尿与生殖", pinyin: "mxszb", aliases: ["肾炎", "肾功能不全", "肾脏问题"] },
  { id: "ur_2", name: "肾结石/囊肿", category: "泌尿与生殖", pinyin: "sjsnz", aliases: ["肾囊肿", "肾结石"] },
  { id: "ur_3", name: "前列腺增生", category: "泌尿与生殖", pinyin: "qlxzs", aliases: ["前列腺肥大"] },
  { id: "ur_4", name: "尿失禁", category: "泌尿与生殖", pinyin: "nsj", aliases: ["膀胱不好"] },

  // 骨骼与关节
  { id: "bo_1", name: "骨质疏松", category: "骨骼与关节", pinyin: "gzss", aliases: ["骨密度低"] },
  { id: "bo_2", name: "风湿/类风湿性关节炎", category: "骨骼与关节", pinyin: "fslfssgjy", aliases: ["风湿", "关节炎", "关节不好"] },
  { id: "bo_3", name: "颈椎/腰椎病", category: "骨骼与关节", pinyin: "jzyzb", aliases: ["腰椎不好", "腰椎手术", "颈椎病"] },

  // 肿瘤与免疫
  { id: "on_1", name: "恶性肿瘤史", category: "肿瘤与免疫", pinyin: "exzls", aliases: ["癌症", "肿瘤", "癌症术后", "胃癌", "肝癌", "肠癌", "乳腺癌", "甲状腺癌", "肾癌"] },
  { id: "on_2", name: "良性肿瘤/息肉", category: "肿瘤与免疫", pinyin: "lxzlxr", aliases: ["息肉", "胃息肉", "囊肿"] },
  { id: "on_3", name: "血液系统疾病", category: "肿瘤与免疫", pinyin: "xyxtjb", aliases: ["贫血", "有点贫血", "血小板低", "白血病"] },

  // 传染病
  { id: "in_1", name: "乙型肝炎", category: "传染病", pinyin: "yxgy", aliases: ["乙肝", "小三阳", "大三阳"] },
  { id: "in_2", name: "结核病", category: "传染病", pinyin: "jhb", aliases: ["肺结核"] },
  { id: "in_3", name: "梅毒", category: "传染病", pinyin: "md", aliases: [] },
  { id: "in_4", name: "艾滋病", category: "传染病", pinyin: "azb", aliases: ["HIV"] },

  // 过敏与用药
  { id: "al_1", name: "青霉素过敏", category: "过敏与用药", pinyin: "qmsgm", aliases: ["抗生素过敏"] },
  { id: "al_2", name: "头孢类过敏", category: "过敏与用药", pinyin: "tblgm", aliases: ["头孢过敏"] },
  { id: "al_3", name: "麻醉药过敏", category: "过敏与用药", pinyin: "mzygm", aliases: ["局麻药过敏", "利多卡因过敏"] },
  { id: "al_4", name: "其他药物过敏", category: "过敏与用药", pinyin: "qtywgm", aliases: ["药物过敏"] },
  { id: "al_5", name: "食物/接触物过敏", category: "过敏与用药", pinyin: "swjcwgm", aliases: ["鸡蛋过敏", "过敏体质", "湿疹", "皮炎"] },
  { id: "al_6", name: "长期服用抗凝/抗血小板药", category: "过敏与用药", pinyin: "cqfykngxxby", aliases: ["阿司匹林", "华法林", "抗凝药", "容易出血"] },
  { id: "al_7", name: "长期服用降压/降糖/降脂药", category: "过敏与用药", pinyin: "cqfyjyjtjzy", aliases: ["高血压用药", "他汀类", "降糖药", "降压药"] },
  { id: "al_8", name: "双膦酸盐类药物史", category: "过敏与用药", pinyin: "slsylyws", aliases: ["骨质疏松药"] }, // 牙科重要：可能引起颌骨坏死

  // 口腔专科史
  { id: "de_1", name: "牙周病史", category: "口腔专科史", pinyin: "yzbs", aliases: ["牙周炎", "牙龈出血", "牙齿松动"] },
  { id: "de_2", name: "正畸史", category: "口腔专科史", pinyin: "zjs", aliases: ["牙齿矫正", "带过牙套"] },
  { id: "de_3", name: "种植史", category: "口腔专科史", pinyin: "zzs", aliases: ["种过牙", "种植牙"] },
  { id: "de_4", name: "拔牙史", category: "口腔专科史", pinyin: "bys", aliases: ["拔过牙", "拔智齿"] },
  { id: "de_5", name: "夜磨牙/紧咬牙", category: "口腔专科史", pinyin: "ymyjyjy", aliases: ["磨牙症"] },
  { id: "de_6", name: "颞下颌关节疾病", category: "口腔专科史", pinyin: "nxhgjjb", aliases: ["挂钩疼", "张口受限", "关节弹响"] },
  { id: "de_7", name: "头颈部放疗史", category: "口腔专科史", pinyin: "tjbfls", aliases: ["放疗"] }, // 牙科极重要：放疗后拔牙易引起骨坏死

  // 其他手术与外伤
  { id: "ot_1", name: "重大手术史", category: "其他手术与外伤", pinyin: "zdsss", aliases: ["剖腹产", "阑尾炎手术", "肺部手术", "胃贲门手术", "甲状腺全切"] },
  { id: "ot_2", name: "外伤史", category: "其他手术与外伤", pinyin: "wss", aliases: ["骨折", "车祸"] },
  { id: "ot_3", name: "听力/视力障碍", category: "其他手术与外伤", pinyin: "tlslza", aliases: ["耳朵背", "耳鸣", "白内障", "青光眼"] },
];
