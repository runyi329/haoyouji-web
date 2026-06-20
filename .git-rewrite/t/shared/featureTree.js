"use strict";
/**
 * 功能权限树结构定义
 *
 * 这个文件定义了整个系统的功能层级结构，用于权限管理
 * 超级管理员可以基于这个树形结构为每个家长精细化控制功能访问权限
 */
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FEATURE_TREE = void 0;
exports.buildFeatureTree = buildFeatureTree;
exports.getAllDescendantIds = getAllDescendantIds;
exports.getAllAncestorIds = getAllAncestorIds;
exports.findFeatureById = findFeatureById;
/**
 * 完整的功能树结构
 *
 * 层级1：6个大模块（游戏、健康、知识、逻辑、社交、家长）
 * 层级2：每个大模块下的子功能
 * 层级3：子功能下的细分功能
 * 层级4：细分功能下的更细功能
 */
exports.FEATURE_TREE = [
    // ============ 游戏模块 ============
    {
        id: "game",
        name: "游戏",
        parentId: null,
        level: 1,
        path: "游戏",
        displayOrder: 1,
        description: "各类益智游戏和学习游戏",
    },
    // 游戏 → 识字游戏
    {
        id: "game.character",
        name: "识字游戏",
        parentId: "game",
        level: 2,
        path: "游戏/识字游戏",
        displayOrder: 1,
    },
    {
        id: "game.character.picture",
        name: "看图识字",
        parentId: "game.character",
        level: 3,
        path: "游戏/识字游戏/看图识字",
        displayOrder: 1,
    },
    {
        id: "game.character.flash",
        name: "快闪识字",
        parentId: "game.character",
        level: 3,
        path: "游戏/识字游戏/快闪识字",
        displayOrder: 2,
    },
    {
        id: "game.character.audio",
        name: "听音识字",
        parentId: "game.character",
        level: 3,
        path: "游戏/识字游戏/听音识字",
        displayOrder: 3,
    },
    {
        id: "game.character.flip",
        name: "翻牌记字",
        parentId: "game.character",
        level: 3,
        path: "游戏/识字游戏/翻牌记字",
        displayOrder: 4,
    },
    // 游戏 → 记忆游戏
    {
        id: "game.memory",
        name: "记忆游戏",
        parentId: "game",
        level: 2,
        path: "游戏/记忆游戏",
        displayOrder: 2,
    },
    // 游戏 → 反义词游戏
    {
        id: "game.antonym",
        name: "反义词游戏",
        parentId: "game",
        level: 2,
        path: "游戏/反义词游戏",
        displayOrder: 3,
    },
    // 游戏 → 数学游戏
    {
        id: "game.math",
        name: "数学游戏",
        parentId: "game",
        level: 2,
        path: "游戏/数学游戏",
        displayOrder: 4,
    },
    // 游戏 → 20加法
    {
        id: "game.addition20",
        name: "20加法",
        parentId: "game",
        level: 2,
        path: "游戏/20加法",
        displayOrder: 5,
    },
    // 游戏 → 阅读识字
    {
        id: "game.reading",
        name: "阅读识字",
        parentId: "game",
        level: 2,
        path: "游戏/阅读识字",
        displayOrder: 6,
    },
    // ============ 健康模块 ============
    {
        id: "health",
        name: "健康",
        parentId: null,
        level: 1,
        path: "健康",
        displayOrder: 2,
        description: "健康管理和习惯养成",
    },
    // 健康 → 刷牙记录
    {
        id: "health.brushing",
        name: "刷牙记录",
        parentId: "health",
        level: 2,
        path: "健康/刷牙记录",
        displayOrder: 1,
    },
    // ============ 知识模块 ============
    {
        id: "knowledge",
        name: "知识",
        parentId: null,
        level: 1,
        path: "知识",
        displayOrder: 3,
        description: "各类知识内容和学习资料",
    },
    // 知识 → 动物
    {
        id: "knowledge.animal",
        name: "动物",
        parentId: "knowledge",
        level: 2,
        path: "知识/动物",
        displayOrder: 1,
    },
    // 知识 → 植物
    {
        id: "knowledge.plant",
        name: "植物",
        parentId: "knowledge",
        level: 2,
        path: "知识/植物",
        displayOrder: 2,
    },
    // 知识 → 科学
    {
        id: "knowledge.science",
        name: "科学",
        parentId: "knowledge",
        level: 2,
        path: "知识/科学",
        displayOrder: 3,
    },
    // 知识 → 历史
    {
        id: "knowledge.history",
        name: "历史",
        parentId: "knowledge",
        level: 2,
        path: "知识/历史",
        displayOrder: 4,
    },
    // 知识 → 地理
    {
        id: "knowledge.geography",
        name: "地理",
        parentId: "knowledge",
        level: 2,
        path: "知识/地理",
        displayOrder: 5,
    },
    // ============ 逻辑模块 ============
    {
        id: "logic",
        name: "逻辑",
        parentId: null,
        level: 1,
        path: "逻辑",
        displayOrder: 4,
        description: "逻辑思维和推理训练",
    },
    // 逻辑 → 拼图游戏
    {
        id: "logic.puzzle",
        name: "拼图游戏",
        parentId: "logic",
        level: 2,
        path: "逻辑/拼图游戏",
        displayOrder: 1,
    },
    // 逻辑 → 五子棋
    {
        id: "logic.gomoku",
        name: "五子棋",
        parentId: "logic",
        level: 2,
        path: "逻辑/五子棋",
        displayOrder: 2,
    },
    // 逻辑 → 围棋
    {
        id: "logic.go",
        name: "围棋",
        parentId: "logic",
        level: 2,
        path: "逻辑/围棋",
        displayOrder: 3,
    },
    // 逻辑 → 飞行棋
    {
        id: "logic.ludo",
        name: "飞行棋",
        parentId: "logic",
        level: 2,
        path: "逻辑/飞行棋",
        displayOrder: 4,
    },
    // 逻辑 → 中国象棋
    {
        id: "logic.chess",
        name: "中国象棋",
        parentId: "logic",
        level: 2,
        path: "逻辑/中国象棋",
        displayOrder: 5,
    },
    // ============ 社交模块 ============
    {
        id: "social",
        name: "社交",
        parentId: null,
        level: 1,
        path: "社交",
        displayOrder: 5,
        description: "社交互动和分享功能",
    },
    // 社交 → 相册
    {
        id: "social.album",
        name: "相册",
        parentId: "social",
        level: 2,
        path: "社交/相册",
        displayOrder: 1,
    },
    // 社交 → 勋章
    {
        id: "social.badge",
        name: "勋章",
        parentId: "social",
        level: 2,
        path: "社交/勋章",
        displayOrder: 2,
    },
    // 社交 → 好友记
    {
        id: "social.contacts",
        name: "好友记",
        parentId: "social",
        level: 2,
        path: "社交/好友记",
        displayOrder: 3,
        description: "人脉管理和社交互动",
    },
    // 社交 → 好友记 → 共享权限
    {
        id: "social.contacts.sharing",
        name: "好友记 - 共享权限",
        parentId: "social.contacts",
        level: 3,
        path: "社交/好友记/共享权限",
        displayOrder: 1,
        description: "允许用户分享人脉数据给其他用户",
    },
    // ============ 家长中心模块 ============
    {
        id: "parent",
        name: "家长",
        parentId: null,
        level: 1,
        path: "家长",
        displayOrder: 6,
        description: "家长专属功能",
    },
    // 家长 → 宝贝档案
    {
        id: "parent.profile",
        name: "宝贝档案",
        parentId: "parent",
        level: 2,
        path: "家长/宝贝档案",
        displayOrder: 1,
    },
    // 家长 → 宝宝词库
    {
        id: "parent.vocabulary",
        name: "宝宝词库",
        parentId: "parent",
        level: 2,
        path: "家长/宝宝词库",
        displayOrder: 2,
    },
    // 家长 → 宝宝词库 → 拍照取词
    {
        id: "parent.vocabulary.photo",
        name: "拍照取词",
        parentId: "parent.vocabulary",
        level: 3,
        path: "家长/宝宝词库/拍照取词",
        displayOrder: 1,
    },
    // 家长 → 宝宝词库 → 粘贴输入
    {
        id: "parent.vocabulary.paste",
        name: "粘贴输入",
        parentId: "parent.vocabulary",
        level: 3,
        path: "家长/宝宝词库/粘贴输入",
        displayOrder: 2,
    },
    // 家长 → 宝宝词库 → 手动输入
    {
        id: "parent.vocabulary.manual",
        name: "手动输入",
        parentId: "parent.vocabulary",
        level: 3,
        path: "家长/宝宝词库/手动输入",
        displayOrder: 3,
    },
    // 家长 → 宝宝词库 → 中文词库
    {
        id: "parent.vocabulary.chinese",
        name: "中文词库",
        parentId: "parent.vocabulary",
        level: 3,
        path: "家长/宝宝词库/中文词库",
        displayOrder: 4,
    },
    // 家长 → 宝宝词库 → 中文词库 → 字
    {
        id: "parent.vocabulary.chinese.character",
        name: "字",
        parentId: "parent.vocabulary.chinese",
        level: 4,
        path: "家长/宝宝词库/中文词库/字",
        displayOrder: 1,
    },
    // 家长 → 宝宝词库 → 中文词库 → 词
    {
        id: "parent.vocabulary.chinese.word",
        name: "词",
        parentId: "parent.vocabulary.chinese",
        level: 4,
        path: "家长/宝宝词库/中文词库/词",
        displayOrder: 2,
    },
    // 家长 → 宝宝词库 → 英文词库
    {
        id: "parent.vocabulary.english",
        name: "英文词库",
        parentId: "parent.vocabulary",
        level: 3,
        path: "家长/宝宝词库/英文词库",
        displayOrder: 5,
    },
    // 家长 → 礼品兑换
    {
        id: "parent.reward",
        name: "礼品兑换",
        parentId: "parent",
        level: 2,
        path: "家长/礼品兑换",
        displayOrder: 3,
    },
];
/**
 * 将扁平的功能列表转换为树形结构
 */
function buildFeatureTree(features) {
    var map = new Map();
    var roots = [];
    // 第一遍：创建所有节点的副本
    features.forEach(function (feature) {
        map.set(feature.id, __assign(__assign({}, feature), { children: [] }));
    });
    // 第二遍：建立父子关系
    features.forEach(function (feature) {
        var node = map.get(feature.id);
        if (feature.parentId === null) {
            roots.push(node);
        }
        else {
            var parent_1 = map.get(feature.parentId);
            if (parent_1) {
                parent_1.children = parent_1.children || [];
                parent_1.children.push(node);
            }
        }
    });
    // 递归排序
    var sortChildren = function (nodes) {
        nodes.sort(function (a, b) { return a.displayOrder - b.displayOrder; });
        nodes.forEach(function (node) {
            if (node.children && node.children.length > 0) {
                sortChildren(node.children);
            }
        });
    };
    sortChildren(roots);
    return roots;
}
/**
 * 获取指定节点的所有子孙节点ID（递归）
 */
function getAllDescendantIds(nodeId, features) {
    var result = [];
    var children = features.filter(function (f) { return f.parentId === nodeId; });
    children.forEach(function (child) {
        result.push(child.id);
        result.push.apply(result, getAllDescendantIds(child.id, features));
    });
    return result;
}
/**
 * 获取指定节点的所有祖先节点ID（递归）
 */
function getAllAncestorIds(nodeId, features) {
    var result = [];
    var node = features.find(function (f) { return f.id === nodeId; });
    if (node && node.parentId) {
        result.push(node.parentId);
        result.push.apply(result, getAllAncestorIds(node.parentId, features));
    }
    return result;
}
/**
 * 根据功能ID查找节点
 */
function findFeatureById(featureId, features) {
    return features.find(function (f) { return f.id === featureId; });
}
