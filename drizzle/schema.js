"use strict";
var __makeTemplateObject = (this && this.__makeTemplateObject) || function (cooked, raw) {
    if (Object.defineProperty) { Object.defineProperty(cooked, "raw", { value: raw }); } else { cooked.raw = raw; }
    return cooked;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pointLogs = exports.photos = exports.photoComments = exports.personalContactTags = exports.parentPasswords = exports.loginAttempts = exports.ledgers = exports.ledgerRecordHistory = exports.ledgerRecords = exports.ledgerMembers = exports.ledgerCategories = exports.knowledgeItems = exports.knowledgeCategories = exports.invitations = exports.invitationUsages = exports.homeBanner = exports.gameRewardConfig = exports.gameRecords = exports.gameOrderPreferences = exports.flashcardRecords = exports.featureDefinitions = exports.familyVocabulary = exports.familyViConfig = exports.familyCharacters = exports.familyFeatures = exports.families = exports.exerciseTypes = exports.exerciseRecords = exports.contacts = exports.contactTags = exports.contactTagRelations = exports.contactSharingPermissions = exports.sharingNotifications = exports.contactSharingConnections = exports.contactInteractions = exports.contactFieldValues = exports.contactFieldCategories = exports.contactCustomFields = exports.companyReports = exports.childProfiles = exports.characters = exports.characterLearningRecords = exports.characterGameSettings = exports.brushingSessions = exports.badges = exports.antonyms = exports.albums = exports.addition20Records = exports.addition20Config = exports.addition20Challenges = void 0;
exports.walletAddresses = exports.balanceHistory = exports.rechargeOrders = exports.digitalWallets = exports.bankCards = exports.couponUsage = exports.couponRecipients = exports.coupons = exports.ledgerBackupSettings = exports.workGroups = exports.partnershipDashboardAlerts = exports.partnershipDashboardActivities = exports.partnershipWorkGroupMembers = exports.partnershipMembers = exports.partnershipWorkGroups = exports.partnerships = exports.shippingAddresses = exports.userProfiles = exports.equityContributions = exports.equityRules = exports.equityInvestments = exports.encryptionConfig = exports.reimbursementHistory = exports.ledgerApprovalRecords = exports.ledgerApprovalRules = exports.wrongQuestions = exports.vocabularyMaster = exports.verificationCodes = exports.users = exports.userPreferences = exports.userFeaturePermissions = exports.userFeatureOrder = exports.userBadges = exports.transactions = exports.todos = exports.tasks = exports.taskCompletions = exports.starShopItems = exports.starRewards = exports.starRewardRules = exports.starRedemptions = exports.specialKids = exports.rewards = exports.rewardRedemptions = exports.reminders = exports.reminderTypes = exports.readingStories = exports.readingRecords = exports.pointTransactions = exports.pointRules = void 0;
exports.userInsights = exports.scannerHeartbeat = void 0;
var mysql_core_1 = require("drizzle-orm/mysql-core");
var drizzle_orm_1 = require("drizzle-orm");
exports.addition20Challenges = (0, mysql_core_1.mysqlTable)("addition20_challenges", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    kidId: (0, mysql_core_1.int)().notNull(),
    parentId: (0, mysql_core_1.int)().notNull(),
    targetCorrectCount: (0, mysql_core_1.int)().notNull(),
    penaltyPerWrong: (0, mysql_core_1.int)().default(0).notNull(),
    rewardTitle: (0, mysql_core_1.varchar)({ length: 100 }).notNull(),
    rewardImageUrl: (0, mysql_core_1.text)(),
    rewardFileKey: (0, mysql_core_1.varchar)({ length: 255 }),
    currentCorrectCount: (0, mysql_core_1.int)().default(0).notNull(),
    totalAttempted: (0, mysql_core_1.int)().default(0).notNull(),
    totalCorrect: (0, mysql_core_1.int)().default(0).notNull(),
    totalWrong: (0, mysql_core_1.int)().default(0).notNull(),
    status: (0, mysql_core_1.mysqlEnum)(['active', 'paused', 'completed', 'cancelled']).default('active').notNull(),
    startedAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    lastPlayedAt: (0, mysql_core_1.timestamp)({ mode: 'string' }),
    completedAt: (0, mysql_core_1.timestamp)({ mode: 'string' }),
    createdAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});
exports.addition20Config = (0, mysql_core_1.mysqlTable)("addition20_config", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    kidId: (0, mysql_core_1.int)().notNull(),
    difficulty: (0, mysql_core_1.mysqlEnum)(['easy', 'medium', 'hard']).default('easy').notNull(),
    questionCount: (0, mysql_core_1.int)().default(10).notNull(),
    answerMode: (0, mysql_core_1.mysqlEnum)(['choice', 'input']).default('choice').notNull(),
    createdAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
}, function (table) { return [
    (0, mysql_core_1.index)("addition20_config_kidId_unique").on(table.kidId),
]; });
exports.addition20Records = (0, mysql_core_1.mysqlTable)("addition20_records", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    kidId: (0, mysql_core_1.int)().notNull(),
    difficulty: (0, mysql_core_1.mysqlEnum)(['easy', 'medium', 'hard']).notNull(),
    questionCount: (0, mysql_core_1.int)().notNull(),
    correctCount: (0, mysql_core_1.int)().notNull(),
    duration: (0, mysql_core_1.int)().notNull(),
    answerMode: (0, mysql_core_1.mysqlEnum)(['choice', 'input']).notNull(),
    starsEarned: (0, mysql_core_1.int)().default(0).notNull(),
    createdAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});
exports.albums = (0, mysql_core_1.mysqlTable)("albums", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    userId: (0, mysql_core_1.int)().notNull(),
    childId: (0, mysql_core_1.int)(),
    name: (0, mysql_core_1.varchar)({ length: 100 }).notNull(),
    description: (0, mysql_core_1.text)(),
    coverImage: (0, mysql_core_1.text)(),
    isPublic: (0, mysql_core_1.tinyint)().default(0).notNull(),
    createdAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});
exports.antonyms = (0, mysql_core_1.mysqlTable)("antonyms", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    word: (0, mysql_core_1.varchar)({ length: 50 }).notNull(),
    antonym: (0, mysql_core_1.varchar)({ length: 50 }).notNull(),
    category: (0, mysql_core_1.varchar)({ length: 50 }).default('general').notNull(),
    difficulty: (0, mysql_core_1.mysqlEnum)(['easy', 'medium', 'hard']).default('easy').notNull(),
    isActive: (0, mysql_core_1.tinyint)().default(1).notNull(),
    createdAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});
exports.badges = (0, mysql_core_1.mysqlTable)("badges", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    name: (0, mysql_core_1.varchar)({ length: 100 }).notNull(),
    description: (0, mysql_core_1.text)(),
    icon: (0, mysql_core_1.varchar)({ length: 50 }),
    color: (0, mysql_core_1.varchar)({ length: 20 }),
    requirement: (0, mysql_core_1.text)(),
    pointsRequired: (0, mysql_core_1.int)().default(0).notNull(),
    createdAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});
exports.brushingSessions = (0, mysql_core_1.mysqlTable)("brushing_sessions", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    kidId: (0, mysql_core_1.int)().notNull(),
    duration: (0, mysql_core_1.int)().notNull(),
    completed: (0, mysql_core_1.tinyint)().default(1).notNull(),
    starsEarned: (0, mysql_core_1.int)().default(1).notNull(),
    createdAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});
exports.characterGameSettings = (0, mysql_core_1.mysqlTable)("character_game_settings", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    kidId: (0, mysql_core_1.int)().notNull(),
    autoPlayCount: (0, mysql_core_1.int)().default(1).notNull(),
    createdAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
}, function (table) { return [
    (0, mysql_core_1.index)("character_game_settings_kidId_unique").on(table.kidId),
]; });
exports.characterLearningRecords = (0, mysql_core_1.mysqlTable)("character_learning_records", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    kidId: (0, mysql_core_1.int)().notNull(),
    characterId: (0, mysql_core_1.int)().notNull(),
    isCorrect: (0, mysql_core_1.tinyint)().notNull(),
    selectedAnswer: (0, mysql_core_1.varchar)({ length: 10 }),
    createdAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});
exports.characters = (0, mysql_core_1.mysqlTable)("characters", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    character: (0, mysql_core_1.varchar)({ length: 10 }).notNull(),
    pinyin: (0, mysql_core_1.varchar)({ length: 50 }).notNull(),
    imageUrl: (0, mysql_core_1.text)().notNull(),
    fileKey: (0, mysql_core_1.varchar)({ length: 255 }).notNull(),
    category: (0, mysql_core_1.varchar)({ length: 50 }).notNull(),
    difficulty: (0, mysql_core_1.int)().default(1).notNull(),
    strokeCount: (0, mysql_core_1.int)().default(0).notNull(),
    commonWords: (0, mysql_core_1.json)(),
    isActive: (0, mysql_core_1.tinyint)().default(1).notNull(),
    createdAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});
exports.childProfiles = (0, mysql_core_1.mysqlTable)("child_profiles", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    parentId: (0, mysql_core_1.int)().notNull(),
    name: (0, mysql_core_1.varchar)({ length: 100 }).notNull(),
    avatar: (0, mysql_core_1.longtext)(),
    birthday: (0, mysql_core_1.timestamp)({ mode: 'string' }),
    points: (0, mysql_core_1.int)().default(0).notNull(),
    createdAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});
exports.companyReports = (0, mysql_core_1.mysqlTable)("company_reports", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    companyName: (0, mysql_core_1.varchar)("company_name", { length: 255 }).notNull(),
    reportFileUrl: (0, mysql_core_1.text)("report_file_url"),
    rawText: (0, mysql_core_1.longtext)("raw_text"),
    formattedContent: (0, mysql_core_1.text)("formatted_content").notNull(),
    uploadedBy: (0, mysql_core_1.int)("uploaded_by"),
    createdAt: (0, mysql_core_1.timestamp)("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: (0, mysql_core_1.timestamp)("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
}, function (table) { return [
    (0, mysql_core_1.index)("company_reports_company_name_unique").on(table.companyName),
]; });
exports.contactCustomFields = (0, mysql_core_1.mysqlTable)("contact_custom_fields", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    contactId: (0, mysql_core_1.int)().notNull(),
    fieldName: (0, mysql_core_1.varchar)({ length: 100 }).notNull(),
    fieldValue: (0, mysql_core_1.text)(),
    sortOrder: (0, mysql_core_1.int)().default(0).notNull(),
    createdAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});
exports.contactFieldCategories = (0, mysql_core_1.mysqlTable)("contact_field_categories", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    parentUserId: (0, mysql_core_1.int)().notNull(),
    name: (0, mysql_core_1.varchar)({ length: 100 }).notNull(),
    fieldType: (0, mysql_core_1.varchar)({ length: 20 }).default('text').notNull(),
    options: (0, mysql_core_1.json)(),
    sortOrder: (0, mysql_core_1.int)().default(0).notNull(),
    isRequired: (0, mysql_core_1.tinyint)().default(0).notNull(),
    createdAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
    parentCategoryId: (0, mysql_core_1.int)().default(0),
    icon: (0, mysql_core_1.varchar)({ length: 50 }),
});
exports.contactFieldValues = (0, mysql_core_1.mysqlTable)("contact_field_values", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    contactId: (0, mysql_core_1.int)().notNull(),
    categoryId: (0, mysql_core_1.int)().notNull(),
    categoryName: (0, mysql_core_1.varchar)({ length: 50 }).default(''),
    value: (0, mysql_core_1.text)(),
    sortOrder: (0, mysql_core_1.int)().default(0),
    createdAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});
exports.contactInteractions = (0, mysql_core_1.mysqlTable)("contact_interactions", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    contactId: (0, mysql_core_1.int)().notNull(),
    interactionDate: (0, mysql_core_1.timestamp)({ mode: 'string' }).notNull(),
    note: (0, mysql_core_1.text)(),
    createdAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});
exports.contactSharingConnections = (0, mysql_core_1.mysqlTable)("contact_sharing_connections", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    sharerId: (0, mysql_core_1.int)().notNull(),
    receiverId: (0, mysql_core_1.int)().notNull(),
    status: (0, mysql_core_1.mysqlEnum)(['pending', 'active', 'rejected']).default('pending').notNull(),
    note: (0, mysql_core_1.text)(),
    createdAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});
exports.sharingNotifications = (0, mysql_core_1.mysqlTable)("sharing_notifications", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    receiverId: (0, mysql_core_1.int)('receiver_id').notNull(),
    actorId: (0, mysql_core_1.int)('actor_id').notNull(),
    actorName: (0, mysql_core_1.varchar)('actor_name', { length: 100 }),
    type: (0, mysql_core_1.mysqlEnum)(['added', 'removed']).notNull(),
    isRead: (0, mysql_core_1.tinyint)('is_read').default(0).notNull(),
    createdAt: (0, mysql_core_1.timestamp)('created_at', { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});
exports.contactSharingPermissions = (0, mysql_core_1.mysqlTable)("contact_sharing_permissions", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    connectionId: (0, mysql_core_1.int)().notNull(),
    fieldName: (0, mysql_core_1.varchar)({ length: 100 }).notNull(),
    isShared: (0, mysql_core_1.tinyint)().default(1).notNull(),
    createdAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});
exports.contactTagRelations = (0, mysql_core_1.mysqlTable)("contact_tag_relations", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    contactId: (0, mysql_core_1.int)().notNull(),
    tagId: (0, mysql_core_1.int)().notNull(),
    createdAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});
exports.contactTags = (0, mysql_core_1.mysqlTable)("contact_tags", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    parentUserId: (0, mysql_core_1.int)().notNull(),
    name: (0, mysql_core_1.varchar)({ length: 50 }).notNull(),
    color: (0, mysql_core_1.varchar)({ length: 20 }).default('#3b82f6').notNull(),
    sortOrder: (0, mysql_core_1.int)().default(0).notNull(),
    isPreset: (0, mysql_core_1.tinyint)().default(0).notNull(),
    createdAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});
exports.contacts = (0, mysql_core_1.mysqlTable)("contacts", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    parentUserId: (0, mysql_core_1.int)().notNull(),
    name: (0, mysql_core_1.varchar)({ length: 100 }).notNull(),
    title: (0, mysql_core_1.varchar)({ length: 50 }),
    gender: (0, mysql_core_1.varchar)({ length: 10 }),
    birthDate: (0, mysql_core_1.varchar)({ length: 20 }),
    occupation: (0, mysql_core_1.varchar)({ length: 100 }),
    address: (0, mysql_core_1.text)(),
    region: (0, mysql_core_1.varchar)({ length: 50 }),
    wechat: (0, mysql_core_1.varchar)({ length: 100 }),
    phone: (0, mysql_core_1.varchar)({ length: 20 }),
    tags: (0, mysql_core_1.json)(),
    referrerId: (0, mysql_core_1.int)(),
    linkedUserId: (0, mysql_core_1.int)(),
    avatar: (0, mysql_core_1.longtext)(),
    isBlacklisted: (0, mysql_core_1.tinyint)().default(0).notNull(),
    createdAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});
exports.exerciseRecords = (0, mysql_core_1.mysqlTable)("exercise_records", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    userId: (0, mysql_core_1.int)().notNull(),
    exerciseTypeId: (0, mysql_core_1.int)().notNull(),
    count: (0, mysql_core_1.int)().notNull(),
    // you can use { mode: 'date' }, if you want to have Date as type for this column
    recordDate: (0, mysql_core_1.date)({ mode: 'string' }).notNull(),
    createdAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});
exports.exerciseTypes = (0, mysql_core_1.mysqlTable)("exercise_types", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    userId: (0, mysql_core_1.int)().notNull(),
    name: (0, mysql_core_1.varchar)({ length: 50 }).notNull(),
    icon: (0, mysql_core_1.varchar)({ length: 50 }).default('💪'),
    isActive: (0, mysql_core_1.tinyint)().default(1).notNull(),
    sortOrder: (0, mysql_core_1.int)().default(0).notNull(),
    createdAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});
exports.families = (0, mysql_core_1.mysqlTable)("families", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    name: (0, mysql_core_1.varchar)({ length: 100 }).notNull(),
    description: (0, mysql_core_1.text)(),
    avatar: (0, mysql_core_1.longtext)(),
    createdBy: (0, mysql_core_1.int)().notNull(),
    createdAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});
exports.familyFeatures = (0, mysql_core_1.mysqlTable)("familyFeatures", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    familyId: (0, mysql_core_1.int)().notNull(),
    featureName: (0, mysql_core_1.varchar)({ length: 50 }).notNull(),
    subFeatureName: (0, mysql_core_1.varchar)({ length: 100 }).notNull(),
    parentFeature: (0, mysql_core_1.varchar)({ length: 100 }),
    level: (0, mysql_core_1.int)().default(1).notNull(),
    path: (0, mysql_core_1.varchar)({ length: 500 }),
    displayOrder: (0, mysql_core_1.int)().default(0).notNull(),
    enabled: (0, mysql_core_1.tinyint)().default(0).notNull(),
    settings: (0, mysql_core_1.json)(),
    createdAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});
exports.familyCharacters = (0, mysql_core_1.mysqlTable)("family_characters", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    familyId: (0, mysql_core_1.int)().notNull(),
    character: (0, mysql_core_1.varchar)({ length: 10 }).notNull(),
    pinyin: (0, mysql_core_1.varchar)({ length: 50 }).notNull(),
    imageUrl: (0, mysql_core_1.text)(),
    fileKey: (0, mysql_core_1.varchar)({ length: 255 }),
    category: (0, mysql_core_1.varchar)({ length: 50 }).default('自定义').notNull(),
    difficulty: (0, mysql_core_1.int)().default(1).notNull(),
    commonWords: (0, mysql_core_1.json)(),
    notes: (0, mysql_core_1.text)(),
    isActive: (0, mysql_core_1.tinyint)().default(1).notNull(),
    createdBy: (0, mysql_core_1.int)().notNull(),
    createdAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});
exports.familyViConfig = (0, mysql_core_1.mysqlTable)("family_vi_config", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    parentUserId: (0, mysql_core_1.int)().notNull(),
    viThemeId: (0, mysql_core_1.varchar)({ length: 50 }),
    customConfig: (0, mysql_core_1.json)(),
    isActive: (0, mysql_core_1.tinyint)().default(1).notNull(),
    createdBy: (0, mysql_core_1.int)().notNull(),
    createdAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
}, function (table) { return [
    (0, mysql_core_1.index)("family_vi_config_parentUserId_unique").on(table.parentUserId),
]; });
exports.familyVocabulary = (0, mysql_core_1.mysqlTable)("family_vocabulary", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    parentUserId: (0, mysql_core_1.int)().notNull(),
    vocabularyId: (0, mysql_core_1.int)().notNull(),
    kidId: (0, mysql_core_1.int)(),
    addedBy: (0, mysql_core_1.int)().notNull(),
    customNote: (0, mysql_core_1.text)(),
    masteryLevel: (0, mysql_core_1.mysqlEnum)(['not_started', 'learning', 'mastered']).default('not_started').notNull(),
    createdAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});
exports.featureDefinitions = (0, mysql_core_1.mysqlTable)("feature_definitions", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    featureId: (0, mysql_core_1.int)().notNull(),
    title: (0, mysql_core_1.varchar)({ length: 100 }).notNull(),
    description: (0, mysql_core_1.text)(),
    isActive: (0, mysql_core_1.tinyint)().default(1).notNull(),
    defaultPosition: (0, mysql_core_1.int)().notNull(),
    createdBy: (0, mysql_core_1.int)().notNull(),
    createdAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
}, function (table) { return [
    (0, mysql_core_1.index)("feature_definitions_featureId_unique").on(table.featureId),
]; });
exports.flashcardRecords = (0, mysql_core_1.mysqlTable)("flashcard_records", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    kidId: (0, mysql_core_1.int)().notNull(),
    characterId: (0, mysql_core_1.int)().notNull(),
    knownCount: (0, mysql_core_1.int)().default(0).notNull(),
    forgottenCount: (0, mysql_core_1.int)().default(0).notNull(),
    lastInteraction: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    createdAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});
exports.gameOrderPreferences = (0, mysql_core_1.mysqlTable)("game_order_preferences", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    kidId: (0, mysql_core_1.int)().notNull(),
    gameOrders: (0, mysql_core_1.text)().notNull(),
    createdAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
}, function (table) { return [
    (0, mysql_core_1.index)("game_order_preferences_kidId_unique").on(table.kidId),
]; });
exports.gameRecords = (0, mysql_core_1.mysqlTable)("game_records", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    userId: (0, mysql_core_1.int)().notNull(),
    childId: (0, mysql_core_1.int)(),
    gameType: (0, mysql_core_1.mysqlEnum)(['memory', 'puzzle', 'math']).notNull(),
    score: (0, mysql_core_1.int)().default(0).notNull(),
    level: (0, mysql_core_1.int)().default(1).notNull(),
    duration: (0, mysql_core_1.int)().default(0).notNull(),
    completedAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    createdAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});
exports.gameRewardConfig = (0, mysql_core_1.mysqlTable)("game_reward_config", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    familyId: (0, mysql_core_1.int)(),
    gameType: (0, mysql_core_1.varchar)({ length: 50 }).notNull(),
    activityType: (0, mysql_core_1.varchar)({ length: 50 }).notNull(),
    starsReward: (0, mysql_core_1.int)().default(1).notNull(),
    description: (0, mysql_core_1.text)(),
    isActive: (0, mysql_core_1.tinyint)().default(1).notNull(),
    createdBy: (0, mysql_core_1.int)().notNull(),
    createdAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});
exports.homeBanner = (0, mysql_core_1.mysqlTable)("homeBanner", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    title: (0, mysql_core_1.varchar)({ length: 200 }),
    description: (0, mysql_core_1.text)(),
    imageUrl: (0, mysql_core_1.text)(),
    isActive: (0, mysql_core_1.tinyint)().default(1).notNull(),
    createdAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});
exports.invitationUsages = (0, mysql_core_1.mysqlTable)("invitation_usages", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    invitationId: (0, mysql_core_1.int)().notNull(),
    userId: (0, mysql_core_1.int)().notNull(),
    familyId: (0, mysql_core_1.int)().notNull(),
    usedAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});
exports.invitations = (0, mysql_core_1.mysqlTable)("invitations", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    code: (0, mysql_core_1.varchar)({ length: 32 }).notNull(),
    familyName: (0, mysql_core_1.varchar)({ length: 100 }),
    maxUses: (0, mysql_core_1.int)().default(1).notNull(),
    usedCount: (0, mysql_core_1.int)().default(0).notNull(),
    expiresAt: (0, mysql_core_1.timestamp)({ mode: 'string' }),
    isActive: (0, mysql_core_1.tinyint)().default(1).notNull(),
    createdBy: (0, mysql_core_1.int)().notNull(),
    createdAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
}, function (table) { return [
    (0, mysql_core_1.index)("invitations_code_unique").on(table.code),
]; });
exports.knowledgeCategories = (0, mysql_core_1.mysqlTable)("knowledge_categories", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    name: (0, mysql_core_1.varchar)({ length: 100 }).notNull(),
    icon: (0, mysql_core_1.varchar)({ length: 50 }),
    color: (0, mysql_core_1.varchar)({ length: 20 }),
    description: (0, mysql_core_1.text)(),
    sortOrder: (0, mysql_core_1.int)().default(0).notNull(),
    createdAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});
exports.knowledgeItems = (0, mysql_core_1.mysqlTable)("knowledge_items", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    categoryId: (0, mysql_core_1.int)().notNull(),
    title: (0, mysql_core_1.varchar)({ length: 200 }).notNull(),
    content: (0, mysql_core_1.text)().notNull(),
    coverImage: (0, mysql_core_1.text)(),
    images: (0, mysql_core_1.json)(),
    viewCount: (0, mysql_core_1.int)().default(0).notNull(),
    isPublished: (0, mysql_core_1.tinyint)().default(1).notNull(),
    createdBy: (0, mysql_core_1.int)().notNull(),
    createdAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});
exports.ledgerCategories = (0, mysql_core_1.mysqlTable)("ledger_categories", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    ledgerId: (0, mysql_core_1.int)().notNull(),
    name: (0, mysql_core_1.varchar)({ length: 50 }).notNull(),
    type: (0, mysql_core_1.mysqlEnum)(['income', 'expense']).notNull(),
    parentId: (0, mysql_core_1.int)(),
    icon: (0, mysql_core_1.text)(),
    color: (0, mysql_core_1.varchar)({ length: 20 }),
    sortOrder: (0, mysql_core_1.int)().default(0).notNull(),
    isDefault: (0, mysql_core_1.tinyint)().default(0).notNull(),
    createdBy: (0, mysql_core_1.int)().notNull(),
    createdAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});
exports.ledgerMembers = (0, mysql_core_1.mysqlTable)("ledger_members", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    ledgerId: (0, mysql_core_1.int)().notNull(),
    userId: (0, mysql_core_1.int)().notNull(),
    role: (0, mysql_core_1.mysqlEnum)(['owner', 'admin', 'member']).default('member').notNull(),
    nickname: (0, mysql_core_1.varchar)({ length: 50 }),
    memberType: (0, mysql_core_1.mysqlEnum)("member_type", ['real', 'ai']).default('real').notNull(),
    avatarType: (0, mysql_core_1.varchar)("avatar_type", { length: 50 }),
    permissionView: (0, mysql_core_1.mysqlEnum)("permission_view", ['all', 'own', 'none']).default('all').notNull(),
    permissionAdd: (0, mysql_core_1.mysqlEnum)("permission_add", ['all', 'own', 'none']).default('all').notNull(),
    permissionEdit: (0, mysql_core_1.mysqlEnum)("permission_edit", ['all', 'own', 'none']).default('own').notNull(),
    permissionDelete: (0, mysql_core_1.mysqlEnum)("permission_delete", ['all', 'own', 'none']).default('own').notNull(),
    permissionBackup: (0, mysql_core_1.mysqlEnum)("permission_backup", ['allow', 'none']).default('allow').notNull(),
    canEdit: (0, mysql_core_1.tinyint)().default(1).notNull(),
    canDelete: (0, mysql_core_1.tinyint)().default(0).notNull(),
    canInvite: (0, mysql_core_1.tinyint)().default(0).notNull(),
    invitedBy: (0, mysql_core_1.int)(),
    createdAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});
exports.ledgerRecords = (0, mysql_core_1.mysqlTable)("ledger_records", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    ledgerId: (0, mysql_core_1.int)().notNull(),
    type: (0, mysql_core_1.mysqlEnum)(['income', 'expense']).notNull(),
    amount: (0, mysql_core_1.decimal)({ precision: 10, scale: 2 }).notNull(),
    categoryId: (0, mysql_core_1.int)(),
    description: (0, mysql_core_1.text)(),
    imageUrl: (0, mysql_core_1.text)(),
    recordDate: (0, mysql_core_1.date)({ mode: 'string' }).notNull(),
    createdBy: (0, mysql_core_1.int)().notNull(),
    reimbursementStatus: (0, mysql_core_1.mysqlEnum)('reimbursement_status', ['none', 'pending', 'completed']).default('none').notNull(),
    reimbursementAmount: (0, mysql_core_1.decimal)('reimbursement_amount', { precision: 10, scale: 2 }),
    reimbursedAt: (0, mysql_core_1.timestamp)('reimbursed_at', { mode: 'string' }),
    reimbursedBy: (0, mysql_core_1.int)('reimbursed_by'),
    reimbursementNotes: (0, mysql_core_1.text)('reimbursement_notes'),
    reimbursementVoucherUrl: (0, mysql_core_1.text)('reimbursement_voucher_url'),
    pendingType: (0, mysql_core_1.mysqlEnum)('pending_type', ['receivable', 'payable']),
    pendingIncludeStats: (0, mysql_core_1.tinyint)('pending_include_stats').default(1),
    createdAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
    deletedAt: (0, mysql_core_1.timestamp)('deleted_at', { mode: 'string' }),
    deletedBy: (0, mysql_core_1.int)('deleted_by'),
});
exports.ledgerRecordHistory = (0, mysql_core_1.mysqlTable)("ledger_record_history", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    recordId: (0, mysql_core_1.int)().notNull(),
    ledgerId: (0, mysql_core_1.int)().notNull(),
    userId: (0, mysql_core_1.int)().notNull(),
    field: (0, mysql_core_1.varchar)({ length: 50 }).notNull(),
    oldValue: (0, mysql_core_1.text)(),
    newValue: (0, mysql_core_1.text)(),
    createdAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});
exports.ledgers = (0, mysql_core_1.mysqlTable)("ledgers", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    name: (0, mysql_core_1.varchar)({ length: 100 }).notNull(),
    description: (0, mysql_core_1.text)(),
    type: (0, mysql_core_1.varchar)({ length: 50 }).default('personal').notNull(),
    currency: (0, mysql_core_1.varchar)({ length: 10 }).default('CNY').notNull(),
    icon: (0, mysql_core_1.text)(),
    createdBy: (0, mysql_core_1.int)().default(0).notNull(),
    ownerId: (0, mysql_core_1.int)().notNull(),
    // groupId: int("group_id"), // 所属工作群ID，为null表示普通账本 - 临时注释等待数据库迁移
    isVip: (0, mysql_core_1.tinyint)().default(0).notNull(),
    isArchived: (0, mysql_core_1.tinyint)().default(0).notNull(),
    enableReimbursement: (0, mysql_core_1.tinyint)("enable_reimbursement").default(1).notNull(),
    enablePending: (0, mysql_core_1.tinyint)("enable_pending").default(0).notNull(),
    pendingDefaultIncludeStats: (0, mysql_core_1.tinyint)("pending_default_include_stats").default(1).notNull(),
    requireImage: (0, mysql_core_1.tinyint)("require_image").default(0).notNull(),
    defaultPermissionView: (0, mysql_core_1.mysqlEnum)("default_permission_view", ['all', 'own', 'none']).default('own').notNull(),
    defaultPermissionAdd: (0, mysql_core_1.mysqlEnum)("default_permission_add", ['all', 'own', 'none']).default('own').notNull(),
    defaultPermissionEdit: (0, mysql_core_1.mysqlEnum)("default_permission_edit", ['all', 'own', 'none']).default('own').notNull(),
    defaultPermissionDelete: (0, mysql_core_1.mysqlEnum)("default_permission_delete", ['all', 'own', 'none']).default('own').notNull(),
    defaultPermissionBackup: (0, mysql_core_1.mysqlEnum)("default_permission_backup", ['allow', 'none']).default('allow').notNull(),
    createdAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
}, function (table) { return [
// index("idx_group_id").on(table.groupId), // 临时注释等待数据库迁移
]; });
exports.loginAttempts = (0, mysql_core_1.mysqlTable)("login_attempts", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    ipAddress: (0, mysql_core_1.varchar)({ length: 45 }).notNull(),
    username: (0, mysql_core_1.varchar)({ length: 50 }),
    success: (0, mysql_core_1.tinyint)().default(0).notNull(),
    attemptedAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});
exports.parentPasswords = (0, mysql_core_1.mysqlTable)("parent_passwords", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    userId: (0, mysql_core_1.int)().notNull(),
    passwordHash: (0, mysql_core_1.varchar)({ length: 255 }).notNull(),
    createdAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
}, function (table) { return [
    (0, mysql_core_1.index)("parent_passwords_userId_unique").on(table.userId),
]; });
exports.personalContactTags = (0, mysql_core_1.mysqlTable)("personal_contact_tags", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    contactId: (0, mysql_core_1.int)().notNull(),
    parentUserId: (0, mysql_core_1.int)().notNull(),
    name: (0, mysql_core_1.varchar)({ length: 50 }).notNull(),
    color: (0, mysql_core_1.varchar)({ length: 20 }).default('#A80000').notNull(),
    createdAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});
exports.photoComments = (0, mysql_core_1.mysqlTable)("photo_comments", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    photoId: (0, mysql_core_1.int)().notNull(),
    userId: (0, mysql_core_1.int)().notNull(),
    content: (0, mysql_core_1.text)().notNull(),
    createdAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});
exports.photos = (0, mysql_core_1.mysqlTable)("photos", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    albumId: (0, mysql_core_1.int)().notNull(),
    userId: (0, mysql_core_1.int)().notNull(),
    url: (0, mysql_core_1.text)().notNull(),
    fileKey: (0, mysql_core_1.varchar)({ length: 255 }).notNull(),
    thumbnail: (0, mysql_core_1.text)(),
    description: (0, mysql_core_1.text)(),
    takenAt: (0, mysql_core_1.timestamp)({ mode: 'string' }),
    createdAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});
exports.pointLogs = (0, mysql_core_1.mysqlTable)("point_logs", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    userId: (0, mysql_core_1.int)().notNull(),
    actionType: (0, mysql_core_1.varchar)({ length: 50 }),
    points: (0, mysql_core_1.int)().notNull(),
    description: (0, mysql_core_1.text)().notNull(),
    operatorId: (0, mysql_core_1.int)(),
    relatedId: (0, mysql_core_1.int)(),
    createdAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
}, function (table) { return [
    (0, mysql_core_1.index)("idx_userId").on(table.userId),
    (0, mysql_core_1.index)("idx_createdAt").on(table.createdAt),
]; });
exports.pointRules = (0, mysql_core_1.mysqlTable)("point_rules", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    actionType: (0, mysql_core_1.varchar)({ length: 50 }).notNull(),
    actionName: (0, mysql_core_1.varchar)({ length: 100 }).notNull(),
    points: (0, mysql_core_1.int)().default(0).notNull(),
    isActive: (0, mysql_core_1.tinyint)().default(1).notNull(),
    description: (0, mysql_core_1.text)(),
    createdAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
}, function (table) { return [
    (0, mysql_core_1.index)("actionType").on(table.actionType),
]; });
exports.pointTransactions = (0, mysql_core_1.mysqlTable)("point_transactions", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    userId: (0, mysql_core_1.int)().notNull(),
    childId: (0, mysql_core_1.int)(),
    amount: (0, mysql_core_1.int)().notNull(),
    type: (0, mysql_core_1.mysqlEnum)(['game', 'task', 'reward', 'admin']).notNull(),
    referenceId: (0, mysql_core_1.int)(),
    description: (0, mysql_core_1.text)(),
    createdAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});
exports.readingRecords = (0, mysql_core_1.mysqlTable)("reading_records", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    kidId: (0, mysql_core_1.int)().notNull(),
    storyId: (0, mysql_core_1.int)().notNull(),
    clickCount: (0, mysql_core_1.int)().default(0).notNull(),
    readDuration: (0, mysql_core_1.int)().default(0).notNull(),
    completedAt: (0, mysql_core_1.timestamp)({ mode: 'string' }),
    createdAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});
exports.readingStories = (0, mysql_core_1.mysqlTable)("reading_stories", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    title: (0, mysql_core_1.varchar)({ length: 200 }).notNull(),
    content: (0, mysql_core_1.text)().notNull(),
    type: (0, mysql_core_1.mysqlEnum)(['template', 'custom', 'ai_generated']).default('template').notNull(),
    coverImageUrl: (0, mysql_core_1.text)(),
    createdBy: (0, mysql_core_1.int)(),
    kidId: (0, mysql_core_1.int)(),
    wordCount: (0, mysql_core_1.int)().notNull(),
    isActive: (0, mysql_core_1.tinyint)().default(1).notNull(),
    createdAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});
exports.reminderTypes = (0, mysql_core_1.mysqlTable)("reminder_types", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    userId: (0, mysql_core_1.int)().notNull(),
    name: (0, mysql_core_1.varchar)({ length: 50 }).notNull(),
    icon: (0, mysql_core_1.varchar)({ length: 50 }).default('🔔'),
    color: (0, mysql_core_1.varchar)({ length: 20 }).default('#6366f1'),
    isDefault: (0, mysql_core_1.tinyint)().default(0).notNull(),
    createdAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});
exports.reminders = (0, mysql_core_1.mysqlTable)("reminders", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    contactId: (0, mysql_core_1.int)().notNull(),
    userId: (0, mysql_core_1.int)().notNull(),
    reminderTypeId: (0, mysql_core_1.int)(),
    title: (0, mysql_core_1.varchar)({ length: 200 }).notNull(),
    description: (0, mysql_core_1.text)(),
    reminderTime: (0, mysql_core_1.timestamp)({ mode: 'string' }).notNull(),
    reminderType: (0, mysql_core_1.mysqlEnum)(['normal', 'birthday']).default('normal').notNull(),
    isRecurring: (0, mysql_core_1.tinyint)().default(0).notNull(),
    birthMonth: (0, mysql_core_1.int)(),
    birthDay: (0, mysql_core_1.int)(),
    notificationMethod: (0, mysql_core_1.mysqlEnum)(['in_app', 'in_app_sound']).default('in_app').notNull(),
    isCompleted: (0, mysql_core_1.tinyint)().default(0).notNull(),
    createdAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});
exports.rewardRedemptions = (0, mysql_core_1.mysqlTable)("reward_redemptions", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    rewardId: (0, mysql_core_1.int)().notNull(),
    userId: (0, mysql_core_1.int)().notNull(),
    childId: (0, mysql_core_1.int)(),
    pointsSpent: (0, mysql_core_1.int)().notNull(),
    status: (0, mysql_core_1.mysqlEnum)(['pending', 'approved', 'rejected', 'completed']).default('pending').notNull(),
    redeemedAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    processedAt: (0, mysql_core_1.timestamp)({ mode: 'string' }),
});
exports.rewards = (0, mysql_core_1.mysqlTable)("rewards", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    createdBy: (0, mysql_core_1.int)().notNull(),
    familyId: (0, mysql_core_1.int)(),
    name: (0, mysql_core_1.varchar)({ length: 100 }).notNull(),
    description: (0, mysql_core_1.text)(),
    icon: (0, mysql_core_1.text)(),
    pointsCost: (0, mysql_core_1.int)().default(100).notNull(),
    stock: (0, mysql_core_1.int)().default(-1).notNull(),
    isActive: (0, mysql_core_1.tinyint)().default(1).notNull(),
    createdAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});
exports.specialKids = (0, mysql_core_1.mysqlTable)("special_kids", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    userId: (0, mysql_core_1.int)(),
    parentUserId: (0, mysql_core_1.int)(),
    name: (0, mysql_core_1.varchar)({ length: 50 }).notNull(),
    avatar: (0, mysql_core_1.longtext)(),
    stars: (0, mysql_core_1.int)().default(0).notNull(),
    position: (0, mysql_core_1.mysqlEnum)(['left', 'right']).notNull(),
    createdAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});
exports.starRedemptions = (0, mysql_core_1.mysqlTable)("star_redemptions", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    kidId: (0, mysql_core_1.int)().notNull(),
    itemId: (0, mysql_core_1.int)().notNull(),
    starsSpent: (0, mysql_core_1.int)().notNull(),
    status: (0, mysql_core_1.mysqlEnum)(['pending', 'approved', 'rejected', 'completed']).default('pending').notNull(),
    redeemedAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    processedAt: (0, mysql_core_1.timestamp)({ mode: 'string' }),
});
exports.starRewardRules = (0, mysql_core_1.mysqlTable)("star_reward_rules", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    activityType: (0, mysql_core_1.varchar)({ length: 50 }).notNull(),
    activityName: (0, mysql_core_1.varchar)({ length: 100 }).notNull(),
    starsReward: (0, mysql_core_1.int)().default(1).notNull(),
    description: (0, mysql_core_1.text)(),
    isActive: (0, mysql_core_1.tinyint)().default(1).notNull(),
    createdAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
}, function (table) { return [
    (0, mysql_core_1.index)("star_reward_rules_activityType_unique").on(table.activityType),
]; });
exports.starRewards = (0, mysql_core_1.mysqlTable)("star_rewards", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    kidId: (0, mysql_core_1.int)().notNull(),
    activityType: (0, mysql_core_1.varchar)({ length: 50 }).notNull(),
    starsEarned: (0, mysql_core_1.int)().notNull(),
    description: (0, mysql_core_1.text)(),
    createdAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});
exports.starShopItems = (0, mysql_core_1.mysqlTable)("star_shop_items", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    name: (0, mysql_core_1.varchar)({ length: 100 }).notNull(),
    description: (0, mysql_core_1.text)(),
    image: (0, mysql_core_1.text)(),
    starsCost: (0, mysql_core_1.int)().default(10).notNull(),
    stock: (0, mysql_core_1.int)().default(-1).notNull(),
    isActive: (0, mysql_core_1.tinyint)().default(1).notNull(),
    createdAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});
exports.taskCompletions = (0, mysql_core_1.mysqlTable)("task_completions", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    taskId: (0, mysql_core_1.int)().notNull(),
    userId: (0, mysql_core_1.int)().notNull(),
    childId: (0, mysql_core_1.int)(),
    completedAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    pointsEarned: (0, mysql_core_1.int)().default(0).notNull(),
});
exports.tasks = (0, mysql_core_1.mysqlTable)("tasks", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    createdBy: (0, mysql_core_1.int)().notNull(),
    title: (0, mysql_core_1.varchar)({ length: 200 }).notNull(),
    description: (0, mysql_core_1.text)(),
    taskType: (0, mysql_core_1.mysqlEnum)(['daily', 'weekly', 'custom']).default('custom').notNull(),
    points: (0, mysql_core_1.int)().default(10).notNull(),
    isActive: (0, mysql_core_1.tinyint)().default(1).notNull(),
    createdAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});
exports.todos = (0, mysql_core_1.mysqlTable)("todos", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    userId: (0, mysql_core_1.int)().notNull(),
    creatorId: (0, mysql_core_1.int)().notNull(),
    title: (0, mysql_core_1.varchar)({ length: 200 }).notNull(),
    description: (0, mysql_core_1.text)(),
    dueDate: (0, mysql_core_1.timestamp)({ mode: 'string' }),
    priority: (0, mysql_core_1.mysqlEnum)(['low', 'medium', 'high']).default('medium').notNull(),
    status: (0, mysql_core_1.mysqlEnum)(['pending', 'in_progress', 'completed', 'cancelled']).default('pending').notNull(),
    completedAt: (0, mysql_core_1.timestamp)({ mode: 'string' }),
    relatedContactId: (0, mysql_core_1.int)(),
    createdAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});
exports.transactions = (0, mysql_core_1.mysqlTable)("transactions", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    ledgerId: (0, mysql_core_1.int)().notNull(),
    userId: (0, mysql_core_1.int)().notNull(),
    type: (0, mysql_core_1.mysqlEnum)(['income', 'expense']).notNull(),
    amount: (0, mysql_core_1.decimal)({ precision: 10, scale: 2 }).notNull(),
    category: (0, mysql_core_1.varchar)({ length: 50 }).notNull(),
    subcategory: (0, mysql_core_1.varchar)({ length: 50 }),
    description: (0, mysql_core_1.text)(),
    // you can use { mode: 'date' }, if you want to have Date as type for this column
    transactionDate: (0, mysql_core_1.date)({ mode: 'string' }).notNull(),
    images: (0, mysql_core_1.json)(),
    createdAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});
exports.userBadges = (0, mysql_core_1.mysqlTable)("user_badges", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    userId: (0, mysql_core_1.int)().notNull(),
    childId: (0, mysql_core_1.int)(),
    badgeId: (0, mysql_core_1.int)().notNull(),
    earnedAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});
exports.userFeatureOrder = (0, mysql_core_1.mysqlTable)("user_feature_order", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    userId: (0, mysql_core_1.int)().notNull(),
    featureId: (0, mysql_core_1.int)().notNull(),
    position: (0, mysql_core_1.int)().notNull(),
    createdAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});
exports.userFeaturePermissions = (0, mysql_core_1.mysqlTable)("user_feature_permissions", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    userId: (0, mysql_core_1.int)().notNull(),
    featureKey: (0, mysql_core_1.varchar)({ length: 50 }).notNull(),
    isEnabled: (0, mysql_core_1.tinyint)().default(1).notNull(),
    createdAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});
exports.userPreferences = (0, mysql_core_1.mysqlTable)("user_preferences", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    userId: (0, mysql_core_1.int)().notNull(),
    homeCardOrder: (0, mysql_core_1.json)(),
    favoriteFeatures: (0, mysql_core_1.json)(),
    colorThemeId: (0, mysql_core_1.varchar)({ length: 50 }),
    customColors: (0, mysql_core_1.json)(),
    createdAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
}, function (table) { return [
    (0, mysql_core_1.index)("user_preferences_userId_unique").on(table.userId),
]; });
exports.users = (0, mysql_core_1.mysqlTable)("users", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    openId: (0, mysql_core_1.varchar)({ length: 64 }),
    username: (0, mysql_core_1.varchar)({ length: 50 }),
    passwordHash: (0, mysql_core_1.varchar)({ length: 255 }),
    name: (0, mysql_core_1.text)(),
    email: (0, mysql_core_1.varchar)({ length: 320 }),
    loginMethod: (0, mysql_core_1.varchar)({ length: 64 }),
    role: (0, mysql_core_1.mysqlEnum)(['super_admin', 'parent', 'baby']).default('parent').notNull(),
    familyId: (0, mysql_core_1.int)(),
    avatar: (0, mysql_core_1.longtext)(),
    points: (0, mysql_core_1.int)().default(0).notNull(),
    balance: (0, mysql_core_1.decimal)({ precision: 20, scale: 8 }).default('0').notNull(),
    sharingEnabled: (0, mysql_core_1.tinyint)().default(0).notNull(),
    isLocked: (0, mysql_core_1.tinyint)().default(0).notNull(),
    failedLoginAttempts: (0, mysql_core_1.int)().default(0).notNull(),
    lastFailedLogin: (0, mysql_core_1.timestamp)({ mode: 'string' }),
    createdAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
    lastSignedIn: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    inviteCode: (0, mysql_core_1.varchar)('invite_code', { length: 6 }),
    inviteLink: (0, mysql_core_1.varchar)('invite_link', { length: 255 }),
    invitedByUserId: (0, mysql_core_1.int)('invited_by_user_id'),
    invitedAt: (0, mysql_core_1.timestamp)('invited_at', { mode: 'string' }),
    inviteCount: (0, mysql_core_1.int)('invite_count').default(0).notNull(),
    inviteEnabled: (0, mysql_core_1.tinyint)('invite_enabled').default(0).notNull(),
    walletEnabled: (0, mysql_core_1.tinyint)('wallet_enabled').default(0).notNull(),
    highestLevelAchieved: (0, mysql_core_1.varchar)('highest_level_achieved', { length: 50 }).default('partner'),
    lastViewedSharingAt: (0, mysql_core_1.timestamp)('last_viewed_sharing_at', { mode: 'string' }),
}, function (table) { return [
    (0, mysql_core_1.index)("users_openId_unique").on(table.openId),
    (0, mysql_core_1.index)("users_username_unique").on(table.username),
]; });
exports.verificationCodes = (0, mysql_core_1.mysqlTable)("verification_codes", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    email: (0, mysql_core_1.varchar)({ length: 320 }).notNull(),
    code: (0, mysql_core_1.varchar)({ length: 4 }).notNull(),
    type: (0, mysql_core_1.mysqlEnum)(['register', 'reset_password']).notNull(),
    expiresAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).notNull(),
    used: (0, mysql_core_1.tinyint)().default(0).notNull(),
    createdAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});
exports.vocabularyMaster = (0, mysql_core_1.mysqlTable)("vocabulary_master", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    word: (0, mysql_core_1.varchar)({ length: 100 }).notNull(),
    language: (0, mysql_core_1.mysqlEnum)(['chinese', 'english']).notNull(),
    wordType: (0, mysql_core_1.mysqlEnum)(['character', 'word']).default('word').notNull(),
    translation: (0, mysql_core_1.varchar)({ length: 200 }),
    pinyin: (0, mysql_core_1.varchar)({ length: 100 }),
    pronunciation: (0, mysql_core_1.varchar)({ length: 100 }),
    category: (0, mysql_core_1.varchar)({ length: 50 }).default('general').notNull(),
    difficulty: (0, mysql_core_1.mysqlEnum)(['easy', 'medium', 'hard']).default('easy').notNull(),
    example: (0, mysql_core_1.text)(),
    imageUrl: (0, mysql_core_1.text)(),
    audioUrl: (0, mysql_core_1.text)(),
    isActive: (0, mysql_core_1.tinyint)().default(1).notNull(),
    createdAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});
exports.wrongQuestions = (0, mysql_core_1.mysqlTable)("wrong_questions", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    kidId: (0, mysql_core_1.int)().notNull(),
    gameType: (0, mysql_core_1.mysqlEnum)(['math', 'antonym', 'character']).notNull(),
    questionData: (0, mysql_core_1.text)().notNull(),
    userAnswer: (0, mysql_core_1.varchar)({ length: 100 }).notNull(),
    correctAnswer: (0, mysql_core_1.varchar)({ length: 100 }).notNull(),
    reviewed: (0, mysql_core_1.tinyint)().default(0).notNull(),
    createdAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});
// 账目审批规则表
exports.ledgerApprovalRules = (0, mysql_core_1.mysqlTable)("ledger_approval_rules", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    ledgerId: (0, mysql_core_1.int)().notNull(),
    // 记账人 ID，如果为 null 表示默认规则（全部&新加入成员）
    recorderId: (0, mysql_core_1.int)(),
    // 审批人类型：all=需全部成员审批，specific=指定成员审批
    approverType: (0, mysql_core_1.mysqlEnum)(['all', 'specific']).default('all').notNull(),
    // 审批人 ID列表（JSON格式），当 approverType='specific' 时使用
    approverIds: (0, mysql_core_1.json)(),
    // 是否启用
    isEnabled: (0, mysql_core_1.tinyint)().default(1).notNull(),
    createdBy: (0, mysql_core_1.int)().notNull(),
    createdAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});
// 账目审批记录表
exports.ledgerApprovalRecords = (0, mysql_core_1.mysqlTable)("ledger_approval_records", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    ledgerId: (0, mysql_core_1.int)().notNull(),
    transactionId: (0, mysql_core_1.int)().notNull(),
    approverId: (0, mysql_core_1.int)().notNull(),
    // 审批状态：pending=待审批，approved=已通过，rejected=已拒绝
    status: (0, mysql_core_1.mysqlEnum)(['pending', 'approved', 'rejected']).default('pending').notNull(),
    comment: (0, mysql_core_1.text)(),
    createdAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: (0, mysql_core_1.timestamp)({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});
// 修改 transactions 表，添加审批状态字段（注：这里只是记录，实际需要通过数据库迁移添加）
// 报销修改历史表
exports.reimbursementHistory = (0, mysql_core_1.mysqlTable)("reimbursement_history", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    recordId: (0, mysql_core_1.int)('record_id').notNull(),
    ledgerId: (0, mysql_core_1.int)('ledger_id').notNull(),
    operatedBy: (0, mysql_core_1.int)('operated_by').notNull(),
    action: (0, mysql_core_1.varchar)({ length: 50 }).notNull(),
    oldStatus: (0, mysql_core_1.mysqlEnum)('old_status', ['none', 'pending', 'completed']),
    newStatus: (0, mysql_core_1.mysqlEnum)('new_status', ['none', 'pending', 'completed']),
    notes: (0, mysql_core_1.text)(),
    voucherUrl: (0, mysql_core_1.text)('voucher_url'),
    createdAt: (0, mysql_core_1.timestamp)('created_at', { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
}, function (table) { return [
    (0, mysql_core_1.index)("idx_record_id").on(table.recordId),
    (0, mysql_core_1.index)("idx_ledger_id").on(table.ledgerId),
    (0, mysql_core_1.index)("idx_operated_by").on(table.operatedBy),
]; });
// 数据加密配置表
exports.encryptionConfig = (0, mysql_core_1.mysqlTable)("encryption_config", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    tableName: (0, mysql_core_1.varchar)('table_name', { length: 100 }).notNull(),
    fieldName: (0, mysql_core_1.varchar)('field_name', { length: 100 }).notNull(),
    fieldLabel: (0, mysql_core_1.varchar)('field_label', { length: 100 }).notNull(),
    fieldGroup: (0, mysql_core_1.varchar)('field_group', { length: 50 }).notNull(),
    isEnabled: (0, mysql_core_1.tinyint)('is_enabled').default(0).notNull(),
    encryptedAt: (0, mysql_core_1.timestamp)('encrypted_at', { mode: 'string' }),
    createdAt: (0, mysql_core_1.timestamp)('created_at', { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: (0, mysql_core_1.timestamp)('updated_at', { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
}, function (table) { return [
    (0, mysql_core_1.index)("idx_table_field").on(table.tableName, table.fieldName),
]; });
// ==================== 股权激励系统表 ====================
exports.equityInvestments = (0, mysql_core_1.mysqlTable)("equity_investments", {
    id: (0, mysql_core_1.int)().autoincrement().notNull().primaryKey(),
    userId: (0, mysql_core_1.int)("user_id").notNull(),
    investorName: (0, mysql_core_1.varchar)("investor_name", { length: 100 }),
    investorIdCard: (0, mysql_core_1.varchar)("investor_id_card", { length: 18 }),
    investmentAmount: (0, mysql_core_1.decimal)("investment_amount", { precision: 15, scale: 2 }).default('0.00').notNull(),
    investmentDate: (0, mysql_core_1.timestamp)("investment_date", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    notes: (0, mysql_core_1.text)(),
    createdAt: (0, mysql_core_1.timestamp)("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: (0, mysql_core_1.timestamp)("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
}, function (table) { return [
    (0, mysql_core_1.index)("idx_user_id").on(table.userId),
    (0, mysql_core_1.index)("idx_investment_date").on(table.investmentDate),
]; });
exports.equityRules = (0, mysql_core_1.mysqlTable)("equity_rules", {
    id: (0, mysql_core_1.int)().autoincrement().notNull().primaryKey(),
    ruleKey: (0, mysql_core_1.varchar)("rule_key", { length: 100 }).notNull().unique(),
    ruleValue: (0, mysql_core_1.decimal)("rule_value", { precision: 10, scale: 4 }).notNull(),
    ruleDescription: (0, mysql_core_1.text)("rule_description"),
    createdAt: (0, mysql_core_1.timestamp)("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: (0, mysql_core_1.timestamp)("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
}, function (table) { return [
    (0, mysql_core_1.index)("idx_rule_key").on(table.ruleKey),
]; });
exports.equityContributions = (0, mysql_core_1.mysqlTable)("equity_contributions", {
    id: (0, mysql_core_1.int)().autoincrement().notNull().primaryKey(),
    userId: (0, mysql_core_1.int)("user_id").notNull(),
    contributionType: (0, mysql_core_1.varchar)("contribution_type", { length: 50 }).notNull(),
    contributionValue: (0, mysql_core_1.decimal)("contribution_value", { precision: 10, scale: 4 }).notNull(),
    relatedUserId: (0, mysql_core_1.int)("related_user_id"),
    description: (0, mysql_core_1.text)(),
    createdAt: (0, mysql_core_1.timestamp)("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
}, function (table) { return [
    (0, mysql_core_1.index)("idx_user_id").on(table.userId),
    (0, mysql_core_1.index)("idx_contribution_type").on(table.contributionType),
    (0, mysql_core_1.index)("idx_created_at").on(table.createdAt),
]; });
// ==================== 用户扩展资料系统 ====================
exports.userProfiles = (0, mysql_core_1.mysqlTable)("user_profiles", {
    id: (0, mysql_core_1.int)().autoincrement().notNull().primaryKey(),
    userId: (0, mysql_core_1.int)("user_id").notNull().unique(),
    // 基本信息
    nickname: (0, mysql_core_1.varchar)({ length: 100 }),
    phone: (0, mysql_core_1.varchar)({ length: 20 }),
    // 实名认证
    realName: (0, mysql_core_1.varchar)("real_name", { length: 100 }),
    idCardNumber: (0, mysql_core_1.varchar)("id_card_number", { length: 18 }),
    idCardFrontUrl: (0, mysql_core_1.text)("id_card_front_url"),
    idCardBackUrl: (0, mysql_core_1.text)("id_card_back_url"),
    verificationStatus: (0, mysql_core_1.mysqlEnum)("verification_status", ['pending', 'verified', 'rejected']).default('pending'),
    verifiedAt: (0, mysql_core_1.timestamp)("verified_at", { mode: 'string' }),
    // 支付账号
    paymentMethod: (0, mysql_core_1.mysqlEnum)("payment_method", ["bank_card", "digital_wallet", "alipay", "wechat"]),
    // 银行卡
    bankName: (0, mysql_core_1.varchar)("bank_name", { length: 100 }),
    bankAccountNumber: (0, mysql_core_1.varchar)("bank_account_number", { length: 50 }),
    bankAccountName: (0, mysql_core_1.varchar)("bank_account_name", { length: 100 }),
    // 数字钱包
    walletNetwork: (0, mysql_core_1.varchar)("wallet_network", { length: 50 }), // TRC20, ERC20等
    digitalWalletAddress: (0, mysql_core_1.varchar)("digital_wallet_address", { length: 255 }),
    walletQrCodeUrl: (0, mysql_core_1.text)("wallet_qr_code_url"), // 钱包收款码
    // 支付宝
    alipayAccount: (0, mysql_core_1.varchar)("alipay_account", { length: 100 }),
    alipayAccountName: (0, mysql_core_1.varchar)("alipay_account_name", { length: 100 }), // 收款人姓名
    alipayQrCodeUrl: (0, mysql_core_1.text)("alipay_qr_code_url"), // 支付宝收款码
    // 微信
    wechatQrCodeUrl: (0, mysql_core_1.text)("wechat_qr_code_url"), // 微信收款码
    wechatAccountName: (0, mysql_core_1.varchar)("wechat_account_name", { length: 100 }), // 收款人姓名
    // 时间戳
    createdAt: (0, mysql_core_1.timestamp)("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: (0, mysql_core_1.timestamp)("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
}, function (table) { return [
    (0, mysql_core_1.index)("idx_user_id").on(table.userId),
    (0, mysql_core_1.index)("idx_verification_status").on(table.verificationStatus),
]; });
exports.shippingAddresses = (0, mysql_core_1.mysqlTable)("shipping_addresses", {
    id: (0, mysql_core_1.int)().autoincrement().notNull().primaryKey(),
    userId: (0, mysql_core_1.int)("user_id").notNull(),
    // 地址信息
    recipientName: (0, mysql_core_1.varchar)("recipient_name", { length: 100 }).notNull(),
    recipientPhone: (0, mysql_core_1.varchar)("recipient_phone", { length: 20 }).notNull(),
    province: (0, mysql_core_1.varchar)({ length: 50 }),
    city: (0, mysql_core_1.varchar)({ length: 50 }),
    district: (0, mysql_core_1.varchar)({ length: 50 }),
    detailedAddress: (0, mysql_core_1.text)("detailed_address").notNull(),
    postalCode: (0, mysql_core_1.varchar)("postal_code", { length: 10 }),
    // 标记
    isDefault: (0, mysql_core_1.tinyint)("is_default").default(0).notNull(),
    label: (0, mysql_core_1.varchar)({ length: 20 }), // 家、公司、学校等
    // 时间戳
    createdAt: (0, mysql_core_1.timestamp)("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: (0, mysql_core_1.timestamp)("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
}, function (table) { return [
    (0, mysql_core_1.index)("idx_user_id").on(table.userId),
    (0, mysql_core_1.index)("idx_is_default").on(table.isDefault),
]; });
// 工作群表（脉动节点合作平台）
// 有限合伙企业表
exports.partnerships = (0, mysql_core_1.mysqlTable)("partnerships", {
    id: (0, mysql_core_1.int)().autoincrement().primaryKey(),
    name: (0, mysql_core_1.varchar)({ length: 255 }).notNull(),
    description: (0, mysql_core_1.text)(),
    createdAt: (0, mysql_core_1.timestamp)("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: (0, mysql_core_1.timestamp)("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});
// 工作群表（关联到企业）
exports.partnershipWorkGroups = (0, mysql_core_1.mysqlTable)("partnership_work_groups", {
    id: (0, mysql_core_1.int)().autoincrement().primaryKey(),
    partnershipId: (0, mysql_core_1.int)("partnership_id").notNull(),
    name: (0, mysql_core_1.varchar)({ length: 100 }).notNull(),
    description: (0, mysql_core_1.text)(),
    createdAt: (0, mysql_core_1.timestamp)("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: (0, mysql_core_1.timestamp)("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});
// 成员-企业关联表
exports.partnershipMembers = (0, mysql_core_1.mysqlTable)("partnership_members", {
    id: (0, mysql_core_1.int)().autoincrement().primaryKey(),
    partnershipId: (0, mysql_core_1.int)("partnership_id").notNull(),
    userId: (0, mysql_core_1.int)("user_id").notNull(),
    role: (0, mysql_core_1.mysqlEnum)(['member', 'admin']).default('member').notNull(),
    joinedAt: (0, mysql_core_1.timestamp)("joined_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});
// 成员-工作群关联表
exports.partnershipWorkGroupMembers = (0, mysql_core_1.mysqlTable)("partnership_work_group_members", {
    id: (0, mysql_core_1.int)().autoincrement().primaryKey(),
    workGroupId: (0, mysql_core_1.int)("work_group_id").notNull(),
    userId: (0, mysql_core_1.int)("user_id").notNull(),
    joinedAt: (0, mysql_core_1.timestamp)("joined_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});
// 合伙人平台看板 - 最新动态表
exports.partnershipDashboardActivities = (0, mysql_core_1.mysqlTable)("partnership_dashboard_activities", {
    id: (0, mysql_core_1.int)().autoincrement().primaryKey(),
    partnershipId: (0, mysql_core_1.int)("partnership_id").notNull().default(1),
    userName: (0, mysql_core_1.varchar)("user_name", { length: 100 }).notNull(),
    action: (0, mysql_core_1.varchar)({ length: 100 }).notNull(),
    timeText: (0, mysql_core_1.varchar)("time_text", { length: 100 }).notNull(),
    sortOrder: (0, mysql_core_1.int)("sort_order").notNull().default(0),
    createdAt: (0, mysql_core_1.timestamp)("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: (0, mysql_core_1.timestamp)("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});
// 合伙人平台看板 - 预警雷达表
exports.partnershipDashboardAlerts = (0, mysql_core_1.mysqlTable)("partnership_dashboard_alerts", {
    id: (0, mysql_core_1.int)().autoincrement().primaryKey(),
    partnershipId: (0, mysql_core_1.int)("partnership_id").notNull().default(1),
    type: (0, mysql_core_1.varchar)({ length: 20 }).notNull().default('warning'),
    message: (0, mysql_core_1.text)().notNull(),
    actionText: (0, mysql_core_1.varchar)("action_text", { length: 255 }).notNull().default(''),
    sortOrder: (0, mysql_core_1.int)("sort_order").notNull().default(0),
    createdAt: (0, mysql_core_1.timestamp)("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: (0, mysql_core_1.timestamp)("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});
exports.workGroups = (0, mysql_core_1.mysqlTable)("work_groups", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    name: (0, mysql_core_1.varchar)({ length: 100 }).notNull(),
    description: (0, mysql_core_1.text)(),
    icon: (0, mysql_core_1.text)(),
    createdBy: (0, mysql_core_1.int)("created_by").notNull(),
    ownerId: (0, mysql_core_1.int)("owner_id").notNull(),
    isArchived: (0, mysql_core_1.tinyint)("is_archived").default(0).notNull(),
    createdAt: (0, mysql_core_1.timestamp)("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: (0, mysql_core_1.timestamp)("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
}, function (table) { return [
    (0, mysql_core_1.index)("idx_owner_id").on(table.ownerId),
    (0, mysql_core_1.index)("idx_created_by").on(table.createdBy),
]; });
exports.ledgerBackupSettings = (0, mysql_core_1.mysqlTable)("ledger_backup_settings", {
    id: (0, mysql_core_1.int)().autoincrement().notNull(),
    ledgerId: (0, mysql_core_1.int)("ledger_id").notNull(),
    userId: (0, mysql_core_1.int)("user_id").notNull(),
    frequency: (0, mysql_core_1.mysqlEnum)(['weekly', 'monthly', 'quarterly']).notNull(),
    enabled: (0, mysql_core_1.tinyint)().default(1).notNull(),
    backupCount: (0, mysql_core_1.int)("backup_count").default(0).notNull(),
    lastBackupAt: (0, mysql_core_1.timestamp)("last_backup_at", { mode: 'string' }),
    nextBackupAt: (0, mysql_core_1.timestamp)("next_backup_at", { mode: 'string' }),
    createdAt: (0, mysql_core_1.timestamp)("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: (0, mysql_core_1.timestamp)("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
}, function (table) { return [
    (0, mysql_core_1.index)("ledger_backup_settings_ledger_id_user_id_unique").on(table.ledgerId, table.userId),
]; });
// ==================== 卡券系统表 ====================
// 卡券表
exports.coupons = (0, mysql_core_1.mysqlTable)("coupons", {
    id: (0, mysql_core_1.varchar)({ length: 36 }).primaryKey().notNull(),
    creatorId: (0, mysql_core_1.varchar)("creator_id", { length: 36 }).notNull(),
    title: (0, mysql_core_1.varchar)({ length: 200 }).notNull(),
    description: (0, mysql_core_1.text)(),
    templateType: (0, mysql_core_1.varchar)("template_type", { length: 50 }).default('default').notNull(),
    templateData: (0, mysql_core_1.json)("template_data"),
    validFrom: (0, mysql_core_1.timestamp)("valid_from", { mode: 'string' }).notNull(),
    validUntil: (0, mysql_core_1.timestamp)("valid_until", { mode: 'string' }).notNull(),
    createdAt: (0, mysql_core_1.timestamp)("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: (0, mysql_core_1.timestamp)("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
}, function (table) { return [
    (0, mysql_core_1.index)("coupons_creator_id_idx").on(table.creatorId),
]; });
// 卡券接收记录表
exports.couponRecipients = (0, mysql_core_1.mysqlTable)("coupon_recipients", {
    id: (0, mysql_core_1.varchar)({ length: 36 }).primaryKey().notNull(),
    couponId: (0, mysql_core_1.varchar)("coupon_id", { length: 36 }).notNull(),
    recipientId: (0, mysql_core_1.varchar)("recipient_id", { length: 36 }).notNull(),
    status: (0, mysql_core_1.mysqlEnum)(['unused', 'used']).default('unused').notNull(),
    receivedAt: (0, mysql_core_1.timestamp)("received_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
}, function (table) { return [
    (0, mysql_core_1.index)("coupon_recipients_coupon_id_idx").on(table.couponId),
    (0, mysql_core_1.index)("coupon_recipients_recipient_id_idx").on(table.recipientId),
    (0, mysql_core_1.index)("coupon_recipients_status_idx").on(table.status),
]; });
// 卡券使用/核销记录表
exports.couponUsage = (0, mysql_core_1.mysqlTable)("coupon_usage", {
    id: (0, mysql_core_1.varchar)({ length: 36 }).primaryKey().notNull(),
    recipientRecordId: (0, mysql_core_1.varchar)("recipient_record_id", { length: 36 }).notNull(),
    couponId: (0, mysql_core_1.varchar)("coupon_id", { length: 36 }).notNull(),
    userId: (0, mysql_core_1.varchar)("user_id", { length: 36 }).notNull(),
    usedAt: (0, mysql_core_1.timestamp)("used_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    notes: (0, mysql_core_1.text)(),
}, function (table) { return [
    (0, mysql_core_1.index)("coupon_usage_coupon_id_idx").on(table.couponId),
    (0, mysql_core_1.index)("coupon_usage_user_id_idx").on(table.userId),
]; });
// ==================== 银行卡和数字钱包系统表 ====================
// 银行卡表
exports.bankCards = (0, mysql_core_1.mysqlTable)("bank_cards", {
    id: (0, mysql_core_1.varchar)({ length: 36 }).primaryKey().notNull(),
    userId: (0, mysql_core_1.varchar)("user_id", { length: 36 }).notNull(),
    cardNumber: (0, mysql_core_1.text)("card_number").notNull(), // 加密存储
    cardHolder: (0, mysql_core_1.text)("card_holder").notNull(), // 加密存储
    bankName: (0, mysql_core_1.varchar)("bank_name", { length: 100 }).notNull(),
    cardType: (0, mysql_core_1.mysqlEnum)("card_type", ['debit', 'credit']).default('debit').notNull(),
    isDefault: (0, mysql_core_1.tinyint)("is_default").default(0).notNull(),
    notes: (0, mysql_core_1.text)(),
    createdAt: (0, mysql_core_1.timestamp)("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: (0, mysql_core_1.timestamp)("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
}, function (table) { return [
    (0, mysql_core_1.index)("bank_cards_user_id_idx").on(table.userId),
    (0, mysql_core_1.index)("bank_cards_is_default_idx").on(table.isDefault),
]; });
// 数字钱包表
exports.digitalWallets = (0, mysql_core_1.mysqlTable)("digital_wallets", {
    id: (0, mysql_core_1.varchar)({ length: 36 }).primaryKey().notNull(),
    userId: (0, mysql_core_1.varchar)("user_id", { length: 36 }).notNull(),
    walletType: (0, mysql_core_1.mysqlEnum)("wallet_type", ['blockchain', 'alipay', 'wechat', 'other']).notNull(),
    // 区块链钱包字段
    network: (0, mysql_core_1.varchar)({ length: 50 }), // TRC20, ERC20, BEP20等
    walletAddress: (0, mysql_core_1.text)("wallet_address"), // 钱包地址（加密存储）
    currency: (0, mysql_core_1.varchar)({ length: 20 }), // USDT, USDC, ETH, BTC等
    // 支付宝/微信字段
    account: (0, mysql_core_1.text)(), // 账号/手机号（加密存储）
    accountName: (0, mysql_core_1.text)("account_name"), // 账户名（加密存储）
    isDefault: (0, mysql_core_1.tinyint)("is_default").default(0).notNull(),
    notes: (0, mysql_core_1.text)(),
    createdAt: (0, mysql_core_1.timestamp)("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: (0, mysql_core_1.timestamp)("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
}, function (table) { return [
    (0, mysql_core_1.index)("digital_wallets_user_id_idx").on(table.userId),
    (0, mysql_core_1.index)("digital_wallets_is_default_idx").on(table.isDefault),
]; });
// ==================== 充值系统表 ====================
// 充值订单表
exports.rechargeOrders = (0, mysql_core_1.mysqlTable)("recharge_orders", {
    id: (0, mysql_core_1.int)().autoincrement().notNull().primaryKey(),
    userId: (0, mysql_core_1.int)("user_id").notNull(),
    orderNo: (0, mysql_core_1.varchar)("order_no", { length: 50 }).notNull(),
    amount: (0, mysql_core_1.decimal)("amount", { precision: 20, scale: 8 }).notNull(), // 带小数的唯一金额
    currency: (0, mysql_core_1.varchar)({ length: 10 }).default('USDT').notNull(),
    network: (0, mysql_core_1.varchar)({ length: 20 }).default('TRC20').notNull(),
    walletAddress: (0, mysql_core_1.varchar)("wallet_address", { length: 255 }), // 收款钱包地址
    status: (0, mysql_core_1.mysqlEnum)(['pending', 'submitted', 'completed', 'expired', 'cancelled']).default('pending').notNull(),
    txnHash: (0, mysql_core_1.varchar)("txn_hash", { length: 100 }), // 交易哈希
    createdAt: (0, mysql_core_1.timestamp)("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    completedAt: (0, mysql_core_1.timestamp)("completed_at", { mode: 'string' }),
    expiresAt: (0, mysql_core_1.timestamp)("expires_at", { mode: 'string' }).notNull(),
}, function (table) { return [
    (0, mysql_core_1.index)("recharge_orders_user_id_idx").on(table.userId),
    (0, mysql_core_1.index)("recharge_orders_order_no_idx").on(table.orderNo),
    (0, mysql_core_1.index)("recharge_orders_amount_status_idx").on(table.amount, table.status),
    (0, mysql_core_1.index)("recharge_orders_status_idx").on(table.status),
]; });
// 余额变动记录表
exports.balanceHistory = (0, mysql_core_1.mysqlTable)("balance_history", {
    id: (0, mysql_core_1.int)().autoincrement().notNull().primaryKey(),
    userId: (0, mysql_core_1.int)("user_id").notNull(),
    amount: (0, mysql_core_1.decimal)({ precision: 20, scale: 8 }).notNull(), // 变动金额（正数为增加，负数为减少）
    type: (0, mysql_core_1.mysqlEnum)(['recharge', 'consume', 'refund', 'reward', 'withdraw']).notNull(),
    relatedId: (0, mysql_core_1.int)("related_id"), // 关联订单ID
    balance: (0, mysql_core_1.decimal)({ precision: 20, scale: 8 }).notNull(), // 变动后的余额
    description: (0, mysql_core_1.text)(),
    createdAt: (0, mysql_core_1.timestamp)("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
}, function (table) { return [
    (0, mysql_core_1.index)("balance_history_user_id_idx").on(table.userId),
    (0, mysql_core_1.index)("balance_history_type_idx").on(table.type),
]; });
// 收款地址管理表（管理员后台配置，替代环境变量）
exports.walletAddresses = (0, mysql_core_1.mysqlTable)("wallet_addresses", {
    id: (0, mysql_core_1.int)().autoincrement().notNull().primaryKey(),
    address: (0, mysql_core_1.varchar)({ length: 100 }).notNull(), // 钱包地址
    network: (0, mysql_core_1.varchar)({ length: 20 }).notNull(), // 网络类型：TRC20, ERC20, BEP20
    label: (0, mysql_core_1.varchar)({ length: 50 }), // 备注名称，如"主钱包"、"备用钱包"
    enabled: (0, mysql_core_1.tinyint)().default(1).notNull(), // 是否启用：1启用 0禁用
    createdAt: (0, mysql_core_1.timestamp)("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: (0, mysql_core_1.timestamp)("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
}, function (table) { return [
    (0, mysql_core_1.index)("wallet_addresses_network_idx").on(table.network),
    (0, mysql_core_1.index)("wallet_addresses_enabled_idx").on(table.enabled),
]; });
// 扫描器心跳记录表
exports.scannerHeartbeat = (0, mysql_core_1.mysqlTable)("scanner_heartbeat", {
    id: (0, mysql_core_1.int)().autoincrement().notNull().primaryKey(),
    scannerType: (0, mysql_core_1.varchar)("scanner_type", { length: 50 }).notNull(), // 扫描器类型
    lastScanAt: (0, mysql_core_1.timestamp)("last_scan_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(), // 最后扫描时间
    scanCount: (0, mysql_core_1.int)("scan_count").default(0), // 扫描次数
    successCount: (0, mysql_core_1.int)("success_count").default(0), // 成功次数
    errorCount: (0, mysql_core_1.int)("error_count").default(0), // 错误次数
    lastError: (0, mysql_core_1.text)("last_error"), // 最后错误信息
    scannedAddresses: (0, mysql_core_1.int)("scanned_addresses").default(0), // 扫描的地址数
    foundTransactions: (0, mysql_core_1.int)("found_transactions").default(0), // 发现的交易数
    matchedOrders: (0, mysql_core_1.int)("matched_orders").default(0), // 匹配的订单数
    unmatchedTransactions: (0, mysql_core_1.int)("unmatched_transactions").default(0), // 未匹配的交易数
    createdAt: (0, mysql_core_1.timestamp)("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
    updatedAt: (0, mysql_core_1.timestamp)("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
}, function (table) { return [
    (0, mysql_core_1.index)("scanner_heartbeat_type_unique").on(table.scannerType),
]; });
exports.userInsights = (0, mysql_core_1.mysqlTable)("user_insights", {
    id: (0, mysql_core_1.int)("id").autoincrement().notNull().primaryKey(),
    userId: (0, mysql_core_1.int)("userId").notNull(),
    tags: (0, mysql_core_1.json)("tags").$type().default([]),
    summary: (0, mysql_core_1.text)("summary"),
    suggestion: (0, mysql_core_1.text)("suggestion"),
    ownerInsight: (0, mysql_core_1.text)("ownerInsight"),
    periodStart: (0, mysql_core_1.date)("periodStart", { mode: 'string' }).notNull(),
    periodEnd: (0, mysql_core_1.date)("periodEnd", { mode: 'string' }).notNull(),
    createdAt: (0, mysql_core_1.timestamp)("createdAt", { mode: 'string' }).default((0, drizzle_orm_1.sql)(templateObject_1 || (templateObject_1 = __makeTemplateObject(["CURRENT_TIMESTAMP"], ["CURRENT_TIMESTAMP"])))).notNull(),
});
var templateObject_1;
