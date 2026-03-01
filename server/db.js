"use strict";
var __makeTemplateObject = (this && this.__makeTemplateObject) || function (cooked, raw) {
    if (Object.defineProperty) { Object.defineProperty(cooked, "raw", { value: raw }); } else { cooked.raw = raw; }
    return cooked;
};
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
exports.userInsights = void 0;
exports.setCurrentIsGuest = setCurrentIsGuest;
exports.getDb = getDb;
exports.getLedgerDb = getLedgerDb;
exports.getDbConnection = getDbConnection;
exports.upsertUser = upsertUser;
exports.getUserByOpenId = getUserByOpenId;
exports.getUserById = getUserById;
exports.getUsersByIds = getUsersByIds;
exports.updateUserLastSignedIn = updateUserLastSignedIn;
exports.updateUserLastViewedSharingAt = updateUserLastViewedSharingAt;
exports.updateUserPoints = updateUserPoints;
exports.createChildProfile = createChildProfile;
exports.getChildrenByParent = getChildrenByParent;
exports.getChildById = getChildById;
exports.updateChildPoints = updateChildPoints;
exports.createGameRecord = createGameRecord;
exports.getGameRecordsByUser = getGameRecordsByUser;
exports.getTopScores = getTopScores;
exports.createKnowledgeCategory = createKnowledgeCategory;
exports.getAllKnowledgeCategories = getAllKnowledgeCategories;
exports.updateKnowledgeCategory = updateKnowledgeCategory;
exports.deleteKnowledgeCategory = deleteKnowledgeCategory;
exports.createKnowledgeItem = createKnowledgeItem;
exports.getKnowledgeItemsByCategory = getKnowledgeItemsByCategory;
exports.getKnowledgeItemById = getKnowledgeItemById;
exports.incrementKnowledgeViewCount = incrementKnowledgeViewCount;
exports.updateKnowledgeItem = updateKnowledgeItem;
exports.deleteKnowledgeItem = deleteKnowledgeItem;
exports.createAlbum = createAlbum;
exports.getAlbumsByUser = getAlbumsByUser;
exports.getAllPublicAlbums = getAllPublicAlbums;
exports.getAlbumById = getAlbumById;
exports.updateAlbum = updateAlbum;
exports.deleteAlbum = deleteAlbum;
exports.createPhoto = createPhoto;
exports.getPhotosByAlbum = getPhotosByAlbum;
exports.getPhotoById = getPhotoById;
exports.updatePhoto = updatePhoto;
exports.deletePhoto = deletePhoto;
exports.createPhotoComment = createPhotoComment;
exports.getCommentsByPhoto = getCommentsByPhoto;
exports.createBadge = createBadge;
exports.getAllBadges = getAllBadges;
exports.getBadgeById = getBadgeById;
exports.awardBadge = awardBadge;
exports.getUserBadges = getUserBadges;
exports.createTask = createTask;
exports.getTasksByCreator = getTasksByCreator;
exports.getActiveTasks = getActiveTasks;
exports.getTaskById = getTaskById;
exports.updateTask = updateTask;
exports.completeTask = completeTask;
exports.getTaskCompletionsByUser = getTaskCompletionsByUser;
exports.createReward = createReward;
exports.getActiveRewards = getActiveRewards;
exports.getRewardsByCreator = getRewardsByCreator;
exports.getRewardById = getRewardById;
exports.updateReward = updateReward;
exports.deleteReward = deleteReward;
exports.redeemReward = redeemReward;
exports.getRedemptionsByUser = getRedemptionsByUser;
exports.updateRedemptionStatus = updateRedemptionStatus;
exports.createPointTransaction = createPointTransaction;
exports.getPointTransactionsByUser = getPointTransactionsByUser;
exports.initializeDefaultData = initializeDefaultData;
exports.getUserByUsername = getUserByUsername;
exports.createUserWithPassword = createUserWithPassword;
exports.updateUserPassword = updateUserPassword;
exports.updateUserLoginAttempts = updateUserLoginAttempts;
exports.lockUser = lockUser;
exports.unlockUser = unlockUser;
exports.recordLoginAttempt = recordLoginAttempt;
exports.getRecentLoginAttempts = getRecentLoginAttempts;
exports.getAllUsers = getAllUsers;
exports.updateUserRole = updateUserRole;
exports.getSpecialKids = getSpecialKids;
exports.getSpecialKidById = getSpecialKidById;
exports.createSpecialKid = createSpecialKid;
exports.updateSpecialKid = updateSpecialKid;
exports.updateSpecialKidStars = updateSpecialKidStars;
exports.deleteSpecialKid = deleteSpecialKid;
exports.getStarRewardRules = getStarRewardRules;
exports.getStarRewardRuleByType = getStarRewardRuleByType;
exports.createStarRewardRule = createStarRewardRule;
exports.updateStarRewardRule = updateStarRewardRule;
exports.deleteStarRewardRule = deleteStarRewardRule;
exports.createStarReward = createStarReward;
exports.getStarRewardsByKid = getStarRewardsByKid;
exports.getStarShopItems = getStarShopItems;
exports.getAllStarShopItems = getAllStarShopItems;
exports.getStarShopItemById = getStarShopItemById;
exports.createStarShopItem = createStarShopItem;
exports.updateStarShopItem = updateStarShopItem;
exports.deleteStarShopItem = deleteStarShopItem;
exports.createStarRedemption = createStarRedemption;
exports.getStarRedemptionsByKid = getStarRedemptionsByKid;
exports.getAllStarRedemptions = getAllStarRedemptions;
exports.updateStarRedemptionStatus = updateStarRedemptionStatus;
exports.initDefaultStarRewardRules = initDefaultStarRewardRules;
exports.initSpecialKids = initSpecialKids;
exports.createAntonymPair = createAntonymPair;
exports.getAllAntonymPairs = getAllAntonymPairs;
exports.getAntonymPairById = getAntonymPairById;
exports.getRandomAntonymPairs = getRandomAntonymPairs;
exports.updateAntonymPair = updateAntonymPair;
exports.deleteAntonymPair = deleteAntonymPair;
exports.createWrongQuestion = createWrongQuestion;
exports.getWrongQuestionsByKid = getWrongQuestionsByKid;
exports.markWrongQuestionReviewed = markWrongQuestionReviewed;
exports.deleteWrongQuestion = deleteWrongQuestion;
exports.getWrongQuestionStats = getWrongQuestionStats;
exports.getGameOrderPreference = getGameOrderPreference;
exports.saveGameOrderPreference = saveGameOrderPreference;
exports.getRandomCharacters = getRandomCharacters;
exports.getCharacterById = getCharacterById;
exports.getAllCharacters = getAllCharacters;
exports.createCharacter = createCharacter;
exports.updateCharacter = updateCharacter;
exports.deleteCharacter = deleteCharacter;
exports.recordCharacterLearning = recordCharacterLearning;
exports.getCharacterLearningRecords = getCharacterLearningRecords;
exports.getCharacterStats = getCharacterStats;
exports.getOrCreateFlashcardRecord = getOrCreateFlashcardRecord;
exports.incrementFlashcardKnown = incrementFlashcardKnown;
exports.incrementFlashcardForgotten = incrementFlashcardForgotten;
exports.getFlashcardRecords = getFlashcardRecords;
exports.getFlashcardRecordByCharacter = getFlashcardRecordByCharacter;
exports.createBrushingSession = createBrushingSession;
exports.getBrushingSessions = getBrushingSessions;
exports.getBrushingStats = getBrushingStats;
exports.createInvitation = createInvitation;
exports.getInvitationByCode = getInvitationByCode;
exports.validateInvitation = validateInvitation;
exports.useInvitationToRegister = useInvitationToRegister;
exports.getAllInvitations = getAllInvitations;
exports.deactivateInvitation = deactivateInvitation;
exports.getAllFamilies = getAllFamilies;
exports.getFamilyMembers = getFamilyMembers;
exports.getKidsByParent = getKidsByParent;
exports.createFamilyForParent = createFamilyForParent;
exports.updateUserFamily = updateUserFamily;
exports.updateUserRelation = updateUserRelation;
exports.deleteUsers = deleteUsers;
exports.updateUserInfo = updateUserInfo;
exports.getFamilyFeatures = getFamilyFeatures;
exports.getFamilyFeaturesByName = getFamilyFeaturesByName;
exports.upsertFamilyFeature = upsertFamilyFeature;
exports.batchUpdateFamilyFeatures = batchUpdateFamilyFeatures;
exports.getFamilyFeatureByPath = getFamilyFeatureByPath;
exports.syncFamilyFeatures = syncFamilyFeatures;
exports.batchUpdateFeaturesByPath = batchUpdateFeaturesByPath;
exports.checkFeaturePermission = checkFeaturePermission;
exports.getAllParents = getAllParents;
exports.getActiveHomeBanner = getActiveHomeBanner;
exports.upsertHomeBanner = upsertHomeBanner;
exports.getHomeBanner = getHomeBanner;
exports.getAddition20Config = getAddition20Config;
exports.upsertAddition20Config = upsertAddition20Config;
exports.saveAddition20Record = saveAddition20Record;
exports.getAddition20Records = getAddition20Records;
exports.getAddition20HighScore = getAddition20HighScore;
exports.createAddition20Challenge = createAddition20Challenge;
exports.getActiveAddition20Challenge = getActiveAddition20Challenge;
exports.updateAddition20ChallengeProgress = updateAddition20ChallengeProgress;
exports.completeAddition20Challenge = completeAddition20Challenge;
exports.pauseAddition20Challenge = pauseAddition20Challenge;
exports.resumeAddition20Challenge = resumeAddition20Challenge;
exports.cancelAddition20Challenge = cancelAddition20Challenge;
exports.getAddition20ChallengeHistory = getAddition20ChallengeHistory;
exports.getReadingStories = getReadingStories;
exports.getReadingStoryById = getReadingStoryById;
exports.createReadingStory = createReadingStory;
exports.updateReadingStory = updateReadingStory;
exports.deleteReadingStory = deleteReadingStory;
exports.createReadingRecord = createReadingRecord;
exports.updateReadingRecord = updateReadingRecord;
exports.getReadingRecords = getReadingRecords;
exports.getVocabularyMasterList = getVocabularyMasterList;
exports.getVocabularyMasterById = getVocabularyMasterById;
exports.findVocabularyMasterByWord = findVocabularyMasterByWord;
exports.createVocabularyMaster = createVocabularyMaster;
exports.updateVocabularyMaster = updateVocabularyMaster;
exports.deleteVocabularyMaster = deleteVocabularyMaster;
exports.getFamilyVocabularyList = getFamilyVocabularyList;
exports.addVocabularyToFamily = addVocabularyToFamily;
exports.removeVocabularyFromFamily = removeVocabularyFromFamily;
exports.updateFamilyVocabularyNote = updateFamilyVocabularyNote;
exports.updateFamilyVocabularyMasteryLevel = updateFamilyVocabularyMasteryLevel;
exports.getFamilyVocabularyStats = getFamilyVocabularyStats;
exports.getGameUsageStats = getGameUsageStats;
exports.getViConfigByParentUserId = getViConfigByParentUserId;
exports.upsertViConfig = upsertViConfig;
exports.deleteViConfig = deleteViConfig;
exports.getAvailableViThemes = getAvailableViThemes;
exports.getContactFieldCategories = getContactFieldCategories;
exports.createContactFieldCategory = createContactFieldCategory;
exports.deleteContactFieldCategory = deleteContactFieldCategory;
exports.getContactFieldValues = getContactFieldValues;
exports.setContactFieldValues = setContactFieldValues;
exports.getAllFieldCategories = getAllFieldCategories;
exports.addContactFieldValue = addContactFieldValue;
exports.deleteContactFieldValue = deleteContactFieldValue;
exports.getContactWithFieldValues = getContactWithFieldValues;
exports.getActiveFeatureDefinitions = getActiveFeatureDefinitions;
exports.getUserFeatureOrder = getUserFeatureOrder;
exports.saveUserFeatureOrder = saveUserFeatureOrder;
exports.upsertFeatureDefinition = upsertFeatureDefinition;
exports.getAllFeatureDefinitions = getAllFeatureDefinitions;
exports.createReminder = createReminder;
exports.getReminderById = getReminderById;
exports.getRemindersByContactId = getRemindersByContactId;
exports.updateReminder = updateReminder;
exports.deleteReminder = deleteReminder;
exports.getTodayReminderCount = getTodayReminderCount;
exports.getWeeklyReminderCount = getWeeklyReminderCount;
exports.getMonthlyReminderCount = getMonthlyReminderCount;
exports.getContactIdsWithReminders = getContactIdsWithReminders;
exports.createSharingConnection = createSharingConnection;
exports.getSharingConnection = getSharingConnection;
exports.getSharingConnectionById = getSharingConnectionById;
exports.getSharingConnectionsBySharerId = getSharingConnectionsBySharerId;
exports.getSharingConnectionsByReceiverId = getSharingConnectionsByReceiverId;
exports.deleteSharingConnection = deleteSharingConnection;
exports.createSharingPermission = createSharingPermission;
exports.getSharingPermissionsByConnectionId = getSharingPermissionsByConnectionId;
exports.upsertSharingPermission = upsertSharingPermission;
exports.deleteSharingPermissionsByConnectionId = deleteSharingPermissionsByConnectionId;
exports.searchUsersByUsername = searchUsersByUsername;
exports.getUsersByFamilyId = getUsersByFamilyId;
exports.updateUsersSharingEnabled = updateUsersSharingEnabled;
exports.getUserPreference = getUserPreference;
exports.saveHomeCardOrder = saveHomeCardOrder;
exports.saveThemeSettings = saveThemeSettings;
var mysql_core_1 = require("drizzle-orm/mysql-core");
var drizzle_orm_1 = require("drizzle-orm");
var drizzle_orm_2 = require("drizzle-orm");
var mysql2_1 = require("drizzle-orm/mysql2");
var promise_1 = require("mysql2/promise");
var schema_1 = require("../drizzle/schema");
var _db = null;
var _guestDb = null;
var _ledgerDb = null;
// 存储原始 mysql2 connection
var _connection = null;
var _guestConnection = null;
var GUEST_USER_ID = 5070293;
// 全局变量，用于存储当前请求是否是游客
var _currentIsGuest = false;
/**
 * 设置当前请求是否是游客
 */
function setCurrentIsGuest(isGuest) {
    _currentIsGuest = isGuest;
}
/**
 * 获取数据库连接
 * 游客用户使用Manus临时数据库，真实用户使用腾讯云数据库
 * @param forceGuest - 强制使用游客数据库
 */
function getDb() {
    return __awaiter(this, arguments, void 0, function (forceGuest) {
        var dbUrl, isLocalhost, connection, error_1, useDevDb, dbUrl, useDevDb_1, isTencentCloud, isLocalhost, connection, dbType, mode, error_2;
        if (forceGuest === void 0) { forceGuest = false; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!(forceGuest || _currentIsGuest)) return [3 /*break*/, 5];
                    if (!!_guestDb) return [3 /*break*/, 4];
                    dbUrl = process.env.DATABASE_URL;
                    if (!dbUrl) return [3 /*break*/, 4];
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    isLocalhost = dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1');
                    return [4 /*yield*/, promise_1.default.createConnection({
                            uri: dbUrl,
                            connectTimeout: 60000,
                            enableKeepAlive: true,
                            keepAliveInitialDelay: 0,
                            ssl: false,
                            charset: 'utf8mb4',
                        })];
                case 2:
                    connection = _a.sent();
                    _guestConnection = connection;
                    _guestDb = (0, mysql2_1.drizzle)(connection);
                    console.log("[GuestDatabase] \u6210\u529F\u8FDE\u63A5\u5230Manus\u4E34\u65F6\u6570\u636E\u5E93");
                    return [3 /*break*/, 4];
                case 3:
                    error_1 = _a.sent();
                    console.warn("[GuestDatabase] Failed to connect:", error_1);
                    _guestDb = null;
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/, _guestDb];
                case 5:
                    if (!!_db) return [3 /*break*/, 9];
                    useDevDb = process.env.USE_DEV_DB === 'true';
                    dbUrl = useDevDb
                        ? (process.env.DEV_DATABASE_URL || process.env.DATABASE_URL)
                        : (process.env.ORIGINAL_DATABASE_URL || process.env.DATABASE_URL);
                    if (!dbUrl) return [3 /*break*/, 9];
                    _a.label = 6;
                case 6:
                    _a.trys.push([6, 8, , 9]);
                    useDevDb_1 = process.env.USE_DEV_DB === 'true';
                    isTencentCloud = dbUrl.includes('124.223.54.69') || dbUrl.includes('tencentcloud');
                    isLocalhost = dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1');
                    return [4 /*yield*/, promise_1.default.createConnection({
                            uri: dbUrl,
                            connectTimeout: 60000,
                            enableKeepAlive: true,
                            keepAliveInitialDelay: 0,
                            ssl: false,
                            charset: 'utf8mb4',
                        })];
                case 7:
                    connection = _a.sent();
                    _connection = connection;
                    _db = (0, mysql2_1.drizzle)(connection);
                    dbType = "Manus数据库";
                    if (isTencentCloud)
                        dbType = "腾讯云数据库";
                    else if (isLocalhost)
                        dbType = "本地开发数据库";
                    mode = useDevDb_1 ? '开发模式' : '生产模式';
                    console.log("[Database] \u6210\u529F\u8FDE\u63A5\u5230".concat(dbType));
                    console.log("[Database] \u6A21\u5F0F: ".concat(mode));
                    console.log("[Database] \u8FDE\u63A5URL: ".concat(dbUrl.replace(/\/\/.*:.*@/, '//***:***@')));
                    return [3 /*break*/, 9];
                case 8:
                    error_2 = _a.sent();
                    console.warn("[Database] Failed to connect:", error_2);
                    _db = null;
                    return [3 /*break*/, 9];
                case 9: return [2 /*return*/, _db];
            }
        });
    });
}
/**
 * 获取账本专用数据库连接
 * 游客用户使用Manus临时数据库，真实用户使用腾讯云数据库
 */
function getLedgerDb() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            // 游客用户使用与getDb相同的数据库
            return [2 /*return*/, getDb()];
        });
    });
}
/**
 * 获取原始 mysql2 connection 对象（用于直接执行 SQL）
 * 游客用户使用Manus临时数据库，真实用户使用腾讯云数据库
 */
function getDbConnection() {
    return __awaiter(this, arguments, void 0, function (forceGuest) {
        if (forceGuest === void 0) { forceGuest = false; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: 
                // 先调用 getDb() 确保连接已创建
                return [4 /*yield*/, getDb(forceGuest)];
                case 1:
                    // 先调用 getDb() 确保连接已创建
                    _a.sent();
                    if (forceGuest || _currentIsGuest) {
                        return [2 /*return*/, _guestConnection];
                    }
                    return [2 /*return*/, _connection];
            }
        });
    });
}
// ==================== 用户相关 ====================
function upsertUser(user) {
    return __awaiter(this, void 0, void 0, function () {
        var db, values_1, updateSet_1, textFields, assignNullable, error_3;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!user.openId) {
                        throw new Error("User openId is required for upsert");
                    }
                    return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db) {
                        console.warn("[Database] Cannot upsert user: database not available");
                        return [2 /*return*/];
                    }
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    values_1 = { openId: user.openId };
                    updateSet_1 = {};
                    textFields = ["name", "email", "loginMethod", "avatar"];
                    assignNullable = function (field) {
                        var value = user[field];
                        if (value === undefined)
                            return;
                        // 将 'manus' loginMethod 映射为 'oauth' 以兼容原数据库的 enum 定义
                        if (field === 'loginMethod' && value === 'manus') {
                            value = 'oauth';
                        }
                        var normalized = value !== null && value !== void 0 ? value : null;
                        values_1[field] = normalized;
                        updateSet_1[field] = normalized;
                    };
                    textFields.forEach(assignNullable);
                    if (user.lastSignedIn !== undefined) {
                        values_1.lastSignedIn = user.lastSignedIn;
                        updateSet_1.lastSignedIn = user.lastSignedIn;
                    }
                    if (user.role !== undefined) {
                        values_1.role = user.role;
                        updateSet_1.role = user.role;
                    }
                    if (!values_1.lastSignedIn) {
                        values_1.lastSignedIn = new Date();
                    }
                    if (Object.keys(updateSet_1).length === 0) {
                        updateSet_1.lastSignedIn = new Date();
                    }
                    return [4 /*yield*/, db.insert(schema_1.users).values(values_1).onDuplicateKeyUpdate({ set: updateSet_1 })];
                case 3:
                    _a.sent();
                    return [3 /*break*/, 5];
                case 4:
                    error_3 = _a.sent();
                    console.error("[Database] Failed to upsert user:", error_3);
                    throw error_3;
                case 5: return [2 /*return*/];
            }
        });
    });
}
function getUserByOpenId(openId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, undefined];
                    return [4 /*yield*/, db.select().from(schema_1.users).where((0, drizzle_orm_2.eq)(schema_1.users.openId, openId)).limit(1)];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, result.length > 0 ? result[0] : undefined];
            }
        });
    });
}
function getUserById(id) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, undefined];
                    return [4 /*yield*/, db.select().from(schema_1.users).where((0, drizzle_orm_2.eq)(schema_1.users.id, id)).limit(1)];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, result.length > 0 ? result[0] : undefined];
            }
        });
    });
}
// 批量获取用户信息（使用 IN 查询，支持几千个用户ID）
function getUsersByIds(ids) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (ids.length === 0)
                        return [2 /*return*/, []];
                    return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, db.select().from(schema_1.users).where((0, drizzle_orm_2.inArray)(schema_1.users.id, ids))];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, result];
            }
        });
    });
}
function updateUserLastSignedIn(userId, lastSignedIn) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, db.update(schema_1.users).set({ lastSignedIn: lastSignedIn }).where((0, drizzle_orm_2.eq)(schema_1.users.id, userId))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function updateUserLastViewedSharingAt(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, db.update(schema_1.users).set({ lastViewedSharingAt: (0, drizzle_orm_1.sql)(templateObject_1 || (templateObject_1 = __makeTemplateObject(["NOW()"], ["NOW()"]))) }).where((0, drizzle_orm_2.eq)(schema_1.users.id, userId))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function updateUserPoints(userId, amount) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/];
                    return [4 /*yield*/, db.update(schema_1.users).set({ points: (0, drizzle_orm_1.sql)(templateObject_2 || (templateObject_2 = __makeTemplateObject(["points + ", ""], ["points + ", ""])), amount) }).where((0, drizzle_orm_2.eq)(schema_1.users.id, userId))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
// ==================== 孩子档案相关 ====================
function createChildProfile(data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, db.insert(schema_1.childProfiles).values(data)];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, result[0].insertId];
            }
        });
    });
}
function getChildrenByParent(parentId) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    return [2 /*return*/, db.select().from(schema_1.childProfiles).where((0, drizzle_orm_2.eq)(schema_1.childProfiles.parentId, parentId))];
            }
        });
    });
}
function getChildById(id) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, undefined];
                    return [4 /*yield*/, db.select().from(schema_1.childProfiles).where((0, drizzle_orm_2.eq)(schema_1.childProfiles.id, id)).limit(1)];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, result.length > 0 ? result[0] : undefined];
            }
        });
    });
}
function updateChildPoints(childId, amount) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/];
                    return [4 /*yield*/, db.update(schema_1.childProfiles).set({ points: (0, drizzle_orm_1.sql)(templateObject_3 || (templateObject_3 = __makeTemplateObject(["points + ", ""], ["points + ", ""])), amount) }).where((0, drizzle_orm_2.eq)(schema_1.childProfiles.id, childId))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
// ==================== 游戏记录相关 ====================
function createGameRecord(data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, db.insert(schema_1.gameRecords).values(data)];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, result[0].insertId];
            }
        });
    });
}
function getGameRecordsByUser(userId, gameType) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    if (gameType) {
                        return [2 /*return*/, db.select().from(schema_1.gameRecords)
                                .where((0, drizzle_orm_2.and)((0, drizzle_orm_2.eq)(schema_1.gameRecords.userId, userId), (0, drizzle_orm_2.eq)(schema_1.gameRecords.gameType, gameType)))
                                .orderBy((0, drizzle_orm_2.desc)(schema_1.gameRecords.completedAt))];
                    }
                    return [2 /*return*/, db.select().from(schema_1.gameRecords)
                            .where((0, drizzle_orm_2.eq)(schema_1.gameRecords.userId, userId))
                            .orderBy((0, drizzle_orm_2.desc)(schema_1.gameRecords.completedAt))];
            }
        });
    });
}
function getTopScores(gameType_1) {
    return __awaiter(this, arguments, void 0, function (gameType, limit) {
        var db;
        if (limit === void 0) { limit = 10; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    return [2 /*return*/, db.select().from(schema_1.gameRecords)
                            .where((0, drizzle_orm_2.eq)(schema_1.gameRecords.gameType, gameType))
                            .orderBy((0, drizzle_orm_2.desc)(schema_1.gameRecords.score))
                            .limit(limit)];
            }
        });
    });
}
// ==================== 知识分类相关 ====================
function createKnowledgeCategory(data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, db.insert(schema_1.knowledgeCategories).values(data)];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, result[0].insertId];
            }
        });
    });
}
function getAllKnowledgeCategories() {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    return [2 /*return*/, db.select().from(schema_1.knowledgeCategories).orderBy(schema_1.knowledgeCategories.sortOrder)];
            }
        });
    });
}
function updateKnowledgeCategory(id, data) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/];
                    return [4 /*yield*/, db.update(schema_1.knowledgeCategories).set(data).where((0, drizzle_orm_2.eq)(schema_1.knowledgeCategories.id, id))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function deleteKnowledgeCategory(id) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/];
                    return [4 /*yield*/, db.delete(schema_1.knowledgeCategories).where((0, drizzle_orm_2.eq)(schema_1.knowledgeCategories.id, id))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
// ==================== 知识内容相关 ====================
function createKnowledgeItem(data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, db.insert(schema_1.knowledgeItems).values(data)];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, result[0].insertId];
            }
        });
    });
}
function getKnowledgeItemsByCategory(categoryId) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    return [2 /*return*/, db.select().from(schema_1.knowledgeItems)
                            .where((0, drizzle_orm_2.and)((0, drizzle_orm_2.eq)(schema_1.knowledgeItems.categoryId, categoryId), (0, drizzle_orm_2.eq)(schema_1.knowledgeItems.isPublished, true)))
                            .orderBy((0, drizzle_orm_2.desc)(schema_1.knowledgeItems.createdAt))];
            }
        });
    });
}
function getKnowledgeItemById(id) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, undefined];
                    return [4 /*yield*/, db.select().from(schema_1.knowledgeItems).where((0, drizzle_orm_2.eq)(schema_1.knowledgeItems.id, id)).limit(1)];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, result.length > 0 ? result[0] : undefined];
            }
        });
    });
}
function incrementKnowledgeViewCount(id) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/];
                    return [4 /*yield*/, db.update(schema_1.knowledgeItems).set({ viewCount: (0, drizzle_orm_1.sql)(templateObject_4 || (templateObject_4 = __makeTemplateObject(["viewCount + 1"], ["viewCount + 1"]))) }).where((0, drizzle_orm_2.eq)(schema_1.knowledgeItems.id, id))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function updateKnowledgeItem(id, data) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/];
                    return [4 /*yield*/, db.update(schema_1.knowledgeItems).set(data).where((0, drizzle_orm_2.eq)(schema_1.knowledgeItems.id, id))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function deleteKnowledgeItem(id) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/];
                    return [4 /*yield*/, db.delete(schema_1.knowledgeItems).where((0, drizzle_orm_2.eq)(schema_1.knowledgeItems.id, id))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
// ==================== 相册相关 ====================
function createAlbum(data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, db.insert(schema_1.albums).values(data)];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, result[0].insertId];
            }
        });
    });
}
function getAlbumsByUser(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    return [2 /*return*/, db.select().from(schema_1.albums).where((0, drizzle_orm_2.eq)(schema_1.albums.userId, userId)).orderBy((0, drizzle_orm_2.desc)(schema_1.albums.createdAt))];
            }
        });
    });
}
function getAllPublicAlbums() {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    return [2 /*return*/, db.select().from(schema_1.albums).orderBy((0, drizzle_orm_2.desc)(schema_1.albums.createdAt))];
            }
        });
    });
}
function getAlbumById(id) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, undefined];
                    return [4 /*yield*/, db.select().from(schema_1.albums).where((0, drizzle_orm_2.eq)(schema_1.albums.id, id)).limit(1)];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, result.length > 0 ? result[0] : undefined];
            }
        });
    });
}
function updateAlbum(id, data) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/];
                    return [4 /*yield*/, db.update(schema_1.albums).set(data).where((0, drizzle_orm_2.eq)(schema_1.albums.id, id))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function deleteAlbum(id) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/];
                    return [4 /*yield*/, db.delete(schema_1.albums).where((0, drizzle_orm_2.eq)(schema_1.albums.id, id))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
// ==================== 照片相关 ====================
function createPhoto(data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, db.insert(schema_1.photos).values(data)];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, result[0].insertId];
            }
        });
    });
}
function getPhotosByAlbum(albumId) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    return [2 /*return*/, db.select().from(schema_1.photos).where((0, drizzle_orm_2.eq)(schema_1.photos.albumId, albumId)).orderBy((0, drizzle_orm_2.desc)(schema_1.photos.createdAt))];
            }
        });
    });
}
function getPhotoById(id) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, undefined];
                    return [4 /*yield*/, db.select().from(schema_1.photos).where((0, drizzle_orm_2.eq)(schema_1.photos.id, id)).limit(1)];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, result.length > 0 ? result[0] : undefined];
            }
        });
    });
}
function updatePhoto(id, data) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/];
                    return [4 /*yield*/, db.update(schema_1.photos).set(data).where((0, drizzle_orm_2.eq)(schema_1.photos.id, id))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function deletePhoto(id) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/];
                    return [4 /*yield*/, db.delete(schema_1.photos).where((0, drizzle_orm_2.eq)(schema_1.photos.id, id))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
// ==================== 照片评论相关 ====================
function createPhotoComment(data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, db.insert(schema_1.photoComments).values(data)];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, result[0].insertId];
            }
        });
    });
}
function getCommentsByPhoto(photoId) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    return [2 /*return*/, db.select().from(schema_1.photoComments).where((0, drizzle_orm_2.eq)(schema_1.photoComments.photoId, photoId)).orderBy((0, drizzle_orm_2.desc)(schema_1.photoComments.createdAt))];
            }
        });
    });
}
// ==================== 勋章相关 ====================
function createBadge(data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, db.insert(schema_1.badges).values(data)];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, result[0].insertId];
            }
        });
    });
}
function getAllBadges() {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    return [2 /*return*/, db.select().from(schema_1.badges)];
            }
        });
    });
}
function getBadgeById(id) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, undefined];
                    return [4 /*yield*/, db.select().from(schema_1.badges).where((0, drizzle_orm_2.eq)(schema_1.badges.id, id)).limit(1)];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, result.length > 0 ? result[0] : undefined];
            }
        });
    });
}
function awardBadge(data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, db.insert(schema_1.userBadges).values(data)];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, result[0].insertId];
            }
        });
    });
}
function getUserBadges(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    return [2 /*return*/, db.select().from(schema_1.userBadges).where((0, drizzle_orm_2.eq)(schema_1.userBadges.userId, userId))];
            }
        });
    });
}
// ==================== 任务相关 ====================
function createTask(data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, db.insert(schema_1.tasks).values(data)];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, result[0].insertId];
            }
        });
    });
}
function getTasksByCreator(createdBy) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    return [2 /*return*/, db.select().from(schema_1.tasks).where((0, drizzle_orm_2.eq)(schema_1.tasks.createdBy, createdBy)).orderBy((0, drizzle_orm_2.desc)(schema_1.tasks.createdAt))];
            }
        });
    });
}
function getActiveTasks() {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    return [2 /*return*/, db.select().from(schema_1.tasks).where((0, drizzle_orm_2.eq)(schema_1.tasks.isActive, true))];
            }
        });
    });
}
function getTaskById(id) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, undefined];
                    return [4 /*yield*/, db.select().from(schema_1.tasks).where((0, drizzle_orm_2.eq)(schema_1.tasks.id, id)).limit(1)];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, result.length > 0 ? result[0] : undefined];
            }
        });
    });
}
function updateTask(id, data) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/];
                    return [4 /*yield*/, db.update(schema_1.tasks).set(data).where((0, drizzle_orm_2.eq)(schema_1.tasks.id, id))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function completeTask(data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, db.insert(schema_1.taskCompletions).values(data)];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, result[0].insertId];
            }
        });
    });
}
function getTaskCompletionsByUser(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    return [2 /*return*/, db.select().from(schema_1.taskCompletions).where((0, drizzle_orm_2.eq)(schema_1.taskCompletions.userId, userId)).orderBy((0, drizzle_orm_2.desc)(schema_1.taskCompletions.completedAt))];
            }
        });
    });
}
// ==================== 奖品相关 ====================
function createReward(data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, db.insert(schema_1.rewards).values(data)];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, result[0].insertId];
            }
        });
    });
}
function getActiveRewards() {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    return [2 /*return*/, db.select().from(schema_1.rewards).where((0, drizzle_orm_2.eq)(schema_1.rewards.isActive, true))];
            }
        });
    });
}
function getRewardsByCreator(creatorId) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    return [2 /*return*/, db.select().from(schema_1.rewards).where((0, drizzle_orm_2.eq)(schema_1.rewards.createdBy, creatorId))];
            }
        });
    });
}
function getRewardById(id) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, undefined];
                    return [4 /*yield*/, db.select().from(schema_1.rewards).where((0, drizzle_orm_2.eq)(schema_1.rewards.id, id)).limit(1)];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, result.length > 0 ? result[0] : undefined];
            }
        });
    });
}
function updateReward(id, data) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/];
                    return [4 /*yield*/, db.update(schema_1.rewards).set(data).where((0, drizzle_orm_2.eq)(schema_1.rewards.id, id))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function deleteReward(id) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/];
                    return [4 /*yield*/, db.delete(schema_1.rewards).where((0, drizzle_orm_2.eq)(schema_1.rewards.id, id))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function redeemReward(data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, db.insert(schema_1.rewardRedemptions).values(data)];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, result[0].insertId];
            }
        });
    });
}
function getRedemptionsByUser(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    return [2 /*return*/, db.select().from(schema_1.rewardRedemptions).where((0, drizzle_orm_2.eq)(schema_1.rewardRedemptions.userId, userId)).orderBy((0, drizzle_orm_2.desc)(schema_1.rewardRedemptions.redeemedAt))];
            }
        });
    });
}
function updateRedemptionStatus(id, status) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/];
                    return [4 /*yield*/, db.update(schema_1.rewardRedemptions).set({ status: status, processedAt: new Date() }).where((0, drizzle_orm_2.eq)(schema_1.rewardRedemptions.id, id))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
// ==================== 积分交易相关 ====================
function createPointTransaction(data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, db.insert(schema_1.pointTransactions).values(data)];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, result[0].insertId];
            }
        });
    });
}
function getPointTransactionsByUser(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    return [2 /*return*/, db.select().from(schema_1.pointTransactions).where((0, drizzle_orm_2.eq)(schema_1.pointTransactions.userId, userId)).orderBy((0, drizzle_orm_2.desc)(schema_1.pointTransactions.createdAt))];
            }
        });
    });
}
// ==================== 初始化默认数据 ====================
function initializeDefaultData() {
    return __awaiter(this, void 0, void 0, function () {
        var db, existingCategories, defaultCategories, _i, defaultCategories_1, cat, contactFieldCategories, existingFieldCategories, defaultFieldCategories, _a, defaultFieldCategories_1, name_1, existingBadges, defaultBadges, _b, defaultBadges_1, badge;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _c.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/];
                    return [4 /*yield*/, getAllKnowledgeCategories()];
                case 2:
                    existingCategories = _c.sent();
                    if (!(existingCategories.length === 0)) return [3 /*break*/, 6];
                    defaultCategories = [
                        { name: "动物世界", icon: "🦁", color: "#FF9500", description: "探索神奇的动物王国", sortOrder: 1 },
                        { name: "植物花园", icon: "🌸", color: "#34C759", description: "认识美丽的植物世界", sortOrder: 2 },
                        { name: "太空探索", icon: "🚀", color: "#5856D6", description: "遨游浩瀚的宇宙星空", sortOrder: 3 },
                        { name: "科学实验", icon: "🔬", color: "#007AFF", description: "有趣的科学小实验", sortOrder: 4 },
                        { name: "历史故事", icon: "📜", color: "#AF52DE", description: "精彩的历史小故事", sortOrder: 5 },
                        { name: "艺术天地", icon: "🎨", color: "#FF2D55", description: "发现艺术的魅力", sortOrder: 6 },
                    ];
                    _i = 0, defaultCategories_1 = defaultCategories;
                    _c.label = 3;
                case 3:
                    if (!(_i < defaultCategories_1.length)) return [3 /*break*/, 6];
                    cat = defaultCategories_1[_i];
                    return [4 /*yield*/, createKnowledgeCategory(cat)];
                case 4:
                    _c.sent();
                    _c.label = 5;
                case 5:
                    _i++;
                    return [3 /*break*/, 3];
                case 6: return [4 /*yield*/, Promise.resolve().then(function () { return require('../drizzle/schema'); })];
                case 7:
                    contactFieldCategories = (_c.sent()).contactFieldCategories;
                    return [4 /*yield*/, db.select().from(contactFieldCategories).limit(1)];
                case 8:
                    existingFieldCategories = _c.sent();
                    if (!(existingFieldCategories.length === 0)) return [3 /*break*/, 13];
                    defaultFieldCategories = [
                        '手机', '邮箱', '快递地址', '银行账号', '公司名称', '开票信息'
                    ];
                    _a = 0, defaultFieldCategories_1 = defaultFieldCategories;
                    _c.label = 9;
                case 9:
                    if (!(_a < defaultFieldCategories_1.length)) return [3 /*break*/, 12];
                    name_1 = defaultFieldCategories_1[_a];
                    return [4 /*yield*/, db.insert(contactFieldCategories).values({
                            name: name_1,
                            icon: '',
                            parentCategoryId: null,
                            parentUserId: null,
                            createdAt: new Date(),
                        })];
                case 10:
                    _c.sent();
                    _c.label = 11;
                case 11:
                    _a++;
                    return [3 /*break*/, 9];
                case 12:
                    console.log("\u521D\u59CB\u5316\u4E86 ".concat(defaultFieldCategories.length, " \u4E2A\u8054\u7CFB\u4EBA\u5B57\u6BB5\u5206\u7C7B"));
                    _c.label = 13;
                case 13: return [4 /*yield*/, getAllBadges()];
                case 14:
                    existingBadges = _c.sent();
                    if (!(existingBadges.length === 0)) return [3 /*break*/, 18];
                    defaultBadges = [
                        { name: "初来乍到", icon: "🌟", color: "#FFD700", description: "完成首次登录", pointsRequired: 0 },
                        { name: "游戏达人", icon: "🎮", color: "#FF6B6B", description: "完成10场游戏", pointsRequired: 100 },
                        { name: "知识小博士", icon: "📚", color: "#4ECDC4", description: "阅读20篇知识", pointsRequired: 200 },
                        { name: "记忆大师", icon: "🧠", color: "#9B59B6", description: "记忆游戏获得满分", pointsRequired: 150 },
                        { name: "数学天才", icon: "🔢", color: "#3498DB", description: "数学游戏连续答对10题", pointsRequired: 180 },
                        { name: "积分王者", icon: "👑", color: "#F1C40F", description: "累计获得1000积分", pointsRequired: 1000 },
                    ];
                    _b = 0, defaultBadges_1 = defaultBadges;
                    _c.label = 15;
                case 15:
                    if (!(_b < defaultBadges_1.length)) return [3 /*break*/, 18];
                    badge = defaultBadges_1[_b];
                    return [4 /*yield*/, createBadge(badge)];
                case 16:
                    _c.sent();
                    _c.label = 17;
                case 17:
                    _b++;
                    return [3 /*break*/, 15];
                case 18: return [2 /*return*/];
            }
        });
    });
}
// ==================== 用户名密码登录相关 ====================
var schema_2 = require("../drizzle/schema");
function getUserByUsername(username) {
    return __awaiter(this, void 0, void 0, function () {
        var isGuest, db, result, error_4;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    isGuest = username === 'guest_dev';
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 4, , 5]);
                    return [4 /*yield*/, getDb(isGuest)];
                case 2:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, undefined];
                    return [4 /*yield*/, db.select().from(schema_1.users).where((0, drizzle_orm_2.eq)(schema_1.users.username, username))];
                case 3:
                    result = (_a.sent())[0];
                    // 如果是游客用户且未找到，抛出详细错误
                    if (isGuest && !result) {
                        throw new Error("\u6E38\u5BA2\u7528\u6237\u4E0D\u5B58\u5728\u4E8EManus\u6570\u636E\u5E93\u4E2D\uFF01\u8BF7\u68C0\u67E5\u662F\u5426\u6B63\u786E\u521D\u59CB\u5316\u6E38\u5BA2\u6570\u636E\u3002");
                    }
                    return [2 /*return*/, result || undefined];
                case 4:
                    error_4 = _a.sent();
                    // 如果是游客用户，抛出详细错误
                    if (isGuest) {
                        throw new Error("\u67E5\u8BE2\u6E38\u5BA2\u7528\u6237\u5931\u8D25: ".concat(error_4 instanceof Error ? error_4.message : String(error_4)));
                    }
                    throw error_4;
                case 5: return [2 /*return*/];
            }
        });
    });
}
function createUserWithPassword(data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, openId, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, null];
                    openId = "local_".concat(data.username, "_").concat(Date.now());
                    return [4 /*yield*/, db.insert(schema_1.users).values({
                            openId: openId,
                            username: data.username,
                            passwordHash: data.passwordHash,
                            name: data.name || data.username,
                            email: data.email,
                            role: data.role || "parent",
                            loginMethod: "password",
                        })];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, result[0].insertId];
            }
        });
    });
}
function updateUserPassword(userId, passwordHash) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/];
                    return [4 /*yield*/, db.update(schema_1.users).set({ passwordHash: passwordHash }).where((0, drizzle_orm_2.eq)(schema_1.users.id, userId))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function updateUserLoginAttempts(userId, attempts, lastFailed) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/];
                    return [4 /*yield*/, db.update(schema_1.users).set({
                            failedLoginAttempts: attempts,
                            lastFailedLogin: lastFailed,
                        }).where((0, drizzle_orm_2.eq)(schema_1.users.id, userId))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function lockUser(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/];
                    return [4 /*yield*/, db.update(schema_1.users).set({ isLocked: true }).where((0, drizzle_orm_2.eq)(schema_1.users.id, userId))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function unlockUser(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/];
                    return [4 /*yield*/, db.update(schema_1.users).set({ isLocked: false, failedLoginAttempts: 0 }).where((0, drizzle_orm_2.eq)(schema_1.users.id, userId))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function recordLoginAttempt(data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, db.insert(schema_2.loginAttempts).values(data)];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, result[0].insertId];
            }
        });
    });
}
function getRecentLoginAttempts(ipAddress_1) {
    return __awaiter(this, arguments, void 0, function (ipAddress, minutes) {
        if (minutes === void 0) { minutes = 30; }
        return __generator(this, function (_a) {
            // 暂时禁用login_attempts检查，避免类型转换问题
            // TODO: 修复timestamp字段的比较逻辑
            return [2 /*return*/, []];
        });
    });
}
function getAllUsers() {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    return [2 /*return*/, db.select({
                            id: schema_1.users.id,
                            username: schema_1.users.username,
                            name: schema_1.users.name,
                            email: schema_1.users.email,
                            role: schema_1.users.role,
                            points: schema_1.users.points,
                            isLocked: schema_1.users.isLocked,
                            familyId: schema_1.users.familyId,
                            createdAt: schema_1.users.createdAt,
                            lastSignedIn: schema_1.users.lastSignedIn,
                        }).from(schema_1.users).orderBy((0, drizzle_orm_2.desc)(schema_1.users.createdAt))];
            }
        });
    });
}
function updateUserRole(userId, role) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/];
                    return [4 /*yield*/, db.update(schema_1.users).set({ role: role }).where((0, drizzle_orm_2.eq)(schema_1.users.id, userId))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
// ==================== 喜喜旺旺专属档案相关 ====================
function getSpecialKids() {
    return __awaiter(this, void 0, void 0, function () {
        var db, kids, result;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    return [4 /*yield*/, db.select().from(schema_1.specialKids).orderBy(schema_1.specialKids.position)];
                case 2:
                    kids = _a.sent();
                    return [4 /*yield*/, Promise.all(kids.map(function (kid) { return __awaiter(_this, void 0, void 0, function () {
                            var user;
                            var _a, _b, _c;
                            return __generator(this, function (_d) {
                                switch (_d.label) {
                                    case 0:
                                        if (!kid.userId) return [3 /*break*/, 2];
                                        return [4 /*yield*/, db.select({
                                                username: schema_1.users.username,
                                                avatar: schema_1.users.avatar,
                                                points: schema_1.users.points,
                                            }).from(schema_1.users).where((0, drizzle_orm_2.eq)(schema_1.users.id, kid.userId)).limit(1)];
                                    case 1:
                                        user = _d.sent();
                                        return [2 /*return*/, __assign(__assign({}, kid), { username: ((_a = user[0]) === null || _a === void 0 ? void 0 : _a.username) || null, avatar: ((_b = user[0]) === null || _b === void 0 ? void 0 : _b.avatar) || kid.avatar, stars: ((_c = user[0]) === null || _c === void 0 ? void 0 : _c.points) || kid.stars })];
                                    case 2: return [2 /*return*/, __assign(__assign({}, kid), { username: null })];
                                }
                            });
                        }); }))];
                case 3:
                    result = _a.sent();
                    return [2 /*return*/, result];
            }
        });
    });
}
function getSpecialKidById(id) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, undefined];
                    return [4 /*yield*/, db.select().from(schema_1.specialKids).where((0, drizzle_orm_2.eq)(schema_1.specialKids.id, id)).limit(1)];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, result.length > 0 ? result[0] : undefined];
            }
        });
    });
}
function createSpecialKid(data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result, insertId, kid;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, db.insert(schema_1.specialKids).values(data)];
                case 2:
                    result = _a.sent();
                    insertId = result[0].insertId;
                    return [4 /*yield*/, db.select().from(schema_1.specialKids).where((0, drizzle_orm_2.eq)(schema_1.specialKids.id, insertId)).limit(1)];
                case 3:
                    kid = _a.sent();
                    return [2 /*return*/, kid[0] || null];
            }
        });
    });
}
function updateSpecialKid(id, data) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/];
                    return [4 /*yield*/, db.update(schema_1.specialKids).set(data).where((0, drizzle_orm_2.eq)(schema_1.specialKids.id, id))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function updateSpecialKidStars(kidId, amount) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/];
                    return [4 /*yield*/, db.update(schema_1.specialKids).set({ stars: (0, drizzle_orm_1.sql)(templateObject_5 || (templateObject_5 = __makeTemplateObject(["stars + ", ""], ["stars + ", ""])), amount) }).where((0, drizzle_orm_2.eq)(schema_1.specialKids.id, kidId))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function deleteSpecialKid(id) {
    return __awaiter(this, void 0, void 0, function () {
        var db, kid, userId;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/];
                    return [4 /*yield*/, db.select().from(schema_1.specialKids).where((0, drizzle_orm_2.eq)(schema_1.specialKids.id, id)).limit(1)];
                case 2:
                    kid = _a.sent();
                    if (kid.length === 0)
                        return [2 /*return*/];
                    userId = kid[0].userId;
                    // 删除special_kids表中的记录
                    return [4 /*yield*/, db.delete(schema_1.specialKids).where((0, drizzle_orm_2.eq)(schema_1.specialKids.id, id))];
                case 3:
                    // 删除special_kids表中的记录
                    _a.sent();
                    if (!userId) return [3 /*break*/, 5];
                    return [4 /*yield*/, db.delete(schema_1.users).where((0, drizzle_orm_2.eq)(schema_1.users.id, userId))];
                case 4:
                    _a.sent();
                    _a.label = 5;
                case 5: return [2 /*return*/];
            }
        });
    });
}
// ==================== 奖励规则相关 ====================
function getStarRewardRules() {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    return [2 /*return*/, db.select().from(schema_1.starRewardRules).orderBy(schema_1.starRewardRules.activityType)];
            }
        });
    });
}
function getStarRewardRuleByType(activityType) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, undefined];
                    return [4 /*yield*/, db.select().from(schema_1.starRewardRules).where((0, drizzle_orm_2.eq)(schema_1.starRewardRules.activityType, activityType)).limit(1)];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, result.length > 0 ? result[0] : undefined];
            }
        });
    });
}
function createStarRewardRule(data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, db.insert(schema_1.starRewardRules).values(data)];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, result[0].insertId];
            }
        });
    });
}
function updateStarRewardRule(id, data) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/];
                    return [4 /*yield*/, db.update(schema_1.starRewardRules).set(data).where((0, drizzle_orm_2.eq)(schema_1.starRewardRules.id, id))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function deleteStarRewardRule(id) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/];
                    return [4 /*yield*/, db.delete(schema_1.starRewardRules).where((0, drizzle_orm_2.eq)(schema_1.starRewardRules.id, id))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
// ==================== 五角星奖励记录相关 ====================
function createStarReward(data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, db.insert(schema_1.starRewards).values(data)];
                case 2:
                    result = _a.sent();
                    // 同时更新孩子的星星总数
                    return [4 /*yield*/, updateSpecialKidStars(data.kidId, data.starsEarned)];
                case 3:
                    // 同时更新孩子的星星总数
                    _a.sent();
                    return [2 /*return*/, result[0].insertId];
            }
        });
    });
}
function getStarRewardsByKid(kidId) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    return [2 /*return*/, db.select().from(schema_1.starRewards).where((0, drizzle_orm_2.eq)(schema_1.starRewards.kidId, kidId)).orderBy((0, drizzle_orm_2.desc)(schema_1.starRewards.createdAt))];
            }
        });
    });
}
// ==================== 星星商城相关 ====================
function getStarShopItems() {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    return [2 /*return*/, db.select().from(schema_1.starShopItems).where((0, drizzle_orm_2.eq)(schema_1.starShopItems.isActive, true)).orderBy(schema_1.starShopItems.starsCost)];
            }
        });
    });
}
function getAllStarShopItems() {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    return [2 /*return*/, db.select().from(schema_1.starShopItems).orderBy(schema_1.starShopItems.starsCost)];
            }
        });
    });
}
function getStarShopItemById(id) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, undefined];
                    return [4 /*yield*/, db.select().from(schema_1.starShopItems).where((0, drizzle_orm_2.eq)(schema_1.starShopItems.id, id)).limit(1)];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, result.length > 0 ? result[0] : undefined];
            }
        });
    });
}
function createStarShopItem(data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, db.insert(schema_1.starShopItems).values(data)];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, result[0].insertId];
            }
        });
    });
}
function updateStarShopItem(id, data) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/];
                    return [4 /*yield*/, db.update(schema_1.starShopItems).set(data).where((0, drizzle_orm_2.eq)(schema_1.starShopItems.id, id))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function deleteStarShopItem(id) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/];
                    return [4 /*yield*/, db.delete(schema_1.starShopItems).where((0, drizzle_orm_2.eq)(schema_1.starShopItems.id, id))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
// ==================== 星星兑换记录相关 ====================
function createStarRedemption(data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, db.insert(schema_1.starRedemptions).values(data)];
                case 2:
                    result = _a.sent();
                    // 扣除孩子的星星
                    return [4 /*yield*/, updateSpecialKidStars(data.kidId, -data.starsSpent)];
                case 3:
                    // 扣除孩子的星星
                    _a.sent();
                    return [2 /*return*/, result[0].insertId];
            }
        });
    });
}
function getStarRedemptionsByKid(kidId) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    return [2 /*return*/, db.select().from(schema_1.starRedemptions).where((0, drizzle_orm_2.eq)(schema_1.starRedemptions.kidId, kidId)).orderBy((0, drizzle_orm_2.desc)(schema_1.starRedemptions.redeemedAt))];
            }
        });
    });
}
function getAllStarRedemptions() {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    return [2 /*return*/, db.select().from(schema_1.starRedemptions).orderBy((0, drizzle_orm_2.desc)(schema_1.starRedemptions.redeemedAt))];
            }
        });
    });
}
function updateStarRedemptionStatus(id, status) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/];
                    return [4 /*yield*/, db.update(schema_1.starRedemptions).set({ status: status, processedAt: new Date() }).where((0, drizzle_orm_2.eq)(schema_1.starRedemptions.id, id))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
// 初始化默认奖励规则
function initDefaultStarRewardRules() {
    return __awaiter(this, void 0, void 0, function () {
        var db, defaultRules, _i, defaultRules_1, rule, existing;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/];
                    defaultRules = [
                        { activityType: "chess_win", activityName: "国际象棋获胜", starsReward: 5, description: "下国际象棋赢一局" },
                        { activityType: "go_win", activityName: "围棋获胜", starsReward: 5, description: "下围棋赢一局" },
                        { activityType: "gomoku_win", activityName: "五子棋获胜", starsReward: 3, description: "下五子棋赢一局" },
                        { activityType: "ludo_win", activityName: "飞行棋获胜", starsReward: 3, description: "下飞行棋赢一局" },
                        { activityType: "antonym_win", activityName: "反义词游戏获胜", starsReward: 1, description: "反义词游戏全部答对" },
                        { activityType: "memory_complete", activityName: "记忆翻牌完成", starsReward: 2, description: "完成一局记忆翻牌游戏" },
                        { activityType: "puzzle_complete", activityName: "拼图完成", starsReward: 2, description: "完成一局拼图游戏" },
                        { activityType: "math_correct", activityName: "数学答对", starsReward: 1, description: "数学问答答对一题" },
                        { activityType: "knowledge_read", activityName: "阅读知识", starsReward: 1, description: "阅读一篇知识文章" },
                        { activityType: "brushing_complete", activityName: "完成刷牙", starsReward: 1, description: "完成一次刷牙任务" },
                    ];
                    _i = 0, defaultRules_1 = defaultRules;
                    _a.label = 2;
                case 2:
                    if (!(_i < defaultRules_1.length)) return [3 /*break*/, 6];
                    rule = defaultRules_1[_i];
                    return [4 /*yield*/, getStarRewardRuleByType(rule.activityType)];
                case 3:
                    existing = _a.sent();
                    if (!!existing) return [3 /*break*/, 5];
                    return [4 /*yield*/, createStarRewardRule(rule)];
                case 4:
                    _a.sent();
                    _a.label = 5;
                case 5:
                    _i++;
                    return [3 /*break*/, 2];
                case 6: return [2 /*return*/];
            }
        });
    });
}
// 初始化喵喵和旺旺
function initSpecialKids() {
    return __awaiter(this, void 0, void 0, function () {
        var db, kids;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/];
                    return [4 /*yield*/, getSpecialKids()];
                case 2:
                    kids = _a.sent();
                    if (!(kids.length === 0)) return [3 /*break*/, 5];
                    return [4 /*yield*/, createSpecialKid({ name: "喵喵", position: "left", stars: 0 })];
                case 3:
                    _a.sent();
                    return [4 /*yield*/, createSpecialKid({ name: "旺旺", position: "right", stars: 0 })];
                case 4:
                    _a.sent();
                    _a.label = 5;
                case 5: return [2 /*return*/];
            }
        });
    });
}
// ==================== 反义词相关 ====================
function createAntonymPair(data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, exactDuplicate, reverseDuplicate, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, db.select().from(schema_1.antonyms)
                            .where((0, drizzle_orm_2.and)((0, drizzle_orm_2.eq)(schema_1.antonyms.word, data.word), (0, drizzle_orm_2.eq)(schema_1.antonyms.antonym, data.antonym), (0, drizzle_orm_2.eq)(schema_1.antonyms.isActive, true)))];
                case 2:
                    exactDuplicate = _a.sent();
                    if (exactDuplicate.length > 0) {
                        throw new Error("\u53CD\u4E49\u8BCD\u5BF9 \"".concat(data.word, " \u2194 ").concat(data.antonym, "\" \u5DF2\u5B58\u5728"));
                    }
                    return [4 /*yield*/, db.select().from(schema_1.antonyms)
                            .where((0, drizzle_orm_2.and)((0, drizzle_orm_2.eq)(schema_1.antonyms.word, data.antonym), (0, drizzle_orm_2.eq)(schema_1.antonyms.antonym, data.word), (0, drizzle_orm_2.eq)(schema_1.antonyms.isActive, true)))];
                case 3:
                    reverseDuplicate = _a.sent();
                    if (reverseDuplicate.length > 0) {
                        throw new Error("\u53CD\u4E49\u8BCD\u5BF9 \"".concat(data.antonym, " \u2194 ").concat(data.word, "\" \u5DF2\u5B58\u5728\uFF08\u4E0E \"").concat(data.word, " \u2194 ").concat(data.antonym, "\" \u91CD\u590D\uFF09"));
                    }
                    return [4 /*yield*/, db.insert(schema_1.antonyms).values(data)];
                case 4:
                    result = _a.sent();
                    return [2 /*return*/, result[0].insertId];
            }
        });
    });
}
function getAllAntonymPairs() {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    return [2 /*return*/, db.select().from(schema_1.antonyms).where((0, drizzle_orm_2.eq)(schema_1.antonyms.isActive, true))];
            }
        });
    });
}
function getAntonymPairById(id) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, undefined];
                    return [4 /*yield*/, db.select().from(schema_1.antonyms).where((0, drizzle_orm_2.eq)(schema_1.antonyms.id, id)).limit(1)];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, result.length > 0 ? result[0] : undefined];
            }
        });
    });
}
function getRandomAntonymPairs(count_1) {
    return __awaiter(this, arguments, void 0, function (count, difficulty) {
        var db, pairs, targetLength, filteredPairs, shuffled;
        if (difficulty === void 0) { difficulty = 'beginner'; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    return [4 /*yield*/, db.select().from(schema_1.antonyms).where((0, drizzle_orm_2.eq)(schema_1.antonyms.isActive, true))];
                case 2:
                    pairs = _a.sent();
                    targetLength = difficulty === 'beginner' ? 1 : 2;
                    filteredPairs = pairs.filter(function (pair) { return pair.word.length === targetLength && pair.antonym.length === targetLength; });
                    shuffled = filteredPairs.sort(function () { return Math.random() - 0.5; });
                    return [2 /*return*/, shuffled.slice(0, Math.min(count, shuffled.length))];
            }
        });
    });
}
function updateAntonymPair(id, data) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/];
                    return [4 /*yield*/, db.update(schema_1.antonyms).set(data).where((0, drizzle_orm_2.eq)(schema_1.antonyms.id, id))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function deleteAntonymPair(id) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/];
                    return [4 /*yield*/, db.delete(schema_1.antonyms).where((0, drizzle_orm_2.eq)(schema_1.antonyms.id, id))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
// ==================== 错题本相关 ====================
function createWrongQuestion(data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, db.insert(schema_1.wrongQuestions).values(data)];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, result];
            }
        });
    });
}
function getWrongQuestionsByKid(kidId, gameType) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    if (!gameType) return [3 /*break*/, 3];
                    return [4 /*yield*/, db.select()
                            .from(schema_1.wrongQuestions)
                            .where((0, drizzle_orm_2.and)((0, drizzle_orm_2.eq)(schema_1.wrongQuestions.kidId, kidId), (0, drizzle_orm_2.eq)(schema_1.wrongQuestions.gameType, gameType)))
                            .orderBy((0, drizzle_orm_2.desc)(schema_1.wrongQuestions.createdAt))];
                case 2: return [2 /*return*/, _a.sent()];
                case 3: return [4 /*yield*/, db.select()
                        .from(schema_1.wrongQuestions)
                        .where((0, drizzle_orm_2.eq)(schema_1.wrongQuestions.kidId, kidId))
                        .orderBy((0, drizzle_orm_2.desc)(schema_1.wrongQuestions.createdAt))];
                case 4: return [2 /*return*/, _a.sent()];
            }
        });
    });
}
function markWrongQuestionReviewed(id) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/];
                    return [4 /*yield*/, db.update(schema_1.wrongQuestions).set({ reviewed: true }).where((0, drizzle_orm_2.eq)(schema_1.wrongQuestions.id, id))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function deleteWrongQuestion(id) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/];
                    return [4 /*yield*/, db.delete(schema_1.wrongQuestions).where((0, drizzle_orm_2.eq)(schema_1.wrongQuestions.id, id))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function getWrongQuestionStats(kidId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, allQuestions;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, { total: 0, math: 0, antonym: 0, character: 0, reviewed: 0 }];
                    return [4 /*yield*/, db.select()
                            .from(schema_1.wrongQuestions)
                            .where((0, drizzle_orm_2.eq)(schema_1.wrongQuestions.kidId, kidId))];
                case 2:
                    allQuestions = _a.sent();
                    return [2 /*return*/, {
                            total: allQuestions.length,
                            math: allQuestions.filter(function (q) { return q.gameType === 'math'; }).length,
                            antonym: allQuestions.filter(function (q) { return q.gameType === 'antonym'; }).length,
                            character: allQuestions.filter(function (q) { return q.gameType === 'character'; }).length,
                            reviewed: allQuestions.filter(function (q) { return q.reviewed; }).length,
                        }];
            }
        });
    });
}
// ==================== 游戏排序偏好相关 ====================
var schema_3 = require("../drizzle/schema");
function getGameOrderPreference(kidId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, undefined];
                    return [4 /*yield*/, db.select().from(schema_3.gameOrderPreferences).where((0, drizzle_orm_2.eq)(schema_3.gameOrderPreferences.kidId, kidId)).limit(1)];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, result.length > 0 ? result[0] : undefined];
            }
        });
    });
}
function saveGameOrderPreference(kidId, gameOrders) {
    return __awaiter(this, void 0, void 0, function () {
        var db, existing, gameOrdersJson, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, getGameOrderPreference(kidId)];
                case 2:
                    existing = _a.sent();
                    gameOrdersJson = JSON.stringify(gameOrders);
                    if (!existing) return [3 /*break*/, 4];
                    // 更新现有记录
                    return [4 /*yield*/, db.update(schema_3.gameOrderPreferences)
                            .set({ gameOrders: gameOrdersJson, updatedAt: new Date() })
                            .where((0, drizzle_orm_2.eq)(schema_3.gameOrderPreferences.kidId, kidId))];
                case 3:
                    // 更新现有记录
                    _a.sent();
                    return [2 /*return*/, existing.id];
                case 4: return [4 /*yield*/, db.insert(schema_3.gameOrderPreferences).values({
                        kidId: kidId,
                        gameOrders: gameOrdersJson,
                    })];
                case 5:
                    result = _a.sent();
                    return [2 /*return*/, result[0].insertId];
            }
        });
    });
}
// ==================== 汉字学习相关 ====================
/**
 * 获取随机汉字题目
 */
function getRandomCharacters(count, category, difficulty) {
    return __awaiter(this, void 0, void 0, function () {
        var db, conditions, allChars, shuffled, error_5;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    conditions = [(0, drizzle_orm_2.eq)(schema_1.characters.isActive, true)];
                    if (category) {
                        conditions.push((0, drizzle_orm_2.eq)(schema_1.characters.category, category));
                    }
                    if (difficulty) {
                        conditions.push((0, drizzle_orm_2.eq)(schema_1.characters.difficulty, difficulty));
                    }
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.characters)
                            .where(drizzle_orm_2.and.apply(void 0, conditions))];
                case 3:
                    allChars = _a.sent();
                    shuffled = allChars.sort(function () { return Math.random() - 0.5; });
                    return [2 /*return*/, shuffled.slice(0, count)];
                case 4:
                    error_5 = _a.sent();
                    console.error("[Database] Failed to get random characters:", error_5);
                    return [2 /*return*/, []];
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * 根据ID获取汉字
 */
function getCharacterById(id) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result, error_6;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, null];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.characters)
                            .where((0, drizzle_orm_2.eq)(schema_1.characters.id, id))
                            .limit(1)];
                case 3:
                    result = _a.sent();
                    return [2 /*return*/, result[0] || null];
                case 4:
                    error_6 = _a.sent();
                    console.error("[Database] Failed to get character by id:", error_6);
                    return [2 /*return*/, null];
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * 获取所有汉字（支持分页和筛选）
 */
function getAllCharacters(params) {
    return __awaiter(this, void 0, void 0, function () {
        var db, conditions, allResults, start, end, error_7;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    conditions = [(0, drizzle_orm_2.eq)(schema_1.characters.isActive, true)];
                    if (params === null || params === void 0 ? void 0 : params.category) {
                        conditions.push((0, drizzle_orm_2.eq)(schema_1.characters.category, params.category));
                    }
                    if (params === null || params === void 0 ? void 0 : params.difficulty) {
                        conditions.push((0, drizzle_orm_2.eq)(schema_1.characters.difficulty, params.difficulty));
                    }
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.characters)
                            .where(drizzle_orm_2.and.apply(void 0, conditions))
                            .orderBy((0, drizzle_orm_2.desc)(schema_1.characters.createdAt))];
                case 3:
                    allResults = _a.sent();
                    // 在内存中处理分页
                    if ((params === null || params === void 0 ? void 0 : params.offset) || (params === null || params === void 0 ? void 0 : params.limit)) {
                        start = (params === null || params === void 0 ? void 0 : params.offset) || 0;
                        end = (params === null || params === void 0 ? void 0 : params.limit) ? start + params.limit : undefined;
                        return [2 /*return*/, allResults.slice(start, end)];
                    }
                    return [2 /*return*/, allResults];
                case 4:
                    error_7 = _a.sent();
                    console.error("[Database] Failed to get all characters:", error_7);
                    return [2 /*return*/, []];
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * 创建汉字
 */
function createCharacter(data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result, error_8;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        throw new Error("Database not available");
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, db.insert(schema_1.characters).values(data)];
                case 3:
                    result = _a.sent();
                    return [2 /*return*/, Number(result[0].insertId)];
                case 4:
                    error_8 = _a.sent();
                    console.error("[Database] Failed to create character:", error_8);
                    throw error_8;
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * 更新汉字
 */
function updateCharacter(id, data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, error_9;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        throw new Error("Database not available");
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, db
                            .update(schema_1.characters)
                            .set(__assign(__assign({}, data), { updatedAt: new Date() }))
                            .where((0, drizzle_orm_2.eq)(schema_1.characters.id, id))];
                case 3:
                    _a.sent();
                    return [3 /*break*/, 5];
                case 4:
                    error_9 = _a.sent();
                    console.error("[Database] Failed to update character:", error_9);
                    throw error_9;
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * 删除汉字（软删除）
 */
function deleteCharacter(id) {
    return __awaiter(this, void 0, void 0, function () {
        var db, error_10;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        throw new Error("Database not available");
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, db
                            .update(schema_1.characters)
                            .set({ isActive: false, updatedAt: new Date() })
                            .where((0, drizzle_orm_2.eq)(schema_1.characters.id, id))];
                case 3:
                    _a.sent();
                    return [3 /*break*/, 5];
                case 4:
                    error_10 = _a.sent();
                    console.error("[Database] Failed to delete character:", error_10);
                    throw error_10;
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * 记录汉字学习
 */
function recordCharacterLearning(data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result, error_11;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        throw new Error("Database not available");
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, db.insert(schema_1.characterLearningRecords).values(data)];
                case 3:
                    result = _a.sent();
                    return [2 /*return*/, Number(result[0].insertId)];
                case 4:
                    error_11 = _a.sent();
                    console.error("[Database] Failed to record character learning:", error_11);
                    throw error_11;
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * 获取孩子的汉字学习记录
 */
function getCharacterLearningRecords(kidId, characterId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, error_12;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 6, , 7]);
                    if (!characterId) return [3 /*break*/, 4];
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.characterLearningRecords)
                            .where((0, drizzle_orm_2.and)((0, drizzle_orm_2.eq)(schema_1.characterLearningRecords.kidId, kidId), (0, drizzle_orm_2.eq)(schema_1.characterLearningRecords.characterId, characterId)))
                            .orderBy((0, drizzle_orm_2.desc)(schema_1.characterLearningRecords.createdAt))];
                case 3: return [2 /*return*/, _a.sent()];
                case 4: return [4 /*yield*/, db
                        .select()
                        .from(schema_1.characterLearningRecords)
                        .where((0, drizzle_orm_2.eq)(schema_1.characterLearningRecords.kidId, kidId))
                        .orderBy((0, drizzle_orm_2.desc)(schema_1.characterLearningRecords.createdAt))];
                case 5: return [2 /*return*/, _a.sent()];
                case 6:
                    error_12 = _a.sent();
                    console.error("[Database] Failed to get character learning records:", error_12);
                    return [2 /*return*/, []];
                case 7: return [2 /*return*/];
            }
        });
    });
}
/**
 * 获取汉字统计信息
 */
function getCharacterStats() {
    return __awaiter(this, void 0, void 0, function () {
        var db, allCharacters, total, byCategory_1, byDifficulty_1, error_13;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, { total: 0, byCategory: {}, byDifficulty: {} }];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.characters)
                            .where((0, drizzle_orm_2.eq)(schema_1.characters.isActive, true))];
                case 3:
                    allCharacters = _a.sent();
                    total = allCharacters.length;
                    byCategory_1 = {};
                    allCharacters.forEach(function (char) {
                        byCategory_1[char.category] = (byCategory_1[char.category] || 0) + 1;
                    });
                    byDifficulty_1 = {};
                    allCharacters.forEach(function (char) {
                        byDifficulty_1[char.difficulty] = (byDifficulty_1[char.difficulty] || 0) + 1;
                    });
                    return [2 /*return*/, { total: total, byCategory: byCategory_1, byDifficulty: byDifficulty_1 }];
                case 4:
                    error_13 = _a.sent();
                    console.error("[Database] Failed to get character stats:", error_13);
                    return [2 /*return*/, { total: 0, byCategory: {}, byDifficulty: {} }];
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * 获取或创建快闪识字记录
 */
function getOrCreateFlashcardRecord(kidId, characterId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, existing, result, error_14;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, null];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 6, , 7]);
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.flashcardRecords)
                            .where((0, drizzle_orm_2.and)((0, drizzle_orm_2.eq)(schema_1.flashcardRecords.kidId, kidId), (0, drizzle_orm_2.eq)(schema_1.flashcardRecords.characterId, characterId)))
                            .limit(1)];
                case 3:
                    existing = _a.sent();
                    if (existing.length > 0) {
                        return [2 /*return*/, existing[0]];
                    }
                    return [4 /*yield*/, db.insert(schema_1.flashcardRecords).values({
                            kidId: kidId,
                            characterId: characterId,
                            knownCount: 0,
                            forgottenCount: 0,
                        })];
                case 4:
                    result = (_a.sent())[0];
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.flashcardRecords)
                            .where((0, drizzle_orm_2.eq)(schema_1.flashcardRecords.id, Number(result.insertId)))
                            .limit(1)
                            .then(function (rows) { return rows[0] || null; })];
                case 5: return [2 /*return*/, _a.sent()];
                case 6:
                    error_14 = _a.sent();
                    console.error("[Database] Failed to get or create flashcard record:", error_14);
                    return [2 /*return*/, null];
                case 7: return [2 /*return*/];
            }
        });
    });
}
/**
 * 更新快闪识字记录（认识）
 */
function incrementFlashcardKnown(kidId, characterId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, error_15;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 5, , 6]);
                    // 先确保记录存在
                    return [4 /*yield*/, getOrCreateFlashcardRecord(kidId, characterId)];
                case 3:
                    // 先确保记录存在
                    _a.sent();
                    // 更新认识次数
                    return [4 /*yield*/, db
                            .update(schema_1.flashcardRecords)
                            .set({
                            knownCount: (0, drizzle_orm_1.sql)(templateObject_6 || (templateObject_6 = __makeTemplateObject(["", " + 1"], ["", " + 1"])), schema_1.flashcardRecords.knownCount),
                            lastInteraction: new Date(),
                        })
                            .where((0, drizzle_orm_2.and)((0, drizzle_orm_2.eq)(schema_1.flashcardRecords.kidId, kidId), (0, drizzle_orm_2.eq)(schema_1.flashcardRecords.characterId, characterId)))];
                case 4:
                    // 更新认识次数
                    _a.sent();
                    return [3 /*break*/, 6];
                case 5:
                    error_15 = _a.sent();
                    console.error("[Database] Failed to increment flashcard known:", error_15);
                    return [3 /*break*/, 6];
                case 6: return [2 /*return*/];
            }
        });
    });
}
/**
 * 更新快闪识字记录（忘记）
 */
function incrementFlashcardForgotten(kidId, characterId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, error_16;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 5, , 6]);
                    // 先确保记录存在
                    return [4 /*yield*/, getOrCreateFlashcardRecord(kidId, characterId)];
                case 3:
                    // 先确保记录存在
                    _a.sent();
                    // 更新忘记次数
                    return [4 /*yield*/, db
                            .update(schema_1.flashcardRecords)
                            .set({
                            forgottenCount: (0, drizzle_orm_1.sql)(templateObject_7 || (templateObject_7 = __makeTemplateObject(["", " + 1"], ["", " + 1"])), schema_1.flashcardRecords.forgottenCount),
                            lastInteraction: new Date(),
                        })
                            .where((0, drizzle_orm_2.and)((0, drizzle_orm_2.eq)(schema_1.flashcardRecords.kidId, kidId), (0, drizzle_orm_2.eq)(schema_1.flashcardRecords.characterId, characterId)))];
                case 4:
                    // 更新忘记次数
                    _a.sent();
                    return [3 /*break*/, 6];
                case 5:
                    error_16 = _a.sent();
                    console.error("[Database] Failed to increment flashcard forgotten:", error_16);
                    return [3 /*break*/, 6];
                case 6: return [2 /*return*/];
            }
        });
    });
}
/**
 * 获取孩子的所有快闪识字记录
 */
function getFlashcardRecords(kidId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, error_17;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.flashcardRecords)
                            .where((0, drizzle_orm_2.eq)(schema_1.flashcardRecords.kidId, kidId))
                            .orderBy((0, drizzle_orm_2.desc)(schema_1.flashcardRecords.lastInteraction))];
                case 3: return [2 /*return*/, _a.sent()];
                case 4:
                    error_17 = _a.sent();
                    console.error("[Database] Failed to get flashcard records:", error_17);
                    return [2 /*return*/, []];
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * 获取单个汉字的快闪识字记录
 */
function getFlashcardRecordByCharacter(kidId, characterId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, records, error_18;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, null];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.flashcardRecords)
                            .where((0, drizzle_orm_2.and)((0, drizzle_orm_2.eq)(schema_1.flashcardRecords.kidId, kidId), (0, drizzle_orm_2.eq)(schema_1.flashcardRecords.characterId, characterId)))
                            .limit(1)];
                case 3:
                    records = _a.sent();
                    return [2 /*return*/, records[0] || null];
                case 4:
                    error_18 = _a.sent();
                    console.error("[Database] Failed to get flashcard record by character:", error_18);
                    return [2 /*return*/, null];
                case 5: return [2 /*return*/];
            }
        });
    });
}
// ==================== 刷牙记录相关 ====================
/**
 * 创建刷牙记录
 */
function createBrushingSession(session) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result, insertedId, records, error_19;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, null];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 5, , 6]);
                    return [4 /*yield*/, db.insert(schema_1.brushingSessions).values(session)];
                case 3:
                    result = _a.sent();
                    insertedId = Number(result[0].insertId);
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.brushingSessions)
                            .where((0, drizzle_orm_2.eq)(schema_1.brushingSessions.id, insertedId))
                            .limit(1)];
                case 4:
                    records = _a.sent();
                    return [2 /*return*/, records[0] || null];
                case 5:
                    error_19 = _a.sent();
                    console.error("[Database] Failed to create brushing session:", error_19);
                    return [2 /*return*/, null];
                case 6: return [2 /*return*/];
            }
        });
    });
}
/**
 * 获取孩子的刷牙记录列表
 */
function getBrushingSessions(kidId_1) {
    return __awaiter(this, arguments, void 0, function (kidId, limit) {
        var db, error_20;
        if (limit === void 0) { limit = 10; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.brushingSessions)
                            .where((0, drizzle_orm_2.eq)(schema_1.brushingSessions.kidId, kidId))
                            .orderBy((0, drizzle_orm_2.desc)(schema_1.brushingSessions.createdAt))
                            .limit(limit)];
                case 3: return [2 /*return*/, _a.sent()];
                case 4:
                    error_20 = _a.sent();
                    console.error("[Database] Failed to get brushing sessions:", error_20);
                    return [2 /*return*/, []];
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * 获取孩子的刷牙统计信息
 */
function getBrushingStats(kidId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, sessions, totalSessions, totalDuration, totalStars, error_21;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, { totalSessions: 0, totalDuration: 0, totalStars: 0 }];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.brushingSessions)
                            .where((0, drizzle_orm_2.and)((0, drizzle_orm_2.eq)(schema_1.brushingSessions.kidId, kidId), (0, drizzle_orm_2.eq)(schema_1.brushingSessions.completed, true)))];
                case 3:
                    sessions = _a.sent();
                    totalSessions = sessions.length;
                    totalDuration = sessions.reduce(function (sum, s) { return sum + s.duration; }, 0);
                    totalStars = sessions.reduce(function (sum, s) { return sum + s.starsEarned; }, 0);
                    return [2 /*return*/, { totalSessions: totalSessions, totalDuration: totalDuration, totalStars: totalStars }];
                case 4:
                    error_21 = _a.sent();
                    console.error("[Database] Failed to get brushing stats:", error_21);
                    return [2 /*return*/, { totalSessions: 0, totalDuration: 0, totalStars: 0 }];
                case 5: return [2 /*return*/];
            }
        });
    });
}
// ==================== 邀请码相关 ====================
var schema_4 = require("../drizzle/schema");
var nanoid_1 = require("nanoid");
/**
 * 生成随机邀请码
 */
function generateInviteCode() {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 排除容易混淆的字符
    var code = '';
    for (var i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}
/**
 * 创建邀请码
 */
function createInvitation(data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, code, result, error_22;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, null];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    code = generateInviteCode();
                    return [4 /*yield*/, db.insert(schema_4.invitations).values({
                            code: code,
                            familyName: data.familyName || null,
                            maxUses: data.maxUses || 1,
                            expiresAt: data.expiresAt || null,
                            createdBy: data.createdBy,
                        })];
                case 3:
                    result = _a.sent();
                    return [2 /*return*/, { id: Number(result[0].insertId), code: code }];
                case 4:
                    error_22 = _a.sent();
                    console.error("[Database] Failed to create invitation:", error_22);
                    return [2 /*return*/, null];
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * 根据邀请码获取邀请信息
 */
function getInvitationByCode(code) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result, error_23;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, null];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_4.invitations)
                            .where((0, drizzle_orm_2.eq)(schema_4.invitations.code, code))
                            .limit(1)];
                case 3:
                    result = _a.sent();
                    return [2 /*return*/, result[0] || null];
                case 4:
                    error_23 = _a.sent();
                    console.error("[Database] Failed to get invitation by code:", error_23);
                    return [2 /*return*/, null];
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * 验证邀请码是否有效
 */
function validateInvitation(code) {
    return __awaiter(this, void 0, void 0, function () {
        var invitation;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getInvitationByCode(code)];
                case 1:
                    invitation = _a.sent();
                    if (!invitation) {
                        return [2 /*return*/, { valid: false, error: "邀请码不存在" }];
                    }
                    if (!invitation.isActive) {
                        return [2 /*return*/, { valid: false, error: "邀请码已失效" }];
                    }
                    if (invitation.usedCount >= invitation.maxUses) {
                        return [2 /*return*/, { valid: false, error: "邀请码已达到使用上限" }];
                    }
                    if (invitation.expiresAt && new Date(invitation.expiresAt) < new Date()) {
                        return [2 /*return*/, { valid: false, error: "邀请码已过期" }];
                    }
                    return [2 /*return*/, { valid: true, invitation: invitation }];
            }
        });
    });
}
/**
 * 使用邀请码注册家长
 */
function useInvitationToRegister(data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, validation, invitation, existingUser, familyName, familyResult, familyId, openId, userResult, userId, error_24;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, { success: false, error: "数据库不可用" }];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 10, , 11]);
                    return [4 /*yield*/, validateInvitation(data.code)];
                case 3:
                    validation = _a.sent();
                    if (!validation.valid || !validation.invitation) {
                        return [2 /*return*/, { success: false, error: validation.error }];
                    }
                    invitation = validation.invitation;
                    return [4 /*yield*/, getUserByUsername(data.username)];
                case 4:
                    existingUser = _a.sent();
                    if (existingUser) {
                        return [2 /*return*/, { success: false, error: "用户名已存在" }];
                    }
                    familyName = invitation.familyName || "".concat(data.name || data.username, "\u7684\u5BB6\u5EAD");
                    return [4 /*yield*/, db.insert(schema_4.families).values({
                            name: familyName,
                            createdBy: 0, // 临时值，稍后更新
                        })];
                case 5:
                    familyResult = _a.sent();
                    familyId = Number(familyResult[0].insertId);
                    openId = "local_".concat((0, nanoid_1.nanoid)());
                    return [4 /*yield*/, db.insert(schema_1.users).values({
                            openId: openId,
                            username: data.username,
                            passwordHash: data.passwordHash,
                            name: data.name || data.username,
                            email: data.email || null,
                            loginMethod: 'password',
                            role: 'parent',
                            familyId: familyId,
                        })];
                case 6:
                    userResult = _a.sent();
                    userId = Number(userResult[0].insertId);
                    // 更新家庭的创建者
                    return [4 /*yield*/, db.update(schema_4.families).set({ createdBy: userId }).where((0, drizzle_orm_2.eq)(schema_4.families.id, familyId))];
                case 7:
                    // 更新家庭的创建者
                    _a.sent();
                    // 更新邀请码使用次数
                    return [4 /*yield*/, db.update(schema_4.invitations)
                            .set({ usedCount: invitation.usedCount + 1 })
                            .where((0, drizzle_orm_2.eq)(schema_4.invitations.id, invitation.id))];
                case 8:
                    // 更新邀请码使用次数
                    _a.sent();
                    // 记录使用情况
                    return [4 /*yield*/, db.insert(schema_4.invitationUsages).values({
                            invitationId: invitation.id,
                            userId: userId,
                            familyId: familyId,
                        })];
                case 9:
                    // 记录使用情况
                    _a.sent();
                    return [2 /*return*/, { success: true, userId: userId, familyId: familyId }];
                case 10:
                    error_24 = _a.sent();
                    console.error("[Database] Failed to use invitation:", error_24);
                    return [2 /*return*/, { success: false, error: "注册失败，请稍后重试" }];
                case 11: return [2 /*return*/];
            }
        });
    });
}
/**
 * 获取所有邀请码列表
 */
function getAllInvitations() {
    return __awaiter(this, void 0, void 0, function () {
        var db, error_25;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_4.invitations)
                            .orderBy((0, drizzle_orm_2.desc)(schema_4.invitations.createdAt))];
                case 3: return [2 /*return*/, _a.sent()];
                case 4:
                    error_25 = _a.sent();
                    console.error("[Database] Failed to get all invitations:", error_25);
                    return [2 /*return*/, []];
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * 停用邀请码
 */
function deactivateInvitation(id) {
    return __awaiter(this, void 0, void 0, function () {
        var db, error_26;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, false];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, db.update(schema_4.invitations)
                            .set({ isActive: false })
                            .where((0, drizzle_orm_2.eq)(schema_4.invitations.id, id))];
                case 3:
                    _a.sent();
                    return [2 /*return*/, true];
                case 4:
                    error_26 = _a.sent();
                    console.error("[Database] Failed to deactivate invitation:", error_26);
                    return [2 /*return*/, false];
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * 获取所有家庭列表
 */
function getAllFamilies() {
    return __awaiter(this, void 0, void 0, function () {
        var db, error_27;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_4.families)
                            .orderBy((0, drizzle_orm_2.desc)(schema_4.families.createdAt))];
                case 3: return [2 /*return*/, _a.sent()];
                case 4:
                    error_27 = _a.sent();
                    console.error("[Database] Failed to get all families:", error_27);
                    return [2 /*return*/, []];
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * 获取家庭成员
 */
function getFamilyMembers(familyId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, error_28;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.users)
                            .where((0, drizzle_orm_2.eq)(schema_1.users.familyId, familyId))
                            .orderBy(schema_1.users.role, schema_1.users.createdAt)];
                case 3: return [2 /*return*/, _a.sent()];
                case 4:
                    error_28 = _a.sent();
                    console.error("[Database] Failed to get family members:", error_28);
                    return [2 /*return*/, []];
                case 5: return [2 /*return*/];
            }
        });
    });
}
// ==================== 家长宝宝管理 ====================
/**
 * 获取家长的宝宝列表
 * 根据家长的familyId查询该家庭中的所有宝宝（specialKids表中的宝宝）
 */
function getKidsByParent(parentId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, kids;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    return [4 /*yield*/, db.select({
                            id: schema_1.specialKids.id,
                            userId: schema_1.specialKids.userId,
                            parentUserId: schema_1.specialKids.parentUserId,
                            name: schema_1.specialKids.name,
                            avatar: schema_1.specialKids.avatar,
                            stars: schema_1.specialKids.stars,
                            position: schema_1.specialKids.position,
                            createdAt: schema_1.specialKids.createdAt,
                            updatedAt: schema_1.specialKids.updatedAt,
                            username: schema_1.users.username,
                        }).from(schema_1.specialKids)
                            .leftJoin(schema_1.users, (0, drizzle_orm_2.eq)(schema_1.specialKids.userId, schema_1.users.id))
                            .where((0, drizzle_orm_2.eq)(schema_1.specialKids.parentUserId, parentId))];
                case 2:
                    kids = _a.sent();
                    return [2 /*return*/, kids];
            }
        });
    });
}
/**
 * 为家长创建家庭
 */
function createFamilyForParent(parentId, familyName) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result, familyId;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, db.insert(schema_4.families).values({
                            name: familyName,
                            createdBy: parentId,
                        })];
                case 2:
                    result = _a.sent();
                    familyId = result[0].insertId;
                    // 更新家长的familyId
                    return [4 /*yield*/, db.update(schema_1.users).set({ familyId: familyId }).where((0, drizzle_orm_2.eq)(schema_1.users.id, parentId))];
                case 3:
                    // 更新家长的familyId
                    _a.sent();
                    return [2 /*return*/, familyId];
            }
        });
    });
}
/**
 * 更新用户的家庭归属
 */
function updateUserFamily(userId, familyId) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/];
                    return [4 /*yield*/, db.update(schema_1.users).set({ familyId: familyId }).where((0, drizzle_orm_2.eq)(schema_1.users.id, userId))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * 更新用户关系：关联家长和宝宝
 * @param userId - 要编辑的用户ID
 * @param relatedUserId - 要关联的用户ID（家长或宝宝）
 * @param relationType - 关系类型：'parent'(关联到家长) 或 'child'(关联到宝宝)
 */
function updateUserRelation(userId, relatedUserId, relationType) {
    return __awaiter(this, void 0, void 0, function () {
        var db, targetUser, relatedUser, parentFamilyId, familyName, parentFamilyId, familyName;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/];
                    return [4 /*yield*/, db.select().from(schema_1.users).where((0, drizzle_orm_2.eq)(schema_1.users.id, userId))];
                case 2:
                    targetUser = (_a.sent())[0];
                    if (!targetUser) {
                        throw new Error("用户不存在");
                    }
                    if (!(relatedUserId === null)) return [3 /*break*/, 4];
                    // 解除关系
                    return [4 /*yield*/, db.update(schema_1.users).set({ familyId: null }).where((0, drizzle_orm_2.eq)(schema_1.users.id, userId))];
                case 3:
                    // 解除关系
                    _a.sent();
                    return [2 /*return*/];
                case 4: return [4 /*yield*/, db.select().from(schema_1.users).where((0, drizzle_orm_2.eq)(schema_1.users.id, relatedUserId))];
                case 5:
                    relatedUser = (_a.sent())[0];
                    if (!relatedUser) {
                        throw new Error("关联用户不存在");
                    }
                    if (!(relationType === 'parent')) return [3 /*break*/, 9];
                    // 宝宝关联到家长：使用家长的familyId
                    if (relatedUser.role !== 'parent') {
                        throw new Error("只能关联到家长账户");
                    }
                    parentFamilyId = relatedUser.familyId;
                    if (!!parentFamilyId) return [3 /*break*/, 7];
                    familyName = "".concat(relatedUser.name || relatedUser.username, "\u7684\u5BB6\u5EAD");
                    return [4 /*yield*/, createFamilyForParent(relatedUser.id, familyName)];
                case 6:
                    parentFamilyId = _a.sent();
                    _a.label = 7;
                case 7: return [4 /*yield*/, db.update(schema_1.users).set({ familyId: parentFamilyId }).where((0, drizzle_orm_2.eq)(schema_1.users.id, userId))];
                case 8:
                    _a.sent();
                    return [3 /*break*/, 13];
                case 9:
                    // 家长关联到宝宝：将宝宝的familyId设置为家长的familyId
                    if (targetUser.role !== 'parent') {
                        throw new Error("只有家长账户可以关联宝宝");
                    }
                    if (relatedUser.role !== 'baby') {
                        throw new Error("只能关联到宝宝账户");
                    }
                    parentFamilyId = targetUser.familyId;
                    if (!!parentFamilyId) return [3 /*break*/, 11];
                    familyName = "".concat(targetUser.name || targetUser.username, "\u7684\u5BB6\u5EAD");
                    return [4 /*yield*/, createFamilyForParent(targetUser.id, familyName)];
                case 10:
                    parentFamilyId = _a.sent();
                    _a.label = 11;
                case 11: 
                // 将宝宝的familyId设置为家长的familyId（支持一个家长绑定多个宝宝）
                return [4 /*yield*/, db.update(schema_1.users).set({ familyId: parentFamilyId }).where((0, drizzle_orm_2.eq)(schema_1.users.id, relatedUserId))];
                case 12:
                    // 将宝宝的familyId设置为家长的familyId（支持一个家长绑定多个宝宝）
                    _a.sent();
                    _a.label = 13;
                case 13: return [2 /*return*/];
            }
        });
    });
}
/**
 * 批量删除用户
 */
function deleteUsers(userIds) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/];
                    // 删除用户记录
                    return [4 /*yield*/, db.delete(schema_1.users).where((0, drizzle_orm_2.inArray)(schema_1.users.id, userIds))];
                case 2:
                    // 删除用户记录
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * 更新用户基本信息（用户名和昵称）
 */
function updateUserInfo(userId, data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, updateData;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/];
                    updateData = {};
                    if (data.username !== undefined)
                        updateData.username = data.username;
                    if (data.name !== undefined)
                        updateData.name = data.name;
                    return [4 /*yield*/, db.update(schema_1.users).set(updateData).where((0, drizzle_orm_2.eq)(schema_1.users.id, userId))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
// ==================== 家庭功能权限相关 ====================
/**
 * 获取家庭的所有子功能权限
 */
function getFamilyFeatures(familyId) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    return [4 /*yield*/, db.select().from(schema_1.familyFeatures).where((0, drizzle_orm_2.eq)(schema_1.familyFeatures.familyId, familyId))];
                case 2: return [2 /*return*/, _a.sent()];
            }
        });
    });
}
/**
 * 获取家庭某个主功能下的所有子功能
 */
function getFamilyFeaturesByName(familyId, featureName) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    return [4 /*yield*/, db.select().from(schema_1.familyFeatures)
                            .where((0, drizzle_orm_2.and)((0, drizzle_orm_2.eq)(schema_1.familyFeatures.familyId, familyId), (0, drizzle_orm_2.eq)(schema_1.familyFeatures.featureName, featureName)))];
                case 2: return [2 /*return*/, _a.sent()];
            }
        });
    });
}
/**
 * 更新或创建子功能权限
 */
function upsertFamilyFeature(feature) {
    return __awaiter(this, void 0, void 0, function () {
        var db, existing;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/];
                    return [4 /*yield*/, db.select().from(schema_1.familyFeatures)
                            .where((0, drizzle_orm_2.and)((0, drizzle_orm_2.eq)(schema_1.familyFeatures.familyId, feature.familyId), (0, drizzle_orm_2.eq)(schema_1.familyFeatures.featureName, feature.featureName), (0, drizzle_orm_2.eq)(schema_1.familyFeatures.subFeatureName, feature.subFeatureName)))
                            .limit(1)];
                case 2:
                    existing = _a.sent();
                    if (!(existing.length > 0)) return [3 /*break*/, 4];
                    return [4 /*yield*/, db.update(schema_1.familyFeatures)
                            .set({
                            enabled: feature.enabled,
                            settings: feature.settings,
                            updatedAt: new Date()
                        })
                            .where((0, drizzle_orm_2.eq)(schema_1.familyFeatures.id, existing[0].id))];
                case 3:
                    _a.sent();
                    return [3 /*break*/, 6];
                case 4: return [4 /*yield*/, db.insert(schema_1.familyFeatures).values(feature)];
                case 5:
                    _a.sent();
                    _a.label = 6;
                case 6: return [2 /*return*/];
            }
        });
    });
}
/**
 * 批量更新家庭的子功能权限
 */
function batchUpdateFamilyFeatures(familyId, features) {
    return __awaiter(this, void 0, void 0, function () {
        var db, _i, features_1, feature;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/];
                    _i = 0, features_1 = features;
                    _a.label = 2;
                case 2:
                    if (!(_i < features_1.length)) return [3 /*break*/, 5];
                    feature = features_1[_i];
                    return [4 /*yield*/, upsertFamilyFeature({
                            familyId: familyId,
                            featureName: feature.featureName,
                            subFeatureName: feature.subFeatureName,
                            enabled: feature.enabled,
                            settings: feature.settings
                        })];
                case 3:
                    _a.sent();
                    _a.label = 4;
                case 4:
                    _i++;
                    return [3 /*break*/, 2];
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * 根据功能ID获取家庭的功能权限状态
 * @param familyId 家庭ID
 * @param featureId 功能ID（如"parent.vocabulary.photo"）
 */
function getFamilyFeatureByPath(familyId, path) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, db.select().from(schema_1.familyFeatures)
                            .where((0, drizzle_orm_2.and)((0, drizzle_orm_2.eq)(schema_1.familyFeatures.familyId, familyId), (0, drizzle_orm_2.eq)(schema_1.familyFeatures.path, path)))
                            .limit(1)];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, result.length > 0 ? result[0] : null];
            }
        });
    });
}
/**
 * 批量插入或更新功能权限（用于同步功能树）
 * @param familyId 家庭ID
 * @param features 功能列表
 */
function syncFamilyFeatures(familyId, features) {
    return __awaiter(this, void 0, void 0, function () {
        var db, _i, features_2, feature, existing;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/];
                    _i = 0, features_2 = features;
                    _a.label = 2;
                case 2:
                    if (!(_i < features_2.length)) return [3 /*break*/, 8];
                    feature = features_2[_i];
                    return [4 /*yield*/, db.select().from(schema_1.familyFeatures)
                            .where((0, drizzle_orm_2.and)((0, drizzle_orm_2.eq)(schema_1.familyFeatures.familyId, familyId), (0, drizzle_orm_2.eq)(schema_1.familyFeatures.path, feature.path)))
                            .limit(1)];
                case 3:
                    existing = _a.sent();
                    if (!(existing.length > 0)) return [3 /*break*/, 5];
                    // 更新现有记录（保留enabled状态）
                    return [4 /*yield*/, db.update(schema_1.familyFeatures)
                            .set({
                            featureName: feature.featureName,
                            subFeatureName: feature.subFeatureName,
                            parentFeature: feature.parentFeature,
                            level: feature.level,
                            displayOrder: feature.displayOrder,
                            updatedAt: new Date()
                        })
                            .where((0, drizzle_orm_2.eq)(schema_1.familyFeatures.id, existing[0].id))];
                case 4:
                    // 更新现有记录（保留enabled状态）
                    _a.sent();
                    return [3 /*break*/, 7];
                case 5: 
                // 插入新记录
                return [4 /*yield*/, db.insert(schema_1.familyFeatures).values({
                        familyId: familyId,
                        featureName: feature.featureName,
                        subFeatureName: feature.subFeatureName,
                        parentFeature: feature.parentFeature,
                        level: feature.level,
                        path: feature.path,
                        displayOrder: feature.displayOrder,
                        enabled: feature.enabled
                    })];
                case 6:
                    // 插入新记录
                    _a.sent();
                    _a.label = 7;
                case 7:
                    _i++;
                    return [3 /*break*/, 2];
                case 8: return [2 /*return*/];
            }
        });
    });
}
/**
 * 批量更新功能权限状态（按path）
 * @param familyId 家庭ID
 * @param updates 更新列表：{ path: string, enabled: boolean }[]
 */
function batchUpdateFeaturesByPath(familyId, updates) {
    return __awaiter(this, void 0, void 0, function () {
        var db, _i, updates_1, update;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/];
                    _i = 0, updates_1 = updates;
                    _a.label = 2;
                case 2:
                    if (!(_i < updates_1.length)) return [3 /*break*/, 5];
                    update = updates_1[_i];
                    return [4 /*yield*/, db.update(schema_1.familyFeatures)
                            .set({
                            enabled: update.enabled,
                            updatedAt: new Date()
                        })
                            .where((0, drizzle_orm_2.and)((0, drizzle_orm_2.eq)(schema_1.familyFeatures.familyId, familyId), (0, drizzle_orm_2.eq)(schema_1.familyFeatures.path, update.path)))];
                case 3:
                    _a.sent();
                    _a.label = 4;
                case 4:
                    _i++;
                    return [3 /*break*/, 2];
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * 检查家庭是否有某个功能的权限
 *
 * 注意：功能树的权限检查逻辑：
 * - 一级功能（如"社交"、"游戏"）是大模块，始终显示，不需要检查权限
 * - 二级功能（如"好友记"、"相册"）需要检查自身权限，不检查父级
 * - 三级及以下功能需要检查自身和父级权限
 *
 * @param familyId 家庭ID
 * @param path 功能路径
 * @returns 是否有权限
 */
function checkFeaturePermission(familyId, path) {
    return __awaiter(this, void 0, void 0, function () {
        var db, feature, level, parentPath;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, false];
                    return [4 /*yield*/, getFamilyFeatureByPath(familyId, path)];
                case 2:
                    feature = _a.sent();
                    if (!feature)
                        return [2 /*return*/, false];
                    if (!feature.enabled)
                        return [2 /*return*/, false];
                    level = path.split('/').length;
                    // 一级功能（如"社交"）始终返回true，因为大模块始终显示
                    if (level === 1) {
                        return [2 /*return*/, true];
                    }
                    // 二级功能（如"社交/好友记"）只检查自身权限，不检查父级
                    if (level === 2) {
                        return [2 /*return*/, feature.enabled];
                    }
                    if (!feature.parentFeature) return [3 /*break*/, 4];
                    parentPath = path.substring(0, path.lastIndexOf('/'));
                    return [4 /*yield*/, checkFeaturePermission(familyId, parentPath)];
                case 3: return [2 /*return*/, _a.sent()];
                case 4: return [2 /*return*/, true];
            }
        });
    });
}
/**
 * 获取所有家长用户（用于超级管理员账户管理）
 */
function getAllParents() {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    return [4 /*yield*/, db.select({
                            id: schema_1.users.id,
                            name: schema_1.users.name,
                            username: schema_1.users.username,
                            email: schema_1.users.email,
                            familyId: schema_1.users.familyId,
                            createdAt: schema_1.users.createdAt
                        })
                            .from(schema_1.users)
                            .where((0, drizzle_orm_2.eq)(schema_1.users.role, 'parent'))];
                case 2: return [2 /*return*/, _a.sent()];
            }
        });
    });
}
// ==================== 首页横幅 ====================
/**
 * 获取当前活跃的首页横幅
 */
function getActiveHomeBanner() {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, db.select()
                            .from(schema_1.homeBanner)
                            .where((0, drizzle_orm_2.eq)(schema_1.homeBanner.isActive, true))
                            .limit(1)];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, result.length > 0 ? result[0] : null];
            }
        });
    });
}
/**
 * 更新首页横幅（如果不存在则创建）
 */
function upsertHomeBanner(data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, existing;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/];
                    return [4 /*yield*/, db.select().from(schema_1.homeBanner).limit(1)];
                case 2:
                    existing = _a.sent();
                    if (!(existing.length > 0)) return [3 /*break*/, 4];
                    return [4 /*yield*/, db.update(schema_1.homeBanner)
                            .set(__assign(__assign({}, data), { updatedAt: new Date() }))
                            .where((0, drizzle_orm_2.eq)(schema_1.homeBanner.id, existing[0].id))];
                case 3:
                    _a.sent();
                    return [3 /*break*/, 6];
                case 4: return [4 /*yield*/, db.insert(schema_1.homeBanner).values(__assign(__assign({}, data), { isActive: true }))];
                case 5:
                    _a.sent();
                    _a.label = 6;
                case 6: return [2 /*return*/];
            }
        });
    });
}
/**
 * 获取首页横幅（包括未启用的）
 */
function getHomeBanner() {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, undefined];
                    return [4 /*yield*/, db.select().from(schema_1.homeBanner).limit(1)];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, result.length > 0 ? result[0] : undefined];
            }
        });
    });
}
// ==================== 20加法游戏相关 ====================
/**
 * 获取孩子的20加法游戏配置
 */
function getAddition20Config(kidId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, undefined];
                    return [4 /*yield*/, db.select()
                            .from(schema_1.addition20Config)
                            .where((0, drizzle_orm_2.eq)(schema_1.addition20Config.kidId, kidId))
                            .limit(1)];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, result.length > 0 ? result[0] : undefined];
            }
        });
    });
}
/**
 * 保存或更新孩子的20加法游戏配置
 */
function upsertAddition20Config(data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, existing;
        var _a, _b, _c, _d, _e, _f;
        return __generator(this, function (_g) {
            switch (_g.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _g.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/];
                    return [4 /*yield*/, getAddition20Config(data.kidId)];
                case 2:
                    existing = _g.sent();
                    if (!existing) return [3 /*break*/, 4];
                    return [4 /*yield*/, db.update(schema_1.addition20Config)
                            .set({
                            difficulty: (_a = data.difficulty) !== null && _a !== void 0 ? _a : existing.difficulty,
                            questionCount: (_b = data.questionCount) !== null && _b !== void 0 ? _b : existing.questionCount,
                            answerMode: (_c = data.answerMode) !== null && _c !== void 0 ? _c : existing.answerMode,
                            updatedAt: new Date()
                        })
                            .where((0, drizzle_orm_2.eq)(schema_1.addition20Config.kidId, data.kidId))];
                case 3:
                    _g.sent();
                    return [3 /*break*/, 6];
                case 4: return [4 /*yield*/, db.insert(schema_1.addition20Config).values({
                        kidId: data.kidId,
                        difficulty: (_d = data.difficulty) !== null && _d !== void 0 ? _d : "easy",
                        questionCount: (_e = data.questionCount) !== null && _e !== void 0 ? _e : 10,
                        answerMode: (_f = data.answerMode) !== null && _f !== void 0 ? _f : "choice"
                    })];
                case 5:
                    _g.sent();
                    _g.label = 6;
                case 6: return [2 /*return*/];
            }
        });
    });
}
/**
 * 保存20加法游戏记录
 */
function saveAddition20Record(data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, db.insert(schema_1.addition20Records).values(data)];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, Number(result[0].insertId)];
            }
        });
    });
}
/**
 * 获取孩子的20加法游戏记录
 */
function getAddition20Records(kidId_1) {
    return __awaiter(this, arguments, void 0, function (kidId, limit) {
        var db;
        if (limit === void 0) { limit = 10; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    return [4 /*yield*/, db.select()
                            .from(schema_1.addition20Records)
                            .where((0, drizzle_orm_2.eq)(schema_1.addition20Records.kidId, kidId))
                            .orderBy((0, drizzle_orm_2.desc)(schema_1.addition20Records.createdAt))
                            .limit(limit)];
                case 2: return [2 /*return*/, _a.sent()];
            }
        });
    });
}
/**
 * 获取孩子的20加法游戏最高分
 */
function getAddition20HighScore(kidId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, records;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, 0];
                    return [4 /*yield*/, db.select()
                            .from(schema_1.addition20Records)
                            .where((0, drizzle_orm_2.eq)(schema_1.addition20Records.kidId, kidId))
                            .orderBy((0, drizzle_orm_2.desc)(schema_1.addition20Records.correctCount))
                            .limit(1)];
                case 2:
                    records = _a.sent();
                    return [2 /*return*/, records.length > 0 ? records[0].correctCount : 0];
            }
        });
    });
}
// ==================== 20加法有奖挑战相关 ====================
/**
 * 创建有奖挑战
 */
function createAddition20Challenge(data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, db.insert(schema_1.addition20Challenges).values(data)];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, Number(result[0].insertId)];
            }
        });
    });
}
/**
 * 获取孩子的活跃挑战
 */
function getActiveAddition20Challenge(kidId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, undefined];
                    return [4 /*yield*/, db.select()
                            .from(schema_1.addition20Challenges)
                            .where((0, drizzle_orm_2.and)((0, drizzle_orm_2.eq)(schema_1.addition20Challenges.kidId, kidId), (0, drizzle_orm_2.eq)(schema_1.addition20Challenges.status, "active")))
                            .limit(1)];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, result.length > 0 ? result[0] : undefined];
            }
        });
    });
}
/**
 * 更新挑战进度
 */
function updateAddition20ChallengeProgress(challengeId, data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, updateData;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/];
                    updateData = __assign({}, data);
                    if (updateData.currentCorrectCount !== undefined && updateData.currentCorrectCount < 0) {
                        updateData.currentCorrectCount = 0;
                    }
                    return [4 /*yield*/, db.update(schema_1.addition20Challenges)
                            .set(__assign(__assign({}, updateData), { updatedAt: new Date() }))
                            .where((0, drizzle_orm_2.eq)(schema_1.addition20Challenges.id, challengeId))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * 完成挑战
 */
function completeAddition20Challenge(challengeId) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/];
                    return [4 /*yield*/, db.update(schema_1.addition20Challenges)
                            .set({
                            status: "completed",
                            completedAt: new Date(),
                            updatedAt: new Date()
                        })
                            .where((0, drizzle_orm_2.eq)(schema_1.addition20Challenges.id, challengeId))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * 暂停挑战（休息保存）
 */
function pauseAddition20Challenge(challengeId) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/];
                    return [4 /*yield*/, db.update(schema_1.addition20Challenges)
                            .set({
                            status: "paused",
                            lastPlayedAt: new Date(),
                            updatedAt: new Date()
                        })
                            .where((0, drizzle_orm_2.eq)(schema_1.addition20Challenges.id, challengeId))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * 恢复挑战
 */
function resumeAddition20Challenge(challengeId) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/];
                    return [4 /*yield*/, db.update(schema_1.addition20Challenges)
                            .set({
                            status: "active",
                            updatedAt: new Date()
                        })
                            .where((0, drizzle_orm_2.eq)(schema_1.addition20Challenges.id, challengeId))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * 取消/放弃挑战
 */
function cancelAddition20Challenge(challengeId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, now;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/];
                    now = new Date();
                    return [4 /*yield*/, db.update(schema_1.addition20Challenges)
                            .set({
                            status: "cancelled",
                            completedAt: now
                        })
                            .where((0, drizzle_orm_2.eq)(schema_1.addition20Challenges.id, challengeId))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * 获取孩子的挑战历史
 */
function getAddition20ChallengeHistory(kidId_1) {
    return __awaiter(this, arguments, void 0, function (kidId, limit) {
        var db;
        if (limit === void 0) { limit = 10; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    return [4 /*yield*/, db.select()
                            .from(schema_1.addition20Challenges)
                            .where((0, drizzle_orm_2.eq)(schema_1.addition20Challenges.kidId, kidId))
                            .orderBy((0, drizzle_orm_2.desc)(schema_1.addition20Challenges.createdAt))
                            .limit(limit)];
                case 2: return [2 /*return*/, _a.sent()];
            }
        });
    });
}
// ==================== 阅读识字游戏相关函数 ====================
/**
 * 获取所有故事列表（包括模板和自定义）
 */
function getReadingStories(kidId) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    if (!kidId) return [3 /*break*/, 3];
                    return [4 /*yield*/, db.select()
                            .from(schema_1.readingStories)
                            .where((0, drizzle_orm_2.or)((0, drizzle_orm_2.eq)(schema_1.readingStories.type, "template"), (0, drizzle_orm_2.eq)(schema_1.readingStories.kidId, kidId)))
                            .orderBy((0, drizzle_orm_2.desc)(schema_1.readingStories.createdAt))];
                case 2: return [2 /*return*/, _a.sent()];
                case 3: return [4 /*yield*/, db.select()
                        .from(schema_1.readingStories)
                        .where((0, drizzle_orm_2.eq)(schema_1.readingStories.type, "template"))
                        .orderBy((0, drizzle_orm_2.desc)(schema_1.readingStories.createdAt))];
                case 4: 
                // 只获取模板故事
                return [2 /*return*/, _a.sent()];
            }
        });
    });
}
/**
 * 获取单个故事详情
 */
function getReadingStoryById(id) {
    return __awaiter(this, void 0, void 0, function () {
        var db, stories;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, db.select()
                            .from(schema_1.readingStories)
                            .where((0, drizzle_orm_2.eq)(schema_1.readingStories.id, id))
                            .limit(1)];
                case 2:
                    stories = _a.sent();
                    return [2 /*return*/, stories[0] || null];
            }
        });
    });
}
/**
 * 创建自定义故事
 */
function createReadingStory(data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, wordCount, result;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _b.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, 0];
                    wordCount = data.content.length;
                    return [4 /*yield*/, db.insert(schema_1.readingStories).values({
                            title: data.title,
                            content: data.content,
                            type: data.type,
                            coverImageUrl: data.coverImageUrl,
                            createdBy: data.createdBy,
                            kidId: data.kidId,
                            wordCount: wordCount,
                            isActive: true,
                        })];
                case 2:
                    result = _b.sent();
                    return [2 /*return*/, Number(result.insertId || ((_a = result[0]) === null || _a === void 0 ? void 0 : _a.insertId) || 0)];
            }
        });
    });
}
/**
 * 更新故事内容
 */
function updateReadingStory(id, data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, updateData;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/];
                    updateData = {};
                    if (data.title)
                        updateData.title = data.title;
                    if (data.content) {
                        updateData.content = data.content;
                        updateData.wordCount = data.content.length;
                    }
                    return [4 /*yield*/, db.update(schema_1.readingStories)
                            .set(updateData)
                            .where((0, drizzle_orm_2.eq)(schema_1.readingStories.id, id))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * 删除故事
 */
function deleteReadingStory(id) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/];
                    return [4 /*yield*/, db.delete(schema_1.readingStories)
                            .where((0, drizzle_orm_2.eq)(schema_1.readingStories.id, id))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * 创建阅读记录
 */
function createReadingRecord(data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _b.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, 0];
                    return [4 /*yield*/, db.insert(schema_1.readingRecords).values({
                            kidId: data.kidId,
                            storyId: data.storyId,
                            clickCount: 0,
                            readDuration: 0,
                        })];
                case 2:
                    result = _b.sent();
                    return [2 /*return*/, Number(result.insertId || ((_a = result[0]) === null || _a === void 0 ? void 0 : _a.insertId) || 0)];
            }
        });
    });
}
/**
 * 更新阅读记录
 */
function updateReadingRecord(id, data) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/];
                    return [4 /*yield*/, db.update(schema_1.readingRecords)
                            .set(data)
                            .where((0, drizzle_orm_2.eq)(schema_1.readingRecords.id, id))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * 获取孩子的阅读记录
 */
function getReadingRecords(kidId_1) {
    return __awaiter(this, arguments, void 0, function (kidId, limit) {
        var db;
        if (limit === void 0) { limit = 20; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    return [4 /*yield*/, db.select()
                            .from(schema_1.readingRecords)
                            .where((0, drizzle_orm_2.eq)(schema_1.readingRecords.kidId, kidId))
                            .orderBy((0, drizzle_orm_2.desc)(schema_1.readingRecords.createdAt))
                            .limit(limit)];
                case 2: return [2 /*return*/, _a.sent()];
            }
        });
    });
}
// ==================== 词库相关 ====================
/**
 * 获取总词库列表（支持筛选）
 */
function getVocabularyMasterList(filters) {
    return __awaiter(this, void 0, void 0, function () {
        var db, conditions, result, error_29;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    conditions = [(0, drizzle_orm_2.eq)(schema_1.vocabularyMaster.isActive, true)];
                    if (filters === null || filters === void 0 ? void 0 : filters.language) {
                        conditions.push((0, drizzle_orm_2.eq)(schema_1.vocabularyMaster.language, filters.language));
                    }
                    if (filters === null || filters === void 0 ? void 0 : filters.category) {
                        conditions.push((0, drizzle_orm_2.eq)(schema_1.vocabularyMaster.category, filters.category));
                    }
                    if (filters === null || filters === void 0 ? void 0 : filters.difficulty) {
                        conditions.push((0, drizzle_orm_2.eq)(schema_1.vocabularyMaster.difficulty, filters.difficulty));
                    }
                    if (filters === null || filters === void 0 ? void 0 : filters.search) {
                        conditions.push((0, drizzle_orm_2.or)((0, drizzle_orm_2.like)(schema_1.vocabularyMaster.word, "%".concat(filters.search, "%")), (0, drizzle_orm_2.like)(schema_1.vocabularyMaster.translation, "%".concat(filters.search, "%"))));
                    }
                    return [4 /*yield*/, db.select().from(schema_1.vocabularyMaster).where(drizzle_orm_2.and.apply(void 0, conditions))];
                case 3:
                    result = _a.sent();
                    return [2 /*return*/, result];
                case 4:
                    error_29 = _a.sent();
                    console.error("[Database] Failed to get vocabulary master list:", error_29);
                    return [2 /*return*/, []];
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * 根据ID获取总词库词汇
 */
function getVocabularyMasterById(id) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result, error_30;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, null];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, db.select().from(schema_1.vocabularyMaster).where((0, drizzle_orm_2.eq)(schema_1.vocabularyMaster.id, id)).limit(1)];
                case 3:
                    result = _a.sent();
                    return [2 /*return*/, result[0] || null];
                case 4:
                    error_30 = _a.sent();
                    console.error("[Database] Failed to get vocabulary master by id:", error_30);
                    return [2 /*return*/, null];
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * 根据词汇和语言查找总词库中的词汇
 */
function findVocabularyMasterByWord(word, language) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result, error_31;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, null];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, db.select().from(schema_1.vocabularyMaster)
                            .where((0, drizzle_orm_2.and)((0, drizzle_orm_2.eq)(schema_1.vocabularyMaster.word, word), (0, drizzle_orm_2.eq)(schema_1.vocabularyMaster.language, language)))
                            .limit(1)];
                case 3:
                    result = _a.sent();
                    return [2 /*return*/, result[0] || null];
                case 4:
                    error_31 = _a.sent();
                    console.error("[Database] Failed to find vocabulary master by word:", error_31);
                    return [2 /*return*/, null];
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * 创建总词库词汇
 */
function createVocabularyMaster(data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result, insertId, error_32;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, null];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 5, , 6]);
                    return [4 /*yield*/, db.insert(schema_1.vocabularyMaster).values(data)];
                case 3:
                    result = _a.sent();
                    insertId = Number(result[0].insertId);
                    return [4 /*yield*/, getVocabularyMasterById(insertId)];
                case 4: return [2 /*return*/, _a.sent()];
                case 5:
                    error_32 = _a.sent();
                    console.error("[Database] Failed to create vocabulary master:", error_32);
                    return [2 /*return*/, null];
                case 6: return [2 /*return*/];
            }
        });
    });
}
/**
 * 更新总词库词汇
 */
function updateVocabularyMaster(id, data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, error_33;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, false];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, db.update(schema_1.vocabularyMaster).set(data).where((0, drizzle_orm_2.eq)(schema_1.vocabularyMaster.id, id))];
                case 3:
                    _a.sent();
                    return [2 /*return*/, true];
                case 4:
                    error_33 = _a.sent();
                    console.error("[Database] Failed to update vocabulary master:", error_33);
                    return [2 /*return*/, false];
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * 删除总词库词汇（软删除）
 */
function deleteVocabularyMaster(id) {
    return __awaiter(this, void 0, void 0, function () {
        var db, error_34;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, false];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, db.update(schema_1.vocabularyMaster).set({ isActive: false }).where((0, drizzle_orm_2.eq)(schema_1.vocabularyMaster.id, id))];
                case 3:
                    _a.sent();
                    return [2 /*return*/, true];
                case 4:
                    error_34 = _a.sent();
                    console.error("[Database] Failed to delete vocabulary master:", error_34);
                    return [2 /*return*/, false];
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * 获取家庭词库列表
 */
function getFamilyVocabularyList(parentUserId, language, kidId, wordType) {
    return __awaiter(this, void 0, void 0, function () {
        var db, conditions, result, error_35;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    conditions = [
                        (0, drizzle_orm_2.eq)(schema_1.familyVocabulary.parentUserId, parentUserId),
                        (0, drizzle_orm_2.eq)(schema_1.vocabularyMaster.isActive, true)
                    ];
                    if (language) {
                        conditions.push((0, drizzle_orm_2.eq)(schema_1.vocabularyMaster.language, language));
                    }
                    // 根据kidId过滤
                    if (kidId !== undefined) {
                        if (kidId === null) {
                            conditions.push((0, drizzle_orm_2.isNull)(schema_1.familyVocabulary.kidId));
                        }
                        else {
                            conditions.push((0, drizzle_orm_2.eq)(schema_1.familyVocabulary.kidId, kidId));
                        }
                    }
                    // 根据wordType过滤
                    if (wordType) {
                        conditions.push((0, drizzle_orm_2.eq)(schema_1.vocabularyMaster.wordType, wordType));
                    }
                    return [4 /*yield*/, db.select({
                            id: schema_1.familyVocabulary.id,
                            parentUserId: schema_1.familyVocabulary.parentUserId,
                            vocabularyId: schema_1.familyVocabulary.vocabularyId,
                            addedBy: schema_1.familyVocabulary.addedBy,
                            customNote: schema_1.familyVocabulary.customNote,
                            masteryLevel: schema_1.familyVocabulary.masteryLevel,
                            createdAt: schema_1.familyVocabulary.createdAt,
                            vocabulary: {
                                id: schema_1.vocabularyMaster.id,
                                word: schema_1.vocabularyMaster.word,
                                language: schema_1.vocabularyMaster.language,
                                translation: schema_1.vocabularyMaster.translation,
                                pinyin: schema_1.vocabularyMaster.pinyin,
                                pronunciation: schema_1.vocabularyMaster.pronunciation,
                                category: schema_1.vocabularyMaster.category,
                                difficulty: schema_1.vocabularyMaster.difficulty,
                                example: schema_1.vocabularyMaster.example,
                                imageUrl: schema_1.vocabularyMaster.imageUrl,
                                audioUrl: schema_1.vocabularyMaster.audioUrl,
                                isActive: schema_1.vocabularyMaster.isActive,
                                createdAt: schema_1.vocabularyMaster.createdAt,
                                updatedAt: schema_1.vocabularyMaster.updatedAt,
                            },
                        })
                            .from(schema_1.familyVocabulary)
                            .innerJoin(schema_1.vocabularyMaster, (0, drizzle_orm_2.eq)(schema_1.familyVocabulary.vocabularyId, schema_1.vocabularyMaster.id))
                            .where(drizzle_orm_2.and.apply(void 0, conditions))];
                case 3:
                    result = _a.sent();
                    return [2 /*return*/, result];
                case 4:
                    error_35 = _a.sent();
                    console.error("[Database] Failed to get family vocabulary list:", error_35);
                    return [2 /*return*/, []];
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * 添加词汇到家庭词库
 */
function addVocabularyToFamily(data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, conditions, existing, result, insertId, newRecord, error_36;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, null];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 6, , 7]);
                    conditions = [
                        (0, drizzle_orm_2.eq)(schema_1.familyVocabulary.parentUserId, data.parentUserId),
                        (0, drizzle_orm_2.eq)(schema_1.familyVocabulary.vocabularyId, data.vocabularyId),
                    ];
                    if (data.kidId !== undefined) {
                        conditions.push(data.kidId === null ? (0, drizzle_orm_2.isNull)(schema_1.familyVocabulary.kidId) : (0, drizzle_orm_2.eq)(schema_1.familyVocabulary.kidId, data.kidId));
                    }
                    return [4 /*yield*/, db.select().from(schema_1.familyVocabulary)
                            .where(drizzle_orm_2.and.apply(void 0, conditions))
                            .limit(1)];
                case 3:
                    existing = _a.sent();
                    if (existing.length > 0) {
                        return [2 /*return*/, existing[0]];
                    }
                    return [4 /*yield*/, db.insert(schema_1.familyVocabulary).values(data)];
                case 4:
                    result = _a.sent();
                    insertId = Number(result[0].insertId);
                    return [4 /*yield*/, db.select().from(schema_1.familyVocabulary).where((0, drizzle_orm_2.eq)(schema_1.familyVocabulary.id, insertId)).limit(1)];
                case 5:
                    newRecord = _a.sent();
                    return [2 /*return*/, newRecord[0] || null];
                case 6:
                    error_36 = _a.sent();
                    console.error("[Database] Failed to add vocabulary to family:", error_36);
                    return [2 /*return*/, null];
                case 7: return [2 /*return*/];
            }
        });
    });
}
/**
 * 从家庭词库删除词汇
 */
function removeVocabularyFromFamily(parentUserId, vocabularyId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, error_37;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, false];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, db.delete(schema_1.familyVocabulary).where((0, drizzle_orm_2.and)((0, drizzle_orm_2.eq)(schema_1.familyVocabulary.parentUserId, parentUserId), (0, drizzle_orm_2.eq)(schema_1.familyVocabulary.vocabularyId, vocabularyId)))];
                case 3:
                    _a.sent();
                    return [2 /*return*/, true];
                case 4:
                    error_37 = _a.sent();
                    console.error("[Database] Failed to remove vocabulary from family:", error_37);
                    return [2 /*return*/, false];
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * 更新家庭词库备注
 */
function updateFamilyVocabularyNote(parentUserId, vocabularyId, customNote) {
    return __awaiter(this, void 0, void 0, function () {
        var db, error_38;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, false];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, db.update(schema_1.familyVocabulary)
                            .set({ customNote: customNote })
                            .where((0, drizzle_orm_2.and)((0, drizzle_orm_2.eq)(schema_1.familyVocabulary.parentUserId, parentUserId), (0, drizzle_orm_2.eq)(schema_1.familyVocabulary.vocabularyId, vocabularyId)))];
                case 3:
                    _a.sent();
                    return [2 /*return*/, true];
                case 4:
                    error_38 = _a.sent();
                    console.error("[Database] Failed to update family vocabulary note:", error_38);
                    return [2 /*return*/, false];
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * 更新家庭词库学习进度
 */
function updateFamilyVocabularyMasteryLevel(parentUserId, vocabularyId, masteryLevel) {
    return __awaiter(this, void 0, void 0, function () {
        var db, error_39;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, false];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, db.update(schema_1.familyVocabulary)
                            .set({ masteryLevel: masteryLevel })
                            .where((0, drizzle_orm_2.and)((0, drizzle_orm_2.eq)(schema_1.familyVocabulary.parentUserId, parentUserId), (0, drizzle_orm_2.eq)(schema_1.familyVocabulary.vocabularyId, vocabularyId)))];
                case 3:
                    _a.sent();
                    return [2 /*return*/, true];
                case 4:
                    error_39 = _a.sent();
                    console.error("[Database] Failed to update family vocabulary mastery level:", error_39);
                    return [2 /*return*/, false];
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * 获取家庭词库统计数据
 */
function getFamilyVocabularyStats(parentUserId, kidId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, baseConditions, totalResult, totalCount, chineseResult, chineseCount, englishResult, englishCount, chineseCharResult, chineseCharCount, chineseWordResult, chineseWordCount, sevenDaysAgo, recentResult, recentAddedCount, notStartedResult, notStartedCount, learningResult, learningCount, masteredResult, masteredCount, trendData, i, date_1, nextDate, charResult, charCount, wordResult, wordCount, engResult, engCount, error_40;
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
        return __generator(this, function (_o) {
            switch (_o.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _o.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, {
                                totalCount: 0,
                                chineseCount: 0,
                                englishCount: 0,
                                chineseCharCount: 0,
                                chineseWordCount: 0,
                                recentAddedCount: 0,
                                notStartedCount: 0,
                                learningCount: 0,
                                masteredCount: 0,
                            }];
                    _o.label = 2;
                case 2:
                    _o.trys.push([2, 18, , 19]);
                    baseConditions = [
                        (0, drizzle_orm_2.eq)(schema_1.familyVocabulary.parentUserId, parentUserId),
                        (0, drizzle_orm_2.eq)(schema_1.vocabularyMaster.isActive, true)
                    ];
                    // 根据kidId过滤
                    if (kidId !== undefined) {
                        if (kidId === null) {
                            baseConditions.push((0, drizzle_orm_2.isNull)(schema_1.familyVocabulary.kidId));
                        }
                        else {
                            baseConditions.push((0, drizzle_orm_2.eq)(schema_1.familyVocabulary.kidId, kidId));
                        }
                    }
                    return [4 /*yield*/, db.select({ count: (0, drizzle_orm_1.sql)(templateObject_8 || (templateObject_8 = __makeTemplateObject(["count(*)"], ["count(*)"]))) })
                            .from(schema_1.familyVocabulary)
                            .innerJoin(schema_1.vocabularyMaster, (0, drizzle_orm_2.eq)(schema_1.familyVocabulary.vocabularyId, schema_1.vocabularyMaster.id))
                            .where(drizzle_orm_2.and.apply(void 0, baseConditions))];
                case 3:
                    totalResult = _o.sent();
                    totalCount = Number(((_a = totalResult[0]) === null || _a === void 0 ? void 0 : _a.count) || 0);
                    return [4 /*yield*/, db.select({ count: (0, drizzle_orm_1.sql)(templateObject_9 || (templateObject_9 = __makeTemplateObject(["count(*)"], ["count(*)"]))) })
                            .from(schema_1.familyVocabulary)
                            .innerJoin(schema_1.vocabularyMaster, (0, drizzle_orm_2.eq)(schema_1.familyVocabulary.vocabularyId, schema_1.vocabularyMaster.id))
                            .where(drizzle_orm_2.and.apply(void 0, __spreadArray(__spreadArray([], baseConditions, false), [(0, drizzle_orm_2.eq)(schema_1.vocabularyMaster.language, "chinese")], false)))];
                case 4:
                    chineseResult = _o.sent();
                    chineseCount = Number(((_b = chineseResult[0]) === null || _b === void 0 ? void 0 : _b.count) || 0);
                    return [4 /*yield*/, db.select({ count: (0, drizzle_orm_1.sql)(templateObject_10 || (templateObject_10 = __makeTemplateObject(["count(*)"], ["count(*)"]))) })
                            .from(schema_1.familyVocabulary)
                            .innerJoin(schema_1.vocabularyMaster, (0, drizzle_orm_2.eq)(schema_1.familyVocabulary.vocabularyId, schema_1.vocabularyMaster.id))
                            .where(drizzle_orm_2.and.apply(void 0, __spreadArray(__spreadArray([], baseConditions, false), [(0, drizzle_orm_2.eq)(schema_1.vocabularyMaster.language, "english")], false)))];
                case 5:
                    englishResult = _o.sent();
                    englishCount = Number(((_c = englishResult[0]) === null || _c === void 0 ? void 0 : _c.count) || 0);
                    return [4 /*yield*/, db.select({ count: (0, drizzle_orm_1.sql)(templateObject_11 || (templateObject_11 = __makeTemplateObject(["count(*)"], ["count(*)"]))) })
                            .from(schema_1.familyVocabulary)
                            .innerJoin(schema_1.vocabularyMaster, (0, drizzle_orm_2.eq)(schema_1.familyVocabulary.vocabularyId, schema_1.vocabularyMaster.id))
                            .where(drizzle_orm_2.and.apply(void 0, __spreadArray(__spreadArray([], baseConditions, false), [(0, drizzle_orm_2.eq)(schema_1.vocabularyMaster.language, "chinese"), (0, drizzle_orm_2.eq)(schema_1.vocabularyMaster.wordType, "character")], false)))];
                case 6:
                    chineseCharResult = _o.sent();
                    chineseCharCount = Number(((_d = chineseCharResult[0]) === null || _d === void 0 ? void 0 : _d.count) || 0);
                    return [4 /*yield*/, db.select({ count: (0, drizzle_orm_1.sql)(templateObject_12 || (templateObject_12 = __makeTemplateObject(["count(*)"], ["count(*)"]))) })
                            .from(schema_1.familyVocabulary)
                            .innerJoin(schema_1.vocabularyMaster, (0, drizzle_orm_2.eq)(schema_1.familyVocabulary.vocabularyId, schema_1.vocabularyMaster.id))
                            .where(drizzle_orm_2.and.apply(void 0, __spreadArray(__spreadArray([], baseConditions, false), [(0, drizzle_orm_2.eq)(schema_1.vocabularyMaster.language, "chinese"), (0, drizzle_orm_2.eq)(schema_1.vocabularyMaster.wordType, "word")], false)))];
                case 7:
                    chineseWordResult = _o.sent();
                    chineseWordCount = Number(((_e = chineseWordResult[0]) === null || _e === void 0 ? void 0 : _e.count) || 0);
                    sevenDaysAgo = new Date();
                    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
                    return [4 /*yield*/, db.select({ count: (0, drizzle_orm_1.sql)(templateObject_13 || (templateObject_13 = __makeTemplateObject(["count(*)"], ["count(*)"]))) })
                            .from(schema_1.familyVocabulary)
                            .innerJoin(schema_1.vocabularyMaster, (0, drizzle_orm_2.eq)(schema_1.familyVocabulary.vocabularyId, schema_1.vocabularyMaster.id))
                            .where(drizzle_orm_2.and.apply(void 0, __spreadArray(__spreadArray([], baseConditions, false), [(0, drizzle_orm_2.gte)(schema_1.familyVocabulary.createdAt, sevenDaysAgo)], false)))];
                case 8:
                    recentResult = _o.sent();
                    recentAddedCount = Number(((_f = recentResult[0]) === null || _f === void 0 ? void 0 : _f.count) || 0);
                    return [4 /*yield*/, db.select({ count: (0, drizzle_orm_1.sql)(templateObject_14 || (templateObject_14 = __makeTemplateObject(["count(*)"], ["count(*)"]))) })
                            .from(schema_1.familyVocabulary)
                            .innerJoin(schema_1.vocabularyMaster, (0, drizzle_orm_2.eq)(schema_1.familyVocabulary.vocabularyId, schema_1.vocabularyMaster.id))
                            .where(drizzle_orm_2.and.apply(void 0, __spreadArray(__spreadArray([], baseConditions, false), [(0, drizzle_orm_2.eq)(schema_1.familyVocabulary.masteryLevel, "not_started")], false)))];
                case 9:
                    notStartedResult = _o.sent();
                    notStartedCount = Number(((_g = notStartedResult[0]) === null || _g === void 0 ? void 0 : _g.count) || 0);
                    return [4 /*yield*/, db.select({ count: (0, drizzle_orm_1.sql)(templateObject_15 || (templateObject_15 = __makeTemplateObject(["count(*)"], ["count(*)"]))) })
                            .from(schema_1.familyVocabulary)
                            .innerJoin(schema_1.vocabularyMaster, (0, drizzle_orm_2.eq)(schema_1.familyVocabulary.vocabularyId, schema_1.vocabularyMaster.id))
                            .where(drizzle_orm_2.and.apply(void 0, __spreadArray(__spreadArray([], baseConditions, false), [(0, drizzle_orm_2.eq)(schema_1.familyVocabulary.masteryLevel, "learning")], false)))];
                case 10:
                    learningResult = _o.sent();
                    learningCount = Number(((_h = learningResult[0]) === null || _h === void 0 ? void 0 : _h.count) || 0);
                    return [4 /*yield*/, db.select({ count: (0, drizzle_orm_1.sql)(templateObject_16 || (templateObject_16 = __makeTemplateObject(["count(*)"], ["count(*)"]))) })
                            .from(schema_1.familyVocabulary)
                            .innerJoin(schema_1.vocabularyMaster, (0, drizzle_orm_2.eq)(schema_1.familyVocabulary.vocabularyId, schema_1.vocabularyMaster.id))
                            .where(drizzle_orm_2.and.apply(void 0, __spreadArray(__spreadArray([], baseConditions, false), [(0, drizzle_orm_2.eq)(schema_1.familyVocabulary.masteryLevel, "mastered")], false)))];
                case 11:
                    masteredResult = _o.sent();
                    masteredCount = Number(((_j = masteredResult[0]) === null || _j === void 0 ? void 0 : _j.count) || 0);
                    trendData = [];
                    i = 6;
                    _o.label = 12;
                case 12:
                    if (!(i >= 0)) return [3 /*break*/, 17];
                    date_1 = new Date();
                    date_1.setDate(date_1.getDate() - i);
                    date_1.setHours(0, 0, 0, 0);
                    nextDate = new Date(date_1);
                    nextDate.setDate(nextDate.getDate() + 1);
                    return [4 /*yield*/, db.select({ count: (0, drizzle_orm_1.sql)(templateObject_17 || (templateObject_17 = __makeTemplateObject(["count(*)"], ["count(*)"]))) })
                            .from(schema_1.familyVocabulary)
                            .innerJoin(schema_1.vocabularyMaster, (0, drizzle_orm_2.eq)(schema_1.familyVocabulary.vocabularyId, schema_1.vocabularyMaster.id))
                            .where(drizzle_orm_2.and.apply(void 0, __spreadArray(__spreadArray([], baseConditions, false), [(0, drizzle_orm_2.eq)(schema_1.vocabularyMaster.language, "chinese"),
                            (0, drizzle_orm_2.eq)(schema_1.vocabularyMaster.wordType, "character"),
                            (0, drizzle_orm_2.gte)(schema_1.familyVocabulary.createdAt, date_1), (0, drizzle_orm_1.sql)(templateObject_18 || (templateObject_18 = __makeTemplateObject(["", " < ", ""], ["", " < ", ""])), schema_1.familyVocabulary.createdAt, nextDate)], false)))];
                case 13:
                    charResult = _o.sent();
                    charCount = Number(((_k = charResult[0]) === null || _k === void 0 ? void 0 : _k.count) || 0);
                    return [4 /*yield*/, db.select({ count: (0, drizzle_orm_1.sql)(templateObject_19 || (templateObject_19 = __makeTemplateObject(["count(*)"], ["count(*)"]))) })
                            .from(schema_1.familyVocabulary)
                            .innerJoin(schema_1.vocabularyMaster, (0, drizzle_orm_2.eq)(schema_1.familyVocabulary.vocabularyId, schema_1.vocabularyMaster.id))
                            .where(drizzle_orm_2.and.apply(void 0, __spreadArray(__spreadArray([], baseConditions, false), [(0, drizzle_orm_2.eq)(schema_1.vocabularyMaster.language, "chinese"),
                            (0, drizzle_orm_2.eq)(schema_1.vocabularyMaster.wordType, "word"),
                            (0, drizzle_orm_2.gte)(schema_1.familyVocabulary.createdAt, date_1), (0, drizzle_orm_1.sql)(templateObject_20 || (templateObject_20 = __makeTemplateObject(["", " < ", ""], ["", " < ", ""])), schema_1.familyVocabulary.createdAt, nextDate)], false)))];
                case 14:
                    wordResult = _o.sent();
                    wordCount = Number(((_l = wordResult[0]) === null || _l === void 0 ? void 0 : _l.count) || 0);
                    return [4 /*yield*/, db.select({ count: (0, drizzle_orm_1.sql)(templateObject_21 || (templateObject_21 = __makeTemplateObject(["count(*)"], ["count(*)"]))) })
                            .from(schema_1.familyVocabulary)
                            .innerJoin(schema_1.vocabularyMaster, (0, drizzle_orm_2.eq)(schema_1.familyVocabulary.vocabularyId, schema_1.vocabularyMaster.id))
                            .where(drizzle_orm_2.and.apply(void 0, __spreadArray(__spreadArray([], baseConditions, false), [(0, drizzle_orm_2.eq)(schema_1.vocabularyMaster.language, "english"),
                            (0, drizzle_orm_2.gte)(schema_1.familyVocabulary.createdAt, date_1), (0, drizzle_orm_1.sql)(templateObject_22 || (templateObject_22 = __makeTemplateObject(["", " < ", ""], ["", " < ", ""])), schema_1.familyVocabulary.createdAt, nextDate)], false)))];
                case 15:
                    engResult = _o.sent();
                    engCount = Number(((_m = engResult[0]) === null || _m === void 0 ? void 0 : _m.count) || 0);
                    trendData.push({
                        date: date_1.toISOString().split('T')[0],
                        chineseChar: charCount,
                        chineseWord: wordCount,
                        english: engCount,
                        total: charCount + wordCount + engCount,
                    });
                    _o.label = 16;
                case 16:
                    i--;
                    return [3 /*break*/, 12];
                case 17: return [2 /*return*/, {
                        totalCount: totalCount,
                        chineseCount: chineseCount,
                        englishCount: englishCount,
                        chineseCharCount: chineseCharCount,
                        chineseWordCount: chineseWordCount,
                        recentAddedCount: recentAddedCount,
                        notStartedCount: notStartedCount,
                        learningCount: learningCount,
                        masteredCount: masteredCount,
                    }];
                case 18:
                    error_40 = _o.sent();
                    console.error("[Database] Failed to get family vocabulary stats:", error_40);
                    return [2 /*return*/, {
                            totalCount: 0,
                            chineseCount: 0,
                            englishCount: 0,
                            chineseCharCount: 0,
                            chineseWordCount: 0,
                            recentAddedCount: 0,
                            notStartedCount: 0,
                            learningCount: 0,
                            masteredCount: 0,
                        }];
                case 19: return [2 /*return*/];
            }
        });
    });
}
// ============= 游戏使用统计相关函数 =============
/**
 * 获取所有游戏的使用统计数据
 * 返回每个游戏的使用次数、活跃用户数、最近使用时间
 */
function getGameUsageStats() {
    return __awaiter(this, void 0, void 0, function () {
        var database, stats, characterStats, flashcardStats, addition20Stats, readingStats, brushingStats;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    database = _a.sent();
                    if (!database)
                        return [2 /*return*/, []];
                    stats = [];
                    return [4 /*yield*/, database
                            .select({
                            usageCount: (0, drizzle_orm_1.sql)(templateObject_23 || (templateObject_23 = __makeTemplateObject(["COUNT(*)"], ["COUNT(*)"]))),
                            activeUsers: (0, drizzle_orm_1.sql)(templateObject_24 || (templateObject_24 = __makeTemplateObject(["COUNT(DISTINCT ", ")"], ["COUNT(DISTINCT ", ")"])), schema_1.characterLearningRecords.kidId),
                            lastUsedAt: (0, drizzle_orm_1.sql)(templateObject_25 || (templateObject_25 = __makeTemplateObject(["MAX(", ")"], ["MAX(", ")"])), schema_1.characterLearningRecords.createdAt),
                        })
                            .from(schema_1.characterLearningRecords)];
                case 2:
                    characterStats = _a.sent();
                    if (characterStats[0] && Number(characterStats[0].usageCount) > 0) {
                        stats.push({
                            gameId: 'character',
                            gameName: '看图识字',
                            usageCount: Number(characterStats[0].usageCount),
                            activeUsers: Number(characterStats[0].activeUsers),
                            lastUsedAt: characterStats[0].lastUsedAt,
                        });
                    }
                    return [4 /*yield*/, database
                            .select({
                            usageCount: (0, drizzle_orm_1.sql)(templateObject_26 || (templateObject_26 = __makeTemplateObject(["SUM(", " + ", ")"], ["SUM(", " + ", ")"])), schema_1.flashcardRecords.knownCount, schema_1.flashcardRecords.forgottenCount),
                            activeUsers: (0, drizzle_orm_1.sql)(templateObject_27 || (templateObject_27 = __makeTemplateObject(["COUNT(DISTINCT ", ")"], ["COUNT(DISTINCT ", ")"])), schema_1.flashcardRecords.kidId),
                            lastUsedAt: (0, drizzle_orm_1.sql)(templateObject_28 || (templateObject_28 = __makeTemplateObject(["MAX(", ")"], ["MAX(", ")"])), schema_1.flashcardRecords.lastInteraction),
                        })
                            .from(schema_1.flashcardRecords)];
                case 3:
                    flashcardStats = _a.sent();
                    if (flashcardStats[0] && Number(flashcardStats[0].usageCount) > 0) {
                        stats.push({
                            gameId: 'flashcard',
                            gameName: '快闪识字',
                            usageCount: Number(flashcardStats[0].usageCount),
                            activeUsers: Number(flashcardStats[0].activeUsers),
                            lastUsedAt: flashcardStats[0].lastUsedAt,
                        });
                    }
                    return [4 /*yield*/, database
                            .select({
                            usageCount: (0, drizzle_orm_1.sql)(templateObject_29 || (templateObject_29 = __makeTemplateObject(["COUNT(*)"], ["COUNT(*)"]))),
                            activeUsers: (0, drizzle_orm_1.sql)(templateObject_30 || (templateObject_30 = __makeTemplateObject(["COUNT(DISTINCT ", ")"], ["COUNT(DISTINCT ", ")"])), schema_1.addition20Records.kidId),
                            lastUsedAt: (0, drizzle_orm_1.sql)(templateObject_31 || (templateObject_31 = __makeTemplateObject(["MAX(", ")"], ["MAX(", ")"])), schema_1.addition20Records.createdAt),
                        })
                            .from(schema_1.addition20Records)];
                case 4:
                    addition20Stats = _a.sent();
                    if (addition20Stats[0] && Number(addition20Stats[0].usageCount) > 0) {
                        stats.push({
                            gameId: 'addition20',
                            gameName: '20加法',
                            usageCount: Number(addition20Stats[0].usageCount),
                            activeUsers: Number(addition20Stats[0].activeUsers),
                            lastUsedAt: addition20Stats[0].lastUsedAt,
                        });
                    }
                    return [4 /*yield*/, database
                            .select({
                            usageCount: (0, drizzle_orm_1.sql)(templateObject_32 || (templateObject_32 = __makeTemplateObject(["COUNT(*)"], ["COUNT(*)"]))),
                            activeUsers: (0, drizzle_orm_1.sql)(templateObject_33 || (templateObject_33 = __makeTemplateObject(["COUNT(DISTINCT ", ")"], ["COUNT(DISTINCT ", ")"])), schema_1.readingRecords.kidId),
                            lastUsedAt: (0, drizzle_orm_1.sql)(templateObject_34 || (templateObject_34 = __makeTemplateObject(["MAX(", ")"], ["MAX(", ")"])), schema_1.readingRecords.updatedAt),
                        })
                            .from(schema_1.readingRecords)];
                case 5:
                    readingStats = _a.sent();
                    if (readingStats[0] && Number(readingStats[0].usageCount) > 0) {
                        stats.push({
                            gameId: 'reading',
                            gameName: '阅读识字',
                            usageCount: Number(readingStats[0].usageCount),
                            activeUsers: Number(readingStats[0].activeUsers),
                            lastUsedAt: readingStats[0].lastUsedAt,
                        });
                    }
                    return [4 /*yield*/, database
                            .select({
                            usageCount: (0, drizzle_orm_1.sql)(templateObject_35 || (templateObject_35 = __makeTemplateObject(["COUNT(*)"], ["COUNT(*)"]))),
                            activeUsers: (0, drizzle_orm_1.sql)(templateObject_36 || (templateObject_36 = __makeTemplateObject(["COUNT(DISTINCT ", ")"], ["COUNT(DISTINCT ", ")"])), schema_1.brushingSessions.kidId),
                            lastUsedAt: (0, drizzle_orm_1.sql)(templateObject_37 || (templateObject_37 = __makeTemplateObject(["MAX(", ")"], ["MAX(", ")"])), schema_1.brushingSessions.createdAt),
                        })
                            .from(schema_1.brushingSessions)];
                case 6:
                    brushingStats = _a.sent();
                    if (brushingStats[0] && Number(brushingStats[0].usageCount) > 0) {
                        stats.push({
                            gameId: 'brushing',
                            gameName: '刷牙游戏',
                            usageCount: Number(brushingStats[0].usageCount),
                            activeUsers: Number(brushingStats[0].activeUsers),
                            lastUsedAt: brushingStats[0].lastUsedAt,
                        });
                    }
                    // 按使用次数降序排序
                    return [2 /*return*/, stats.sort(function (a, b) { return b.usageCount - a.usageCount; })];
            }
        });
    });
}
// ============= VI配置相关函数 =============
/**
 * 根据家长用户ID获取VI配置
 */
function getViConfigByParentUserId(parentUserId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result, error_41;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, null];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, db.select().from(schema_1.familyViConfig)
                            .where((0, drizzle_orm_2.and)((0, drizzle_orm_2.eq)(schema_1.familyViConfig.parentUserId, parentUserId), (0, drizzle_orm_2.eq)(schema_1.familyViConfig.isActive, true)))
                            .limit(1)];
                case 3:
                    result = _a.sent();
                    return [2 /*return*/, result[0] || null];
                case 4:
                    error_41 = _a.sent();
                    console.error("[Database] Failed to get VI config:", error_41);
                    return [2 /*return*/, null];
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * 创建或更新家长的VI配置
 */
function upsertViConfig(data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, existing, insertData, result, insertId, newConfig, error_42;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, null];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 10, , 11]);
                    return [4 /*yield*/, getViConfigByParentUserId(data.parentUserId)];
                case 3:
                    existing = _a.sent();
                    if (!existing) return [3 /*break*/, 6];
                    // 更新现有配置
                    return [4 /*yield*/, db.update(schema_1.familyViConfig)
                            .set({
                            viThemeId: data.viThemeId,
                            customConfig: data.customConfig,
                            updatedAt: new Date(),
                        })
                            .where((0, drizzle_orm_2.eq)(schema_1.familyViConfig.parentUserId, data.parentUserId))];
                case 4:
                    // 更新现有配置
                    _a.sent();
                    return [4 /*yield*/, getViConfigByParentUserId(data.parentUserId)];
                case 5: return [2 /*return*/, _a.sent()];
                case 6:
                    insertData = {
                        parentUserId: data.parentUserId,
                        viThemeId: data.viThemeId,
                        customConfig: data.customConfig,
                        isActive: true,
                        createdBy: data.createdBy,
                    };
                    return [4 /*yield*/, db.insert(schema_1.familyViConfig).values(insertData)];
                case 7:
                    result = _a.sent();
                    insertId = Number(result[0].insertId);
                    return [4 /*yield*/, db.select().from(schema_1.familyViConfig)
                            .where((0, drizzle_orm_2.eq)(schema_1.familyViConfig.id, insertId))
                            .limit(1)];
                case 8:
                    newConfig = _a.sent();
                    return [2 /*return*/, newConfig[0] || null];
                case 9: return [3 /*break*/, 11];
                case 10:
                    error_42 = _a.sent();
                    console.error("[Database] Failed to upsert VI config:", error_42);
                    return [2 /*return*/, null];
                case 11: return [2 /*return*/];
            }
        });
    });
}
/**
 * 删除家长的VI配置（软删除）
 */
function deleteViConfig(parentUserId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, error_43;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, false];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, db.update(schema_1.familyViConfig)
                            .set({ isActive: false })
                            .where((0, drizzle_orm_2.eq)(schema_1.familyViConfig.parentUserId, parentUserId))];
                case 3:
                    _a.sent();
                    return [2 /*return*/, true];
                case 4:
                    error_43 = _a.sent();
                    console.error("[Database] Failed to delete VI config:", error_43);
                    return [2 /*return*/, false];
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * 获取所有可用的VI主题列表
 * 注意：目前返回空数组，等待用户上传VI方案后填充
 */
function getAvailableViThemes() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            // TODO: 等待用户上传VI方案后填充实际主题数据
            return [2 /*return*/, []];
        });
    });
}
// ==================== 人脉字段分类相关 ====================
/**
 * 获取用户的所有字段分类
 */
function getContactFieldCategories(parentUserId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, categories, error_44;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, db.select().from(schema_1.contactFieldCategories)
                            .where((0, drizzle_orm_2.eq)(schema_1.contactFieldCategories.parentUserId, parentUserId))
                            .orderBy(schema_1.contactFieldCategories.sortOrder)];
                case 3:
                    categories = _a.sent();
                    return [2 /*return*/, categories];
                case 4:
                    error_44 = _a.sent();
                    console.error("[Database] Failed to get contact field categories:", error_44);
                    return [2 /*return*/, []];
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * 创建字段分类
 */
function createContactFieldCategory(data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result, insertId, newCategory, error_45;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, null];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 5, , 6]);
                    return [4 /*yield*/, db.insert(schema_1.contactFieldCategories).values(data)];
                case 3:
                    result = _a.sent();
                    insertId = Number(result[0].insertId);
                    return [4 /*yield*/, db.select().from(schema_1.contactFieldCategories)
                            .where((0, drizzle_orm_2.eq)(schema_1.contactFieldCategories.id, insertId))
                            .limit(1)];
                case 4:
                    newCategory = _a.sent();
                    return [2 /*return*/, newCategory[0] || null];
                case 5:
                    error_45 = _a.sent();
                    console.error("[Database] Failed to create contact field category:", error_45);
                    return [2 /*return*/, null];
                case 6: return [2 /*return*/];
            }
        });
    });
}
/**
 * 删除字段分类
 */
function deleteContactFieldCategory(id, parentUserId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, error_46;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, false];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 5, , 6]);
                    // 先删除该分类下的所有字段值
                    return [4 /*yield*/, db.delete(schema_1.contactFieldValues)
                            .where((0, drizzle_orm_2.eq)(schema_1.contactFieldValues.categoryId, id))];
                case 3:
                    // 先删除该分类下的所有字段值
                    _a.sent();
                    // 再删除分类本身
                    return [4 /*yield*/, db.delete(schema_1.contactFieldCategories)
                            .where((0, drizzle_orm_2.and)((0, drizzle_orm_2.eq)(schema_1.contactFieldCategories.id, id), (0, drizzle_orm_2.eq)(schema_1.contactFieldCategories.parentUserId, parentUserId)))];
                case 4:
                    // 再删除分类本身
                    _a.sent();
                    return [2 /*return*/, true];
                case 5:
                    error_46 = _a.sent();
                    console.error("[Database] Failed to delete contact field category:", error_46);
                    return [2 /*return*/, false];
                case 6: return [2 /*return*/];
            }
        });
    });
}
/**
 * 获取人脉的所有自定义字段值
 */
function getContactFieldValues(contactId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, values, error_47;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, db.select().from(schema_1.contactFieldValues)
                            .where((0, drizzle_orm_2.eq)(schema_1.contactFieldValues.contactId, contactId))];
                case 3:
                    values = _a.sent();
                    return [2 /*return*/, values];
                case 4:
                    error_47 = _a.sent();
                    console.error("[Database] Failed to get contact field values:", error_47);
                    return [2 /*return*/, []];
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * 设置人脉的自定义字段值（批量更新）
 */
function setContactFieldValues(contactId, values) {
    return __awaiter(this, void 0, void 0, function () {
        var db, insertData, error_48;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, false];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 6, , 7]);
                    // 删除该人脉的所有现有字段值
                    return [4 /*yield*/, db.delete(schema_1.contactFieldValues)
                            .where((0, drizzle_orm_2.eq)(schema_1.contactFieldValues.contactId, contactId))];
                case 3:
                    // 删除该人脉的所有现有字段值
                    _a.sent();
                    if (!(values.length > 0)) return [3 /*break*/, 5];
                    insertData = values.map(function (v) { return ({
                        contactId: contactId,
                        categoryId: v.categoryId,
                        value: v.value || null,
                    }); });
                    return [4 /*yield*/, db.insert(schema_1.contactFieldValues).values(insertData)];
                case 4:
                    _a.sent();
                    _a.label = 5;
                case 5: return [2 /*return*/, true];
                case 6:
                    error_48 = _a.sent();
                    console.error("[Database] Failed to set contact field values:", error_48);
                    return [2 /*return*/, false];
                case 7: return [2 /*return*/];
            }
        });
    });
}
/**
 * 获取所有可用的字段类目（全局类目，parentUserId=0）
 */
function getAllFieldCategories() {
    return __awaiter(this, void 0, void 0, function () {
        var db, categories, error_49;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, db.select()
                            .from(schema_1.contactFieldCategories)
                            .where((0, drizzle_orm_2.eq)(schema_1.contactFieldCategories.parentUserId, 0))
                            .orderBy(schema_1.contactFieldCategories.sortOrder)];
                case 3:
                    categories = _a.sent();
                    return [2 /*return*/, categories];
                case 4:
                    error_49 = _a.sent();
                    console.error("[Database] Failed to get all field categories:", error_49);
                    return [2 /*return*/, []];
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * 添加单个字段值
 */
function addContactFieldValue(contactId, categoryId, value) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result, error_50;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        throw new Error("Database not available");
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, db.insert(schema_1.contactFieldValues).values({
                            contactId: contactId,
                            categoryId: categoryId,
                            value: value,
                        })];
                case 3:
                    result = _a.sent();
                    return [2 /*return*/, result[0].insertId];
                case 4:
                    error_50 = _a.sent();
                    console.error("[Database] Failed to add contact field value:", error_50);
                    throw error_50;
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * 删除单个字段值
 */
function deleteContactFieldValue(id) {
    return __awaiter(this, void 0, void 0, function () {
        var db, error_51;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, false];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, db.delete(schema_1.contactFieldValues)
                            .where((0, drizzle_orm_2.eq)(schema_1.contactFieldValues.id, id))];
                case 3:
                    _a.sent();
                    return [2 /*return*/, true];
                case 4:
                    error_51 = _a.sent();
                    console.error("[Database] Failed to delete contact field value:", error_51);
                    return [2 /*return*/, false];
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * 获取人脉和字段值（用于编辑页面）
 */
function getContactWithFieldValues(contactId, parentUserId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, contactResult, categories, values_2, fieldValues, error_52;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, { contact: null, fieldValues: [] }];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 6, , 7]);
                    return [4 /*yield*/, db.select().from(schema_1.contacts)
                            .where((0, drizzle_orm_2.and)((0, drizzle_orm_2.eq)(schema_1.contacts.id, contactId), (0, drizzle_orm_2.eq)(schema_1.contacts.parentUserId, parentUserId)))
                            .limit(1)];
                case 3:
                    contactResult = _a.sent();
                    if (contactResult.length === 0) {
                        return [2 /*return*/, { contact: null, fieldValues: [] }];
                    }
                    return [4 /*yield*/, db.select().from(schema_1.contactFieldCategories)
                            .where((0, drizzle_orm_2.eq)(schema_1.contactFieldCategories.parentUserId, parentUserId))
                            .orderBy(schema_1.contactFieldCategories.sortOrder)];
                case 4:
                    categories = _a.sent();
                    return [4 /*yield*/, db.select().from(schema_1.contactFieldValues)
                            .where((0, drizzle_orm_2.eq)(schema_1.contactFieldValues.contactId, contactId))];
                case 5:
                    values_2 = _a.sent();
                    fieldValues = categories.map(function (cat) {
                        var fieldValue = values_2.find(function (v) { return v.categoryId === cat.id; });
                        return {
                            categoryId: cat.id,
                            categoryName: cat.name,
                            value: (fieldValue === null || fieldValue === void 0 ? void 0 : fieldValue.value) || null,
                        };
                    });
                    return [2 /*return*/, { contact: contactResult[0], fieldValues: fieldValues }];
                case 6:
                    error_52 = _a.sent();
                    console.error("[Database] Failed to get contact with field values:", error_52);
                    return [2 /*return*/, { contact: null, fieldValues: [] }];
                case 7: return [2 /*return*/];
            }
        });
    });
}
// ==================== 容器顺序相关 ====================
/**
 * 获取所有启用的容器定义
 */
function getActiveFeatureDefinitions() {
    return __awaiter(this, void 0, void 0, function () {
        var db, error_53;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.featureDefinitions)
                            .where((0, drizzle_orm_2.eq)(schema_1.featureDefinitions.isActive, true))
                            .orderBy((0, drizzle_orm_2.asc)(schema_1.featureDefinitions.defaultPosition))];
                case 3: return [2 /*return*/, _a.sent()];
                case 4:
                    error_53 = _a.sent();
                    console.error("[Database] Failed to get active feature definitions:", error_53);
                    return [2 /*return*/, []];
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * 获取用户的容器顺序配置
 */
function getUserFeatureOrder(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, error_54;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.userFeatureOrder)
                            .where((0, drizzle_orm_2.eq)(schema_1.userFeatureOrder.userId, userId))
                            .orderBy((0, drizzle_orm_2.asc)(schema_1.userFeatureOrder.position))];
                case 3: return [2 /*return*/, _a.sent()];
                case 4:
                    error_54 = _a.sent();
                    console.error("[Database] Failed to get user feature order:", error_54);
                    return [2 /*return*/, []];
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * 保存用户的容器顺序配置
 * 删除旧配置并插入新配置
 */
function saveUserFeatureOrder(userId, orders) {
    return __awaiter(this, void 0, void 0, function () {
        var db, error_55;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db) {
                        console.warn("[Database] Cannot save user feature order: database not available");
                        return [2 /*return*/];
                    }
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 6, , 7]);
                    // 删除该用户的所有旧配置
                    return [4 /*yield*/, db
                            .delete(schema_1.userFeatureOrder)
                            .where((0, drizzle_orm_2.eq)(schema_1.userFeatureOrder.userId, userId))];
                case 3:
                    // 删除该用户的所有旧配置
                    _a.sent();
                    if (!(orders.length > 0)) return [3 /*break*/, 5];
                    return [4 /*yield*/, db.insert(schema_1.userFeatureOrder).values(orders.map(function (order) { return ({
                            userId: userId,
                            featureId: order.featureId,
                            position: order.position,
                        }); }))];
                case 4:
                    _a.sent();
                    _a.label = 5;
                case 5: return [3 /*break*/, 7];
                case 6:
                    error_55 = _a.sent();
                    console.error("[Database] Failed to save user feature order:", error_55);
                    throw error_55;
                case 7: return [2 /*return*/];
            }
        });
    });
}
/**
 * 创建或更新容器定义（管理员用）
 */
function upsertFeatureDefinition(feature) {
    return __awaiter(this, void 0, void 0, function () {
        var db, error_56;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db) {
                        console.warn("[Database] Cannot upsert feature definition: database not available");
                        return [2 /*return*/];
                    }
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, db
                            .insert(schema_1.featureDefinitions)
                            .values(feature)
                            .onDuplicateKeyUpdate({
                            set: {
                                title: feature.title,
                                description: feature.description,
                                isActive: feature.isActive,
                                defaultPosition: feature.defaultPosition,
                                updatedAt: new Date(),
                            },
                        })];
                case 3:
                    _a.sent();
                    return [3 /*break*/, 5];
                case 4:
                    error_56 = _a.sent();
                    console.error("[Database] Failed to upsert feature definition:", error_56);
                    throw error_56;
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * 获取所有容器定义（管理员用）
 */
function getAllFeatureDefinitions() {
    return __awaiter(this, void 0, void 0, function () {
        var db, error_57;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.featureDefinitions)
                            .orderBy((0, drizzle_orm_2.asc)(schema_1.featureDefinitions.defaultPosition))];
                case 3: return [2 /*return*/, _a.sent()];
                case 4:
                    error_57 = _a.sent();
                    console.error("[Database] Failed to get all feature definitions:", error_57);
                    return [2 /*return*/, []];
                case 5: return [2 /*return*/];
            }
        });
    });
}
// ==================== Reminder Helpers ====================
/**
 * 创建提醒事项
 */
function createReminder(reminder) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result, insertId, error_58;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db) {
                        console.warn("[Database] Cannot create reminder: database not available");
                        return [2 /*return*/, null];
                    }
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 5, , 6]);
                    return [4 /*yield*/, db.insert(schema_1.reminders).values(reminder)];
                case 3:
                    result = _a.sent();
                    insertId = Number(result[0].insertId);
                    return [4 /*yield*/, getReminderById(insertId)];
                case 4: return [2 /*return*/, _a.sent()];
                case 5:
                    error_58 = _a.sent();
                    console.error("[Database] Failed to create reminder:", error_58);
                    throw error_58;
                case 6: return [2 /*return*/];
            }
        });
    });
}
/**
 * 根据ID获取提醒事项
 */
function getReminderById(id) {
    return __awaiter(this, void 0, void 0, function () {
        var db, results, error_59;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, null];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.reminders)
                            .where((0, drizzle_orm_2.eq)(schema_1.reminders.id, id))
                            .limit(1)];
                case 3:
                    results = _a.sent();
                    return [2 /*return*/, results[0] || null];
                case 4:
                    error_59 = _a.sent();
                    console.error("[Database] Failed to get reminder by ID:", error_59);
                    return [2 /*return*/, null];
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * 获取某个人脉的所有提醒事项
 */
function getRemindersByContactId(contactId, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, error_60;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, db
                            .select()
                            .from(schema_1.reminders)
                            .where((0, drizzle_orm_2.and)((0, drizzle_orm_2.eq)(schema_1.reminders.contactId, contactId), (0, drizzle_orm_2.eq)(schema_1.reminders.userId, userId)))
                            .orderBy((0, drizzle_orm_2.asc)(schema_1.reminders.reminderTime))];
                case 3: return [2 /*return*/, _a.sent()];
                case 4:
                    error_60 = _a.sent();
                    console.error("[Database] Failed to get reminders by contact ID:", error_60);
                    return [2 /*return*/, []];
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * 更新提醒事项
 */
function updateReminder(id, userId, updates) {
    return __awaiter(this, void 0, void 0, function () {
        var db, error_61;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db) {
                        console.warn("[Database] Cannot update reminder: database not available");
                        return [2 /*return*/, null];
                    }
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 5, , 6]);
                    return [4 /*yield*/, db
                            .update(schema_1.reminders)
                            .set(__assign(__assign({}, updates), { updatedAt: new Date() }))
                            .where((0, drizzle_orm_2.and)((0, drizzle_orm_2.eq)(schema_1.reminders.id, id), (0, drizzle_orm_2.eq)(schema_1.reminders.userId, userId)))];
                case 3:
                    _a.sent();
                    return [4 /*yield*/, getReminderById(id)];
                case 4: return [2 /*return*/, _a.sent()];
                case 5:
                    error_61 = _a.sent();
                    console.error("[Database] Failed to update reminder:", error_61);
                    throw error_61;
                case 6: return [2 /*return*/];
            }
        });
    });
}
/**
 * 删除提醒事项
 */
function deleteReminder(id, userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, error_62;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db) {
                        console.warn("[Database] Cannot delete reminder: database not available");
                        return [2 /*return*/, false];
                    }
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, db
                            .delete(schema_1.reminders)
                            .where((0, drizzle_orm_2.and)((0, drizzle_orm_2.eq)(schema_1.reminders.id, id), (0, drizzle_orm_2.eq)(schema_1.reminders.userId, userId)))];
                case 3:
                    _a.sent();
                    return [2 /*return*/, true];
                case 4:
                    error_62 = _a.sent();
                    console.error("[Database] Failed to delete reminder:", error_62);
                    return [2 /*return*/, false];
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * 统计今日有提醒的人数
 */
function getTodayReminderCount(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, today, tomorrow, results, error_63;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, 0];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    today = new Date();
                    today.setHours(0, 0, 0, 0);
                    tomorrow = new Date(today);
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    return [4 /*yield*/, db
                            .selectDistinct({ contactId: schema_1.reminders.contactId })
                            .from(schema_1.reminders)
                            .where((0, drizzle_orm_2.and)((0, drizzle_orm_2.eq)(schema_1.reminders.userId, userId), (0, drizzle_orm_2.eq)(schema_1.reminders.isCompleted, false), (0, drizzle_orm_2.gte)(schema_1.reminders.reminderTime, today), (0, drizzle_orm_2.lt)(schema_1.reminders.reminderTime, tomorrow)))];
                case 3:
                    results = _a.sent();
                    return [2 /*return*/, results.length];
                case 4:
                    error_63 = _a.sent();
                    console.error("[Database] Failed to get today reminder count:", error_63);
                    return [2 /*return*/, 0];
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * 统计本周有提醒的人数
 */
function getWeeklyReminderCount(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, now, dayOfWeek, startOfWeek, endOfWeek, results, error_64;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, 0];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    now = new Date();
                    dayOfWeek = now.getDay();
                    startOfWeek = new Date(now);
                    startOfWeek.setDate(now.getDate() - dayOfWeek);
                    startOfWeek.setHours(0, 0, 0, 0);
                    endOfWeek = new Date(startOfWeek);
                    endOfWeek.setDate(startOfWeek.getDate() + 7);
                    return [4 /*yield*/, db
                            .selectDistinct({ contactId: schema_1.reminders.contactId })
                            .from(schema_1.reminders)
                            .where((0, drizzle_orm_2.and)((0, drizzle_orm_2.eq)(schema_1.reminders.userId, userId), (0, drizzle_orm_2.eq)(schema_1.reminders.isCompleted, false), (0, drizzle_orm_2.gte)(schema_1.reminders.reminderTime, startOfWeek), (0, drizzle_orm_2.lt)(schema_1.reminders.reminderTime, endOfWeek)))];
                case 3:
                    results = _a.sent();
                    return [2 /*return*/, results.length];
                case 4:
                    error_64 = _a.sent();
                    console.error("[Database] Failed to get weekly reminder count:", error_64);
                    return [2 /*return*/, 0];
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * 统计本月有提醒的人数
 */
function getMonthlyReminderCount(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, now, startOfMonth, endOfMonth, results, error_65;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, 0];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    now = new Date();
                    startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
                    endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
                    return [4 /*yield*/, db
                            .selectDistinct({ contactId: schema_1.reminders.contactId })
                            .from(schema_1.reminders)
                            .where((0, drizzle_orm_2.and)((0, drizzle_orm_2.eq)(schema_1.reminders.userId, userId), (0, drizzle_orm_2.eq)(schema_1.reminders.isCompleted, false), (0, drizzle_orm_2.gte)(schema_1.reminders.reminderTime, startOfMonth), (0, drizzle_orm_2.lt)(schema_1.reminders.reminderTime, endOfMonth)))];
                case 3:
                    results = _a.sent();
                    return [2 /*return*/, results.length];
                case 4:
                    error_65 = _a.sent();
                    console.error("[Database] Failed to get monthly reminder count:", error_65);
                    return [2 /*return*/, 0];
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * 获取有提醒的人脉ID列表（用于筛选）
 */
function getContactIdsWithReminders(userId, timeRange) {
    return __awaiter(this, void 0, void 0, function () {
        var db, startTime, endTime, now, dayOfWeek, results, error_66;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    startTime = void 0;
                    endTime = void 0;
                    now = new Date();
                    if (timeRange === 'today') {
                        startTime = new Date(now);
                        startTime.setHours(0, 0, 0, 0);
                        endTime = new Date(startTime);
                        endTime.setDate(endTime.getDate() + 1);
                    }
                    else if (timeRange === 'week') {
                        dayOfWeek = now.getDay();
                        startTime = new Date(now);
                        startTime.setDate(now.getDate() - dayOfWeek);
                        startTime.setHours(0, 0, 0, 0);
                        endTime = new Date(startTime);
                        endTime.setDate(startTime.getDate() + 7);
                    }
                    else { // month
                        startTime = new Date(now.getFullYear(), now.getMonth(), 1);
                        endTime = new Date(now.getFullYear(), now.getMonth() + 1, 1);
                    }
                    return [4 /*yield*/, db
                            .selectDistinct({ contactId: schema_1.reminders.contactId })
                            .from(schema_1.reminders)
                            .where((0, drizzle_orm_2.and)((0, drizzle_orm_2.eq)(schema_1.reminders.userId, userId), (0, drizzle_orm_2.eq)(schema_1.reminders.isCompleted, false), (0, drizzle_orm_2.gte)(schema_1.reminders.reminderTime, startTime), (0, drizzle_orm_2.lt)(schema_1.reminders.reminderTime, endTime)))];
                case 3:
                    results = _a.sent();
                    return [2 /*return*/, results.map(function (r) { return r.contactId; })];
                case 4:
                    error_66 = _a.sent();
                    console.error("[Database] Failed to get contact IDs with reminders:", error_66);
                    return [2 /*return*/, []];
                case 5: return [2 /*return*/];
            }
        });
    });
}
// ==================== 人脉共享相关 ====================
var schema_5 = require("../drizzle/schema");
/**
 * 创建共享连接
 */
function createSharingConnection(data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, db.insert(schema_5.contactSharingConnections).values(data)];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, result[0].insertId];
            }
        });
    });
}
/**
 * 获取共享连接（通过分享者和接收者ID）
 */
function getSharingConnection(sharerId, receiverId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, db.select().from(schema_5.contactSharingConnections)
                            .where((0, drizzle_orm_2.and)((0, drizzle_orm_2.eq)(schema_5.contactSharingConnections.sharerId, sharerId), (0, drizzle_orm_2.eq)(schema_5.contactSharingConnections.receiverId, receiverId)))
                            .limit(1)];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, result.length > 0 ? result[0] : null];
            }
        });
    });
}
/**
 * 获取共享连接（通过ID）
 */
function getSharingConnectionById(id) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, null];
                    return [4 /*yield*/, db.select().from(schema_5.contactSharingConnections)
                            .where((0, drizzle_orm_2.eq)(schema_5.contactSharingConnections.id, id))
                            .limit(1)];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, result.length > 0 ? result[0] : null];
            }
        });
    });
}
/**
 * 获取分享者的所有共享连接
 */
function getSharingConnectionsBySharerId(sharerId) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    return [2 /*return*/, db.select().from(schema_5.contactSharingConnections)
                            .where((0, drizzle_orm_2.eq)(schema_5.contactSharingConnections.sharerId, sharerId))
                            .orderBy((0, drizzle_orm_2.desc)(schema_5.contactSharingConnections.createdAt))];
            }
        });
    });
}
/**
 * 获取接收者的所有共享连接
 */
function getSharingConnectionsByReceiverId(receiverId) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    return [2 /*return*/, db.select().from(schema_5.contactSharingConnections)
                            .where((0, drizzle_orm_2.and)((0, drizzle_orm_2.eq)(schema_5.contactSharingConnections.receiverId, receiverId), (0, drizzle_orm_2.eq)(schema_5.contactSharingConnections.status, 'active')))
                            .orderBy((0, drizzle_orm_2.desc)(schema_5.contactSharingConnections.createdAt))];
            }
        });
    });
}
/**
 * 删除共享连接
 */
function deleteSharingConnection(id) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/];
                    return [4 /*yield*/, db.delete(schema_5.contactSharingConnections).where((0, drizzle_orm_2.eq)(schema_5.contactSharingConnections.id, id))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * 创建共享权限
 */
function createSharingPermission(data) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, db.insert(schema_5.contactSharingPermissions).values(data)];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, result[0].insertId];
            }
        });
    });
}
/**
 * 获取连接的所有权限配置
 */
function getSharingPermissionsByConnectionId(connectionId) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    return [2 /*return*/, db.select().from(schema_5.contactSharingPermissions)
                            .where((0, drizzle_orm_2.eq)(schema_5.contactSharingPermissions.connectionId, connectionId))];
            }
        });
    });
}
/**
 * 更新或创建共享权限
 */
function upsertSharingPermission(connectionId, fieldName, isShared) {
    return __awaiter(this, void 0, void 0, function () {
        var db, existing;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/];
                    return [4 /*yield*/, db.select().from(schema_5.contactSharingPermissions)
                            .where((0, drizzle_orm_2.and)((0, drizzle_orm_2.eq)(schema_5.contactSharingPermissions.connectionId, connectionId), (0, drizzle_orm_2.eq)(schema_5.contactSharingPermissions.fieldName, fieldName)))
                            .limit(1)];
                case 2:
                    existing = _a.sent();
                    if (!(existing.length > 0)) return [3 /*break*/, 4];
                    // 更新
                    return [4 /*yield*/, db.update(schema_5.contactSharingPermissions)
                            .set({ isShared: isShared })
                            .where((0, drizzle_orm_2.eq)(schema_5.contactSharingPermissions.id, existing[0].id))];
                case 3:
                    // 更新
                    _a.sent();
                    return [3 /*break*/, 6];
                case 4: 
                // 创建
                return [4 /*yield*/, db.insert(schema_5.contactSharingPermissions).values({
                        connectionId: connectionId,
                        fieldName: fieldName,
                        isShared: isShared,
                    })];
                case 5:
                    // 创建
                    _a.sent();
                    _a.label = 6;
                case 6: return [2 /*return*/];
            }
        });
    });
}
/**
 * 删除连接的所有权限配置
 */
function deleteSharingPermissionsByConnectionId(connectionId) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/];
                    return [4 /*yield*/, db.delete(schema_5.contactSharingPermissions).where((0, drizzle_orm_2.eq)(schema_5.contactSharingPermissions.connectionId, connectionId))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * 搜索用户（通过用户名或显示名模糊搜索）
 */
function searchUsersByUsername(query) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    return [2 /*return*/, db.select({
                            id: schema_1.users.id,
                            username: schema_1.users.username,
                            name: schema_1.users.name,
                        }).from(schema_1.users)
                            .where((0, drizzle_orm_2.or)((0, drizzle_orm_2.like)(schema_1.users.username, "%".concat(query, "%")), (0, drizzle_orm_2.like)(schema_1.users.name, "%".concat(query, "%"))))
                            .limit(10)];
            }
        });
    });
}
/**
 * 获取家庭下的所有用户
 */
function getUsersByFamilyId(familyId) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/, []];
                    return [2 /*return*/, db.select({
                            id: schema_1.users.id,
                            username: schema_1.users.username,
                            name: schema_1.users.name,
                            sharingEnabled: schema_1.users.sharingEnabled,
                        }).from(schema_1.users)
                            .where((0, drizzle_orm_2.eq)(schema_1.users.familyId, familyId))];
            }
        });
    });
}
/**
 * 批量更新用户的sharingEnabled字段
 */
function updateUsersSharingEnabled(familyId, enabled) {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    if (!db)
                        return [2 /*return*/];
                    return [4 /*yield*/, db.update(schema_1.users)
                            .set({ sharingEnabled: enabled })
                            .where((0, drizzle_orm_2.eq)(schema_1.users.familyId, familyId))];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * 获取用户偏好设置
 */
function getUserPreference(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, db.select().from(schema_1.userPreferences)
                            .where((0, drizzle_orm_2.eq)(schema_1.userPreferences.userId, userId))
                            .limit(1)];
                case 2:
                    result = _a.sent();
                    return [2 /*return*/, result[0] || null];
            }
        });
    });
}
/**
 * 保存或更新用户首页卡片排序
 */
function saveHomeCardOrder(userId, cardOrder) {
    return __awaiter(this, void 0, void 0, function () {
        var db, existing;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, getUserPreference(userId)];
                case 2:
                    existing = _a.sent();
                    if (!existing) return [3 /*break*/, 4];
                    // 更新现有记录
                    return [4 /*yield*/, db.update(schema_1.userPreferences)
                            .set({
                            homeCardOrder: cardOrder,
                            updatedAt: new Date()
                        })
                            .where((0, drizzle_orm_2.eq)(schema_1.userPreferences.userId, userId))];
                case 3:
                    // 更新现有记录
                    _a.sent();
                    return [3 /*break*/, 6];
                case 4: 
                // 创建新记录
                return [4 /*yield*/, db.insert(schema_1.userPreferences).values({
                        userId: userId,
                        homeCardOrder: cardOrder,
                    })];
                case 5:
                    // 创建新记录
                    _a.sent();
                    _a.label = 6;
                case 6: return [2 /*return*/];
            }
        });
    });
}
/**
 * 保存或更新用户主题设置
 */
function saveThemeSettings(userId, colorThemeId, customColors) {
    return __awaiter(this, void 0, void 0, function () {
        var db, existing;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getDb()];
                case 1:
                    db = _a.sent();
                    if (!db)
                        throw new Error("Database not available");
                    return [4 /*yield*/, getUserPreference(userId)];
                case 2:
                    existing = _a.sent();
                    if (!existing) return [3 /*break*/, 4];
                    // 更新现有记录
                    return [4 /*yield*/, db.update(schema_1.userPreferences)
                            .set({
                            colorThemeId: colorThemeId,
                            customColors: customColors,
                            updatedAt: new Date()
                        })
                            .where((0, drizzle_orm_2.eq)(schema_1.userPreferences.userId, userId))];
                case 3:
                    // 更新现有记录
                    _a.sent();
                    return [3 /*break*/, 6];
                case 4: 
                // 创建新记录
                return [4 /*yield*/, db.insert(schema_1.userPreferences).values({
                        userId: userId,
                        colorThemeId: colorThemeId,
                        customColors: customColors,
                    })];
                case 5:
                    // 创建新记录
                    _a.sent();
                    _a.label = 6;
                case 6: return [2 /*return*/];
            }
        });
    });
}
exports.userInsights = (0, mysql_core_1.mysqlTable)('user_insights', {
    id: (0, mysql_core_1.int)('id').autoincrement().primaryKey(),
    userId: (0, mysql_core_1.int)('user_id').notNull().references(function () { return schema_1.users.id; }),
    tags: (0, mysql_core_1.json)('tags').$type().notNull().default('[]'),
    summary: (0, mysql_core_1.text)('summary').notNull(),
    suggestion: (0, mysql_core_1.text)('suggestion').notNull(),
    ownerInsight: (0, mysql_core_1.text)('owner_insight').notNull(),
    periodStart: (0, mysql_core_1.date)('period_start', { mode: 'string' }).notNull(),
    periodEnd: (0, mysql_core_1.date)('period_end', { mode: 'string' }).notNull(),
    createdAt: (0, mysql_core_1.datetime)('created_at', { mode: 'string', fsp: 3 }).default((0, drizzle_orm_1.sql)(templateObject_38 || (templateObject_38 = __makeTemplateObject(["CURRENT_TIMESTAMP(3)"], ["CURRENT_TIMESTAMP(3)"])))),
});
var templateObject_1, templateObject_2, templateObject_3, templateObject_4, templateObject_5, templateObject_6, templateObject_7, templateObject_8, templateObject_9, templateObject_10, templateObject_11, templateObject_12, templateObject_13, templateObject_14, templateObject_15, templateObject_16, templateObject_17, templateObject_18, templateObject_19, templateObject_20, templateObject_21, templateObject_22, templateObject_23, templateObject_24, templateObject_25, templateObject_26, templateObject_27, templateObject_28, templateObject_29, templateObject_30, templateObject_31, templateObject_32, templateObject_33, templateObject_34, templateObject_35, templateObject_36, templateObject_37, templateObject_38;
