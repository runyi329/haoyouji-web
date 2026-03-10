import { mysqlTable, mysqlSchema, AnyMySqlColumn, int, varchar, text, mysqlEnum, timestamp, index, json, longtext, date, decimal, tinyint } from "drizzle-orm/mysql-core"
import { sql } from "drizzle-orm"

export const addition20Challenges = mysqlTable("addition20_challenges", {
	id: int().autoincrement().notNull(),
	kidId: int().notNull(),
	parentId: int().notNull(),
	targetCorrectCount: int().notNull(),
	penaltyPerWrong: int().default(0).notNull(),
	rewardTitle: varchar({ length: 100 }).notNull(),
	rewardImageUrl: text(),
	rewardFileKey: varchar({ length: 255 }),
	currentCorrectCount: int().default(0).notNull(),
	totalAttempted: int().default(0).notNull(),
	totalCorrect: int().default(0).notNull(),
	totalWrong: int().default(0).notNull(),
	status: mysqlEnum(['active','paused','completed','cancelled']).default('active').notNull(),
	startedAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	lastPlayedAt: timestamp({ mode: 'string' }),
	completedAt: timestamp({ mode: 'string' }),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const addition20Config = mysqlTable("addition20_config", {
	id: int().autoincrement().notNull(),
	kidId: int().notNull(),
	difficulty: mysqlEnum(['easy','medium','hard']).default('easy').notNull(),
	questionCount: int().default(10).notNull(),
	answerMode: mysqlEnum(['choice','input']).default('choice').notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("addition20_config_kidId_unique").on(table.kidId),
]);

export const addition20Records = mysqlTable("addition20_records", {
	id: int().autoincrement().notNull(),
	kidId: int().notNull(),
	difficulty: mysqlEnum(['easy','medium','hard']).notNull(),
	questionCount: int().notNull(),
	correctCount: int().notNull(),
	duration: int().notNull(),
	answerMode: mysqlEnum(['choice','input']).notNull(),
	starsEarned: int().default(0).notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});

export const albums = mysqlTable("albums", {
	id: int().autoincrement().notNull(),
	userId: int().notNull(),
	childId: int(),
	name: varchar({ length: 100 }).notNull(),
	description: text(),
	coverImage: text(),
	isPublic: tinyint().default(0).notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const antonyms = mysqlTable("antonyms", {
	id: int().autoincrement().notNull(),
	word: varchar({ length: 50 }).notNull(),
	antonym: varchar({ length: 50 }).notNull(),
	category: varchar({ length: 50 }).default('general').notNull(),
	difficulty: mysqlEnum(['easy','medium','hard']).default('easy').notNull(),
	isActive: tinyint().default(1).notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const badges = mysqlTable("badges", {
	id: int().autoincrement().notNull(),
	name: varchar({ length: 100 }).notNull(),
	description: text(),
	icon: varchar({ length: 50 }),
	color: varchar({ length: 20 }),
	requirement: text(),
	pointsRequired: int().default(0).notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});

export const brushingSessions = mysqlTable("brushing_sessions", {
	id: int().autoincrement().notNull(),
	kidId: int().notNull(),
	duration: int().notNull(),
	completed: tinyint().default(1).notNull(),
	starsEarned: int().default(1).notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});

export const characterGameSettings = mysqlTable("character_game_settings", {
	id: int().autoincrement().notNull(),
	kidId: int().notNull(),
	autoPlayCount: int().default(1).notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("character_game_settings_kidId_unique").on(table.kidId),
]);

export const characterLearningRecords = mysqlTable("character_learning_records", {
	id: int().autoincrement().notNull(),
	kidId: int().notNull(),
	characterId: int().notNull(),
	isCorrect: tinyint().notNull(),
	selectedAnswer: varchar({ length: 10 }),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});

export const characters = mysqlTable("characters", {
	id: int().autoincrement().notNull(),
	character: varchar({ length: 10 }).notNull(),
	pinyin: varchar({ length: 50 }).notNull(),
	imageUrl: text().notNull(),
	fileKey: varchar({ length: 255 }).notNull(),
	category: varchar({ length: 50 }).notNull(),
	difficulty: int().default(1).notNull(),
	strokeCount: int().default(0).notNull(),
	commonWords: json(),
	isActive: tinyint().default(1).notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const childProfiles = mysqlTable("child_profiles", {
	id: int().autoincrement().notNull(),
	parentId: int().notNull(),
	name: varchar({ length: 100 }).notNull(),
	avatar: longtext(),
	birthday: timestamp({ mode: 'string' }),
	points: int().default(0).notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const companyReports = mysqlTable("company_reports", {
	id: int().autoincrement().notNull(),
	companyName: varchar("company_name", { length: 255 }).notNull(),
	reportFileUrl: text("report_file_url"),
	rawText: longtext("raw_text"),
	formattedContent: text("formatted_content").notNull(),
	uploadedBy: int("uploaded_by"),
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("company_reports_company_name_unique").on(table.companyName),
]);

export const contactCustomFields = mysqlTable("contact_custom_fields", {
	id: int().autoincrement().notNull(),
	contactId: int().notNull(),
	fieldName: varchar({ length: 100 }).notNull(),
	fieldValue: text(),
	sortOrder: int().default(0).notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const contactFieldCategories = mysqlTable("contact_field_categories", {
	id: int().autoincrement().notNull(),
	parentUserId: int().notNull(),
	name: varchar({ length: 100 }).notNull(),
	fieldType: varchar({ length: 20 }).default('text').notNull(),
	options: json(),
	sortOrder: int().default(0).notNull(),
	isRequired: tinyint().default(0).notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	parentCategoryId: int().default(0),
	icon: varchar({ length: 50 }),
});

export const contactFieldValues = mysqlTable("contact_field_values", {
	id: int().autoincrement().notNull(),
	contactId: int().notNull(),
	categoryId: int().notNull(),
	categoryName: varchar({ length: 50 }).default(''),
	value: text(),
	sortOrder: int().default(0),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const contactInteractions = mysqlTable("contact_interactions", {
	id: int().autoincrement().notNull(),
	contactId: int().notNull(),
	interactionDate: timestamp({ mode: 'string' }).notNull(),
	note: text(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});

export const contactSharingConnections = mysqlTable("contact_sharing_connections", {
	id: int().autoincrement().notNull(),
	sharerId: int().notNull(),
	receiverId: int().notNull(),
	status: mysqlEnum(['pending','active','rejected']).default('pending').notNull(),
	note: text(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const sharingNotifications = mysqlTable("sharing_notifications", {
	id: int().autoincrement().notNull(),
	receiverId: int('receiver_id').notNull(),
	actorId: int('actor_id').notNull(),
	actorName: varchar('actor_name', { length: 100 }),
	type: mysqlEnum(['added', 'removed']).notNull(),
	isRead: tinyint('is_read').default(0).notNull(),
	createdAt: timestamp('created_at', { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});

export const contactSharingPermissions = mysqlTable("contact_sharing_permissions", {
	id: int().autoincrement().notNull(),
	connectionId: int().notNull(),
	fieldName: varchar({ length: 100 }).notNull(),
	isShared: tinyint().default(1).notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const contactTagRelations = mysqlTable("contact_tag_relations", {
	id: int().autoincrement().notNull(),
	contactId: int().notNull(),
	tagId: int().notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});

export const contactTags = mysqlTable("contact_tags", {
	id: int().autoincrement().notNull(),
	parentUserId: int().notNull(),
	name: varchar({ length: 50 }).notNull(),
	color: varchar({ length: 20 }).default('#3b82f6').notNull(),
	sortOrder: int().default(0).notNull(),
	isPreset: tinyint().default(0).notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});

export const contacts = mysqlTable("contacts", {
	id: int().autoincrement().notNull(),
	parentUserId: int().notNull(),
	name: varchar({ length: 100 }).notNull(),
	title: varchar({ length: 50 }),
	gender: varchar({ length: 10 }),
	birthDate: varchar({ length: 20 }),
	occupation: varchar({ length: 100 }),
	address: text(),
	region: varchar({ length: 50 }),
	wechat: varchar({ length: 100 }),
	phone: varchar({ length: 20 }),
	tags: json(),
	referrerId: int(),
	linkedUserId: int(),
	avatar: longtext(),
	isBlacklisted: tinyint().default(0).notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const exerciseRecords = mysqlTable("exercise_records", {
	id: int().autoincrement().notNull(),
	userId: int().notNull(),
	exerciseTypeId: int().notNull(),
	count: int().notNull(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	recordDate: date({ mode: 'string' }).notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const exerciseTypes = mysqlTable("exercise_types", {
	id: int().autoincrement().notNull(),
	userId: int().notNull(),
	name: varchar({ length: 50 }).notNull(),
	icon: varchar({ length: 50 }).default('💪'),
	isActive: tinyint().default(1).notNull(),
	sortOrder: int().default(0).notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const families = mysqlTable("families", {
	id: int().autoincrement().notNull(),
	name: varchar({ length: 100 }).notNull(),
	description: text(),
	avatar: longtext(),
	createdBy: int().notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const familyFeatures = mysqlTable("familyFeatures", {
	id: int().autoincrement().notNull(),
	familyId: int().notNull(),
	featureName: varchar({ length: 50 }).notNull(),
	subFeatureName: varchar({ length: 100 }).notNull(),
	parentFeature: varchar({ length: 100 }),
	level: int().default(1).notNull(),
	path: varchar({ length: 500 }),
	displayOrder: int().default(0).notNull(),
	enabled: tinyint().default(0).notNull(),
	settings: json(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const familyCharacters = mysqlTable("family_characters", {
	id: int().autoincrement().notNull(),
	familyId: int().notNull(),
	character: varchar({ length: 10 }).notNull(),
	pinyin: varchar({ length: 50 }).notNull(),
	imageUrl: text(),
	fileKey: varchar({ length: 255 }),
	category: varchar({ length: 50 }).default('自定义').notNull(),
	difficulty: int().default(1).notNull(),
	commonWords: json(),
	notes: text(),
	isActive: tinyint().default(1).notNull(),
	createdBy: int().notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const familyViConfig = mysqlTable("family_vi_config", {
	id: int().autoincrement().notNull(),
	parentUserId: int().notNull(),
	viThemeId: varchar({ length: 50 }),
	customConfig: json(),
	isActive: tinyint().default(1).notNull(),
	createdBy: int().notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("family_vi_config_parentUserId_unique").on(table.parentUserId),
]);

export const familyVocabulary = mysqlTable("family_vocabulary", {
	id: int().autoincrement().notNull(),
	parentUserId: int().notNull(),
	vocabularyId: int().notNull(),
	kidId: int(),
	addedBy: int().notNull(),
	customNote: text(),
	masteryLevel: mysqlEnum(['not_started','learning','mastered']).default('not_started').notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});

export const featureDefinitions = mysqlTable("feature_definitions", {
	id: int().autoincrement().notNull(),
	featureId: int().notNull(),
	title: varchar({ length: 100 }).notNull(),
	description: text(),
	isActive: tinyint().default(1).notNull(),
	defaultPosition: int().notNull(),
	createdBy: int().notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("feature_definitions_featureId_unique").on(table.featureId),
]);

export const flashcardRecords = mysqlTable("flashcard_records", {
	id: int().autoincrement().notNull(),
	kidId: int().notNull(),
	characterId: int().notNull(),
	knownCount: int().default(0).notNull(),
	forgottenCount: int().default(0).notNull(),
	lastInteraction: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const gameOrderPreferences = mysqlTable("game_order_preferences", {
	id: int().autoincrement().notNull(),
	kidId: int().notNull(),
	gameOrders: text().notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("game_order_preferences_kidId_unique").on(table.kidId),
]);

export const gameRecords = mysqlTable("game_records", {
	id: int().autoincrement().notNull(),
	userId: int().notNull(),
	childId: int(),
	gameType: mysqlEnum(['memory','puzzle','math']).notNull(),
	score: int().default(0).notNull(),
	level: int().default(1).notNull(),
	duration: int().default(0).notNull(),
	completedAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});

export const gameRewardConfig = mysqlTable("game_reward_config", {
	id: int().autoincrement().notNull(),
	familyId: int(),
	gameType: varchar({ length: 50 }).notNull(),
	activityType: varchar({ length: 50 }).notNull(),
	starsReward: int().default(1).notNull(),
	description: text(),
	isActive: tinyint().default(1).notNull(),
	createdBy: int().notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const homeBanner = mysqlTable("homeBanner", {
	id: int().autoincrement().notNull(),
	title: varchar({ length: 200 }),
	description: text(),
	imageUrl: text(),
	isActive: tinyint().default(1).notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const invitationUsages = mysqlTable("invitation_usages", {
	id: int().autoincrement().notNull(),
	invitationId: int().notNull(),
	userId: int().notNull(),
	familyId: int().notNull(),
	usedAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});

export const invitations = mysqlTable("invitations", {
	id: int().autoincrement().notNull(),
	code: varchar({ length: 32 }).notNull(),
	familyName: varchar({ length: 100 }),
	maxUses: int().default(1).notNull(),
	usedCount: int().default(0).notNull(),
	expiresAt: timestamp({ mode: 'string' }),
	isActive: tinyint().default(1).notNull(),
	createdBy: int().notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("invitations_code_unique").on(table.code),
]);

export const knowledgeCategories = mysqlTable("knowledge_categories", {
	id: int().autoincrement().notNull(),
	name: varchar({ length: 100 }).notNull(),
	icon: varchar({ length: 50 }),
	color: varchar({ length: 20 }),
	description: text(),
	sortOrder: int().default(0).notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const knowledgeItems = mysqlTable("knowledge_items", {
	id: int().autoincrement().notNull(),
	categoryId: int().notNull(),
	title: varchar({ length: 200 }).notNull(),
	content: text().notNull(),
	coverImage: text(),
	images: json(),
	viewCount: int().default(0).notNull(),
	isPublished: tinyint().default(1).notNull(),
	createdBy: int().notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const ledgerCategories = mysqlTable("ledger_categories", {
	id: int().autoincrement().notNull(),
	ledgerId: int().notNull(),
	name: varchar({ length: 50 }).notNull(),
	type: mysqlEnum(['income','expense','branch']).notNull(),
	parentId: int(),
	icon: text(),
	color: varchar({ length: 20 }),
	sortOrder: int().default(0).notNull(),
	isDefault: tinyint().default(0).notNull(),
	createdBy: int().notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const ledgerMembers = mysqlTable("ledger_members", {
	id: int().autoincrement().notNull(),
	ledgerId: int().notNull(),
	userId: int().notNull(),
	role: mysqlEnum(['owner','admin','member']).default('member').notNull(),
	nickname: varchar({ length: 50 }),
	memberType: mysqlEnum("member_type", ['real','ai']).default('real').notNull(),
	avatarType: varchar("avatar_type", { length: 50 }),
	permissionView: mysqlEnum("permission_view", ['all','own','none']).default('all').notNull(),
	permissionAdd: mysqlEnum("permission_add", ['all','own','none']).default('all').notNull(),
	permissionEdit: mysqlEnum("permission_edit", ['all','own','none']).default('own').notNull(),
	permissionDelete: mysqlEnum("permission_delete", ['all','own','none']).default('own').notNull(),
	permissionBackup: mysqlEnum("permission_backup", ['allow','none']).default('allow').notNull(),
	canEdit: tinyint().default(1).notNull(),
	canDelete: tinyint().default(0).notNull(),
	canInvite: tinyint().default(0).notNull(),
	invitedBy: int(),
	initialBalances: text("initial_balances"),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const ledgerRecords = mysqlTable("ledger_records", {
	id: int().autoincrement().notNull(),
	ledgerId: int().notNull(),
	type: mysqlEnum(['income','expense']).notNull(),
	amount: decimal({ precision: 10, scale: 2 }).notNull(),
	categoryId: int(),
	description: text(),
	imageUrl: text(),
	recordDate: date({ mode: 'string' }).notNull(),
	createdBy: int().notNull(),
	reimbursementStatus: mysqlEnum('reimbursement_status', ['none','pending','completed']).default('none').notNull(),
	reimbursementAmount: decimal('reimbursement_amount', { precision: 10, scale: 2 }),
	reimbursedAt: timestamp('reimbursed_at', { mode: 'string' }),
	reimbursedBy: int('reimbursed_by'),
	reimbursementNotes: text('reimbursement_notes'),
	reimbursementVoucherUrl: text('reimbursement_voucher_url'),
	pendingType: mysqlEnum('pending_type', ['receivable','payable']),
	pendingIncludeStats: tinyint('pending_include_stats').default(1),
	// AB型意见本专用字段（顾客扫码提意见时使用，普通账本为null）
	rating: tinyint('rating'),                                    // 评分 1-5
	guestName: varchar('guest_name', { length: 50 }),             // 访客昵称
	guestIp: varchar('guest_ip', { length: 45 }),                 // 访客IP（防刷）
	isRead: tinyint('is_read').default(0),                        // 是否已读
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	deletedAt: timestamp('deleted_at', { mode: 'string' }),
	deletedBy: int('deleted_by'),
});

export const ledgerRecordHistory = mysqlTable("ledger_record_history", {
	id: int().autoincrement().notNull(),
	recordId: int().notNull(),
	ledgerId: int().notNull(),
	userId: int().notNull(),
	field: varchar({ length: 50 }).notNull(),
	oldValue: text(),
	newValue: text(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});

export const ledgers = mysqlTable("ledgers", {
	id: int().autoincrement().notNull(),
	name: varchar({ length: 100 }).notNull(),
	description: text(),
	type: varchar({ length: 50 }).default('personal').notNull(),
	currency: varchar({ length: 10 }).default('CNY').notNull(),
	icon: text(),
	createdBy: int().default(0).notNull(),
	ownerId: int().notNull(),
	// groupId: int("group_id"), // 所属工作群ID，为null表示普通账本 - 临时注释等待数据库迁移
	isVip: tinyint().default(0).notNull(),
	isArchived: tinyint().default(0).notNull(),
	enableReimbursement: tinyint("enable_reimbursement").default(1).notNull(),
	enablePending: tinyint("enable_pending").default(0).notNull(),
	pendingDefaultIncludeStats: tinyint("pending_default_include_stats").default(1).notNull(),
	requireImage: tinyint("require_image").default(0).notNull(),
	defaultPermissionView: mysqlEnum("default_permission_view", ['all','own','none']).default('own').notNull(),
	defaultPermissionAdd: mysqlEnum("default_permission_add", ['all','own','none']).default('own').notNull(),
	defaultPermissionEdit: mysqlEnum("default_permission_edit", ['all','own','none']).default('own').notNull(),
	defaultPermissionDelete: mysqlEnum("default_permission_delete", ['all','own','none']).default('own').notNull(),
	defaultPermissionBackup: mysqlEnum("default_permission_backup", ['allow','none']).default('allow').notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	// index("idx_group_id").on(table.groupId), // 临时注释等待数据库迁移
]);

export const loginAttempts = mysqlTable("login_attempts", {
	id: int().autoincrement().notNull(),
	ipAddress: varchar({ length: 45 }).notNull(),
	username: varchar({ length: 50 }),
	success: tinyint().default(0).notNull(),
	attemptedAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});

export const parentPasswords = mysqlTable("parent_passwords", {
	id: int().autoincrement().notNull(),
	userId: int().notNull(),
	passwordHash: varchar({ length: 255 }).notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("parent_passwords_userId_unique").on(table.userId),
]);

export const personalContactTags = mysqlTable("personal_contact_tags", {
	id: int().autoincrement().notNull(),
	contactId: int().notNull(),
	parentUserId: int().notNull(),
	name: varchar({ length: 50 }).notNull(),
	color: varchar({ length: 20 }).default('#A80000').notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});

export const photoComments = mysqlTable("photo_comments", {
	id: int().autoincrement().notNull(),
	photoId: int().notNull(),
	userId: int().notNull(),
	content: text().notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});

export const photos = mysqlTable("photos", {
	id: int().autoincrement().notNull(),
	albumId: int().notNull(),
	userId: int().notNull(),
	url: text().notNull(),
	fileKey: varchar({ length: 255 }).notNull(),
	thumbnail: text(),
	description: text(),
	takenAt: timestamp({ mode: 'string' }),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const pointLogs = mysqlTable("point_logs", {
	id: int().autoincrement().notNull(),
	userId: int().notNull(),
	actionType: varchar({ length: 50 }),
	points: int().notNull(),
	description: text().notNull(),
	operatorId: int(),
	relatedId: int(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
(table) => [
	index("idx_userId").on(table.userId),
	index("idx_createdAt").on(table.createdAt),
]);

export const pointRules = mysqlTable("point_rules", {
	id: int().autoincrement().notNull(),
	actionType: varchar({ length: 50 }).notNull(),
	actionName: varchar({ length: 100 }).notNull(),
	points: int().default(0).notNull(),
	isActive: tinyint().default(1).notNull(),
	description: text(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("actionType").on(table.actionType),
]);

export const pointTransactions = mysqlTable("point_transactions", {
	id: int().autoincrement().notNull(),
	userId: int().notNull(),
	childId: int(),
	amount: int().notNull(),
	type: mysqlEnum(['game','task','reward','admin']).notNull(),
	referenceId: int(),
	description: text(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});

export const readingRecords = mysqlTable("reading_records", {
	id: int().autoincrement().notNull(),
	kidId: int().notNull(),
	storyId: int().notNull(),
	clickCount: int().default(0).notNull(),
	readDuration: int().default(0).notNull(),
	completedAt: timestamp({ mode: 'string' }),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const readingStories = mysqlTable("reading_stories", {
	id: int().autoincrement().notNull(),
	title: varchar({ length: 200 }).notNull(),
	content: text().notNull(),
	type: mysqlEnum(['template','custom','ai_generated']).default('template').notNull(),
	coverImageUrl: text(),
	createdBy: int(),
	kidId: int(),
	wordCount: int().notNull(),
	isActive: tinyint().default(1).notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const reminderTypes = mysqlTable("reminder_types", {
	id: int().autoincrement().notNull(),
	userId: int().notNull(),
	name: varchar({ length: 50 }).notNull(),
	icon: varchar({ length: 50 }).default('🔔'),
	color: varchar({ length: 20 }).default('#6366f1'),
	isDefault: tinyint().default(0).notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const reminders = mysqlTable("reminders", {
	id: int().autoincrement().notNull(),
	contactId: int().notNull(),
	userId: int().notNull(),
	reminderTypeId: int(),
	title: varchar({ length: 200 }).notNull(),
	description: text(),
	reminderTime: timestamp({ mode: 'string' }).notNull(),
	reminderType: mysqlEnum(['normal','birthday']).default('normal').notNull(),
	isRecurring: tinyint().default(0).notNull(),
	birthMonth: int(),
	birthDay: int(),
	notificationMethod: mysqlEnum(['in_app','in_app_sound']).default('in_app').notNull(),
	isCompleted: tinyint().default(0).notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const rewardRedemptions = mysqlTable("reward_redemptions", {
	id: int().autoincrement().notNull(),
	rewardId: int().notNull(),
	userId: int().notNull(),
	childId: int(),
	pointsSpent: int().notNull(),
	status: mysqlEnum(['pending','approved','rejected','completed']).default('pending').notNull(),
	redeemedAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	processedAt: timestamp({ mode: 'string' }),
});

export const rewards = mysqlTable("rewards", {
	id: int().autoincrement().notNull(),
	createdBy: int().notNull(),
	familyId: int(),
	name: varchar({ length: 100 }).notNull(),
	description: text(),
	icon: text(),
	pointsCost: int().default(100).notNull(),
	stock: int().default(-1).notNull(),
	isActive: tinyint().default(1).notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const specialKids = mysqlTable("special_kids", {
	id: int().autoincrement().notNull(),
	userId: int(),
	parentUserId: int(),
	name: varchar({ length: 50 }).notNull(),
	avatar: longtext(),
	stars: int().default(0).notNull(),
	position: mysqlEnum(['left','right']).notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const starRedemptions = mysqlTable("star_redemptions", {
	id: int().autoincrement().notNull(),
	kidId: int().notNull(),
	itemId: int().notNull(),
	starsSpent: int().notNull(),
	status: mysqlEnum(['pending','approved','rejected','completed']).default('pending').notNull(),
	redeemedAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	processedAt: timestamp({ mode: 'string' }),
});

export const starRewardRules = mysqlTable("star_reward_rules", {
	id: int().autoincrement().notNull(),
	activityType: varchar({ length: 50 }).notNull(),
	activityName: varchar({ length: 100 }).notNull(),
	starsReward: int().default(1).notNull(),
	description: text(),
	isActive: tinyint().default(1).notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("star_reward_rules_activityType_unique").on(table.activityType),
]);

export const starRewards = mysqlTable("star_rewards", {
	id: int().autoincrement().notNull(),
	kidId: int().notNull(),
	activityType: varchar({ length: 50 }).notNull(),
	starsEarned: int().notNull(),
	description: text(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});

export const starShopItems = mysqlTable("star_shop_items", {
	id: int().autoincrement().notNull(),
	name: varchar({ length: 100 }).notNull(),
	description: text(),
	image: text(),
	starsCost: int().default(10).notNull(),
	stock: int().default(-1).notNull(),
	isActive: tinyint().default(1).notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const taskCompletions = mysqlTable("task_completions", {
	id: int().autoincrement().notNull(),
	taskId: int().notNull(),
	userId: int().notNull(),
	childId: int(),
	completedAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	pointsEarned: int().default(0).notNull(),
});

export const tasks = mysqlTable("tasks", {
	id: int().autoincrement().notNull(),
	createdBy: int().notNull(),
	title: varchar({ length: 200 }).notNull(),
	description: text(),
	taskType: mysqlEnum(['daily','weekly','custom']).default('custom').notNull(),
	points: int().default(10).notNull(),
	isActive: tinyint().default(1).notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const todos = mysqlTable("todos", {
	id: int().autoincrement().notNull(),
	userId: int().notNull(),
	creatorId: int().notNull(),
	title: varchar({ length: 200 }).notNull(),
	description: text(),
	dueDate: timestamp({ mode: 'string' }),
	priority: mysqlEnum(['low','medium','high']).default('medium').notNull(),
	status: mysqlEnum(['pending','in_progress','completed','cancelled']).default('pending').notNull(),
	completedAt: timestamp({ mode: 'string' }),
	relatedContactId: int(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const transactions = mysqlTable("transactions", {
	id: int().autoincrement().notNull(),
	ledgerId: int().notNull(),
	userId: int().notNull(),
	type: mysqlEnum(['income','expense']).notNull(),
	amount: decimal({ precision: 10, scale: 2 }).notNull(),
	category: varchar({ length: 50 }).notNull(),
	subcategory: varchar({ length: 50 }),
	description: text(),
	// you can use { mode: 'date' }, if you want to have Date as type for this column
	transactionDate: date({ mode: 'string' }).notNull(),
	images: json(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const userBadges = mysqlTable("user_badges", {
	id: int().autoincrement().notNull(),
	userId: int().notNull(),
	childId: int(),
	badgeId: int().notNull(),
	earnedAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});

export const userFeatureOrder = mysqlTable("user_feature_order", {
	id: int().autoincrement().notNull(),
	userId: int().notNull(),
	featureId: int().notNull(),
	position: int().notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const userFeaturePermissions = mysqlTable("user_feature_permissions", {
	id: int().autoincrement().notNull(),
	userId: int().notNull(),
	featureKey: varchar({ length: 50 }).notNull(),
	isEnabled: tinyint().default(1).notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const userPreferences = mysqlTable("user_preferences", {
	id: int().autoincrement().notNull(),
	userId: int().notNull(),
	homeCardOrder: json(),
	favoriteFeatures: json(),
	colorThemeId: varchar({ length: 50 }),
	customColors: json(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("user_preferences_userId_unique").on(table.userId),
]);

export const users = mysqlTable("users", {
	id: int().autoincrement().notNull(),
	openId: varchar({ length: 64 }),
	username: varchar({ length: 50 }),
	passwordHash: varchar({ length: 255 }),
	name: text(),
	email: varchar({ length: 320 }),
	loginMethod: varchar({ length: 64 }),
	role: mysqlEnum(['super_admin','parent','baby']).default('parent').notNull(),
	familyId: int(),
	avatar: longtext(),
	points: int().default(0).notNull(),
	balance: decimal({ precision: 20, scale: 8 }).default('0').notNull(),
	sharingEnabled: tinyint().default(0).notNull(),
	isLocked: tinyint().default(0).notNull(),
	failedLoginAttempts: int().default(0).notNull(),
	lastFailedLogin: timestamp({ mode: 'string' }),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	lastSignedIn: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	inviteCode: varchar('invite_code', { length: 6 }),
	inviteLink: varchar('invite_link', { length: 255 }),
	invitedByUserId: int('invited_by_user_id'),
	invitedAt: timestamp('invited_at', { mode: 'string' }),
	inviteCount: int('invite_count').default(0).notNull(),
	inviteEnabled: tinyint('invite_enabled').default(0).notNull(),
	walletEnabled: tinyint('wallet_enabled').default(0).notNull(),
	highestLevelAchieved: varchar('highest_level_achieved', { length: 50 }).default('partner'),
	lastViewedSharingAt: timestamp('last_viewed_sharing_at', { mode: 'string' }),
},
(table) => [
	index("users_openId_unique").on(table.openId),
	index("users_username_unique").on(table.username),
]);

export const verificationCodes = mysqlTable("verification_codes", {
	id: int().autoincrement().notNull(),
	email: varchar({ length: 320 }).notNull(),
	code: varchar({ length: 4 }).notNull(),
	type: mysqlEnum(['register','reset_password']).notNull(),
	expiresAt: timestamp({ mode: 'string' }).notNull(),
	used: tinyint().default(0).notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});

export const vocabularyMaster = mysqlTable("vocabulary_master", {
	id: int().autoincrement().notNull(),
	word: varchar({ length: 100 }).notNull(),
	language: mysqlEnum(['chinese','english']).notNull(),
	wordType: mysqlEnum(['character','word']).default('word').notNull(),
	translation: varchar({ length: 200 }),
	pinyin: varchar({ length: 100 }),
	pronunciation: varchar({ length: 100 }),
	category: varchar({ length: 50 }).default('general').notNull(),
	difficulty: mysqlEnum(['easy','medium','hard']).default('easy').notNull(),
	example: text(),
	imageUrl: text(),
	audioUrl: text(),
	isActive: tinyint().default(1).notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const wrongQuestions = mysqlTable("wrong_questions", {
	id: int().autoincrement().notNull(),
	kidId: int().notNull(),
	gameType: mysqlEnum(['math','antonym','character']).notNull(),
	questionData: text().notNull(),
	userAnswer: varchar({ length: 100 }).notNull(),
	correctAnswer: varchar({ length: 100 }).notNull(),
	reviewed: tinyint().default(0).notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});

// 账目审批规则表
export const ledgerApprovalRules = mysqlTable("ledger_approval_rules", {
	id: int().autoincrement().notNull(),
	ledgerId: int().notNull(),
	// 记账人 ID，如果为 null 表示默认规则（全部&新加入成员）
	recorderId: int(),
	// 审批人类型：all=需全部成员审批，specific=指定成员审批
	approverType: mysqlEnum(['all','specific']).default('all').notNull(),
	// 审批人 ID列表（JSON格式），当 approverType='specific' 时使用
	approverIds: json(),
	// 是否启用
	isEnabled: tinyint().default(1).notNull(),
	createdBy: int().notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

// 账目审批记录表
export const ledgerApprovalRecords = mysqlTable("ledger_approval_records", {
	id: int().autoincrement().notNull(),
	ledgerId: int().notNull(),
	transactionId: int().notNull(),
	approverId: int().notNull(),
	// 审批状态：pending=待审批，approved=已通过，rejected=已拒绝
	status: mysqlEnum(['pending','approved','rejected']).default('pending').notNull(),
	comment: text(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

// 修改 transactions 表，添加审批状态字段（注：这里只是记录，实际需要通过数据库迁移添加）

// 报销修改历史表
export const reimbursementHistory = mysqlTable("reimbursement_history", {
	id: int().autoincrement().notNull(),
	recordId: int('record_id').notNull(),
	ledgerId: int('ledger_id').notNull(),
	operatedBy: int('operated_by').notNull(),
	action: varchar({ length: 50 }).notNull(),
	oldStatus: mysqlEnum('old_status', ['none','pending','completed']),
	newStatus: mysqlEnum('new_status', ['none','pending','completed']),
	notes: text(),
	voucherUrl: text('voucher_url'),
	createdAt: timestamp('created_at', { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
(table) => [
	index("idx_record_id").on(table.recordId),
	index("idx_ledger_id").on(table.ledgerId),
	index("idx_operated_by").on(table.operatedBy),
]);

// 数据加密配置表
export const encryptionConfig = mysqlTable("encryption_config", {
	id: int().autoincrement().notNull(),
	tableName: varchar('table_name', { length: 100 }).notNull(),
	fieldName: varchar('field_name', { length: 100 }).notNull(),
	fieldLabel: varchar('field_label', { length: 100 }).notNull(),
	fieldGroup: varchar('field_group', { length: 50 }).notNull(),
	isEnabled: tinyint('is_enabled').default(0).notNull(),
	encryptedAt: timestamp('encrypted_at', { mode: 'string' }),
	createdAt: timestamp('created_at', { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("idx_table_field").on(table.tableName, table.fieldName),
]);

// ==================== 股权激励系统表 ====================

export const equityInvestments = mysqlTable("equity_investments", {
	id: int().autoincrement().notNull().primaryKey(),
	userId: int("user_id").notNull(),
	investorName: varchar("investor_name", { length: 100 }),
	investorIdCard: varchar("investor_id_card", { length: 18 }),
	investmentAmount: decimal("investment_amount", { precision: 15, scale: 2 }).default('0.00').notNull(),
	investmentDate: timestamp("investment_date", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	notes: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("idx_user_id").on(table.userId),
	index("idx_investment_date").on(table.investmentDate),
]);

export const equityRules = mysqlTable("equity_rules", {
	id: int().autoincrement().notNull().primaryKey(),
	ruleKey: varchar("rule_key", { length: 100 }).notNull().unique(),
	ruleValue: decimal("rule_value", { precision: 10, scale: 4 }).notNull(),
	ruleDescription: text("rule_description"),
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("idx_rule_key").on(table.ruleKey),
]);

export const equityContributions = mysqlTable("equity_contributions", {
	id: int().autoincrement().notNull().primaryKey(),
	userId: int("user_id").notNull(),
	contributionType: varchar("contribution_type", { length: 50 }).notNull(),
	contributionValue: decimal("contribution_value", { precision: 10, scale: 4 }).notNull(),
	relatedUserId: int("related_user_id"),
	description: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
(table) => [
	index("idx_user_id").on(table.userId),
	index("idx_contribution_type").on(table.contributionType),
	index("idx_created_at").on(table.createdAt),
]);

// ==================== 用户扩展资料系统 ====================

export const userProfiles = mysqlTable("user_profiles", {
	id: int().autoincrement().notNull().primaryKey(),
	userId: int("user_id").notNull().unique(),
	
	// 基本信息
	nickname: varchar({ length: 100 }),
	phone: varchar({ length: 20 }),
	
	// 实名认证
	realName: varchar("real_name", { length: 100 }),
	idCardNumber: varchar("id_card_number", { length: 18 }),
	idCardFrontUrl: text("id_card_front_url"),
	idCardBackUrl: text("id_card_back_url"),
	verificationStatus: mysqlEnum("verification_status", ['pending', 'verified', 'rejected']).default('pending'),
	verifiedAt: timestamp("verified_at", { mode: 'string' }),
	
	// 支付账号
	paymentMethod: mysqlEnum("payment_method", ["bank_card", "digital_wallet", "alipay", "wechat"]),
	
	// 银行卡
	bankName: varchar("bank_name", { length: 100 }),
	bankAccountNumber: varchar("bank_account_number", { length: 50 }),
	bankAccountName: varchar("bank_account_name", { length: 100 }),
	
	// 数字钱包
	walletNetwork: varchar("wallet_network", { length: 50 }), // TRC20, ERC20等
	digitalWalletAddress: varchar("digital_wallet_address", { length: 255 }),
	walletQrCodeUrl: text("wallet_qr_code_url"), // 钱包收款码
	
	// 支付宝
	alipayAccount: varchar("alipay_account", { length: 100 }),
	alipayAccountName: varchar("alipay_account_name", { length: 100 }), // 收款人姓名
	alipayQrCodeUrl: text("alipay_qr_code_url"), // 支付宝收款码
	
	// 微信
	wechatQrCodeUrl: text("wechat_qr_code_url"), // 微信收款码
	wechatAccountName: varchar("wechat_account_name", { length: 100 }), // 收款人姓名
	
	// 时间戳
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("idx_user_id").on(table.userId),
	index("idx_verification_status").on(table.verificationStatus),
]);

export const shippingAddresses = mysqlTable("shipping_addresses", {
	id: int().autoincrement().notNull().primaryKey(),
	userId: int("user_id").notNull(),
	
	// 地址信息
	recipientName: varchar("recipient_name", { length: 100 }).notNull(),
	recipientPhone: varchar("recipient_phone", { length: 20 }).notNull(),
	province: varchar({ length: 50 }),
	city: varchar({ length: 50 }),
	district: varchar({ length: 50 }),
	detailedAddress: text("detailed_address").notNull(),
	postalCode: varchar("postal_code", { length: 10 }),
	
	// 标记
	isDefault: tinyint("is_default").default(0).notNull(),
	label: varchar({ length: 20 }), // 家、公司、学校等
	
	// 时间戳
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("idx_user_id").on(table.userId),
	index("idx_is_default").on(table.isDefault),
]);

// 工作群表（脉动节点合作平台）
// 有限合伙企业表
export const partnerships = mysqlTable("partnerships", {
	id: int().autoincrement().primaryKey(),
	name: varchar({ length: 255 }).notNull(),
	description: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

// 工作群表（关联到企业）
export const partnershipWorkGroups = mysqlTable("partnership_work_groups", {
	id: int().autoincrement().primaryKey(),
	partnershipId: int("partnership_id").notNull(),
	name: varchar({ length: 100 }).notNull(),
	description: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

// 成员-企业关联表
export const partnershipMembers = mysqlTable("partnership_members", {
	id: int().autoincrement().primaryKey(),
	partnershipId: int("partnership_id").notNull(),
	userId: int("user_id").notNull(),
	role: mysqlEnum(['member', 'admin']).default('member').notNull(),
	joinedAt: timestamp("joined_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});

// 成员-工作群关联表
export const partnershipWorkGroupMembers = mysqlTable("partnership_work_group_members", {
	id: int().autoincrement().primaryKey(),
	workGroupId: int("work_group_id").notNull(),
	userId: int("user_id").notNull(),
	joinedAt: timestamp("joined_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});

// 合伙人平台看板 - 最新动态表
export const partnershipDashboardActivities = mysqlTable("partnership_dashboard_activities", {
	id: int().autoincrement().primaryKey(),
	partnershipId: int("partnership_id").notNull().default(1),
	userName: varchar("user_name", { length: 100 }).notNull(),
	action: varchar({ length: 100 }).notNull(),
	timeText: varchar("time_text", { length: 100 }).notNull(),
	sortOrder: int("sort_order").notNull().default(0),
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

// 合伙人平台看板 - 预警雷达表
export const partnershipDashboardAlerts = mysqlTable("partnership_dashboard_alerts", {
	id: int().autoincrement().primaryKey(),
	partnershipId: int("partnership_id").notNull().default(1),
	type: varchar({ length: 20 }).notNull().default('warning'),
	message: text().notNull(),
	actionText: varchar("action_text", { length: 255 }).notNull().default(''),
	sortOrder: int("sort_order").notNull().default(0),
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const workGroups = mysqlTable("work_groups", {
	id: int().autoincrement().notNull(),
	name: varchar({ length: 100 }).notNull(),
	description: text(),
	icon: text(),
	createdBy: int("created_by").notNull(),
	ownerId: int("owner_id").notNull(),
	isArchived: tinyint("is_archived").default(0).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("idx_owner_id").on(table.ownerId),
	index("idx_created_by").on(table.createdBy),
]);

// TypeScript类型定义
export type UserProfile = typeof userProfiles.$inferSelect;
export type InsertUserProfile = typeof userProfiles.$inferInsert;
export type ShippingAddress = typeof shippingAddresses.$inferSelect;
export type InsertShippingAddress = typeof shippingAddresses.$inferInsert;
export type WorkGroup = typeof workGroups.$inferSelect;
export type InsertWorkGroup = typeof workGroups.$inferInsert;

export const ledgerBackupSettings = mysqlTable("ledger_backup_settings", {
	id: int().autoincrement().notNull(),
	ledgerId: int("ledger_id").notNull(),
	userId: int("user_id").notNull(),
	frequency: mysqlEnum(['weekly','monthly','quarterly']).notNull(),
	enabled: tinyint().default(1).notNull(),
	backupCount: int("backup_count").default(0).notNull(),
	lastBackupAt: timestamp("last_backup_at", { mode: 'string' }),
	nextBackupAt: timestamp("next_backup_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("ledger_backup_settings_ledger_id_user_id_unique").on(table.ledgerId, table.userId),
]);


// ==================== 卡券系统表 ====================

// 卡券表
export const coupons = mysqlTable("coupons", {
	id: varchar({ length: 36 }).primaryKey().notNull(),
	creatorId: varchar("creator_id", { length: 36 }).notNull(),
	title: varchar({ length: 200 }).notNull(),
	description: text(),
	templateType: varchar("template_type", { length: 50 }).default('default').notNull(),
	templateData: json("template_data"),
	validFrom: timestamp("valid_from", { mode: 'string' }).notNull(),
	validUntil: timestamp("valid_until", { mode: 'string' }).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("coupons_creator_id_idx").on(table.creatorId),
]);

// 卡券接收记录表
export const couponRecipients = mysqlTable("coupon_recipients", {
	id: varchar({ length: 36 }).primaryKey().notNull(),
	couponId: varchar("coupon_id", { length: 36 }).notNull(),
	recipientId: varchar("recipient_id", { length: 36 }).notNull(),
	status: mysqlEnum(['unused', 'used']).default('unused').notNull(),
	receivedAt: timestamp("received_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
(table) => [
	index("coupon_recipients_coupon_id_idx").on(table.couponId),
	index("coupon_recipients_recipient_id_idx").on(table.recipientId),
	index("coupon_recipients_status_idx").on(table.status),
]);

// 卡券使用/核销记录表
export const couponUsage = mysqlTable("coupon_usage", {
	id: varchar({ length: 36 }).primaryKey().notNull(),
	recipientRecordId: varchar("recipient_record_id", { length: 36 }).notNull(),
	couponId: varchar("coupon_id", { length: 36 }).notNull(),
	userId: varchar("user_id", { length: 36 }).notNull(),
	usedAt: timestamp("used_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	notes: text(),
},
(table) => [
	index("coupon_usage_coupon_id_idx").on(table.couponId),
	index("coupon_usage_user_id_idx").on(table.userId),
]);

// ==================== 银行卡和数字钱包系统表 ====================

// 银行卡表
export const bankCards = mysqlTable("bank_cards", {
	id: varchar({ length: 36 }).primaryKey().notNull(),
	userId: varchar("user_id", { length: 36 }).notNull(),
	cardNumber: text("card_number").notNull(), // 加密存储
	cardHolder: text("card_holder").notNull(), // 加密存储
	bankName: varchar("bank_name", { length: 100 }).notNull(),
	cardType: mysqlEnum("card_type", ['debit', 'credit']).default('debit').notNull(),
	isDefault: tinyint("is_default").default(0).notNull(),
	notes: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("bank_cards_user_id_idx").on(table.userId),
	index("bank_cards_is_default_idx").on(table.isDefault),
]);

// 数字钱包表
export const digitalWallets = mysqlTable("digital_wallets", {
	id: varchar({ length: 36 }).primaryKey().notNull(),
	userId: varchar("user_id", { length: 36 }).notNull(),
	walletType: mysqlEnum("wallet_type", ['blockchain', 'alipay', 'wechat', 'other']).notNull(),
	// 区块链钱包字段
	network: varchar({ length: 50 }), // TRC20, ERC20, BEP20等
	walletAddress: text("wallet_address"), // 钱包地址（加密存储）
	currency: varchar({ length: 20 }), // USDT, USDC, ETH, BTC等
	// 支付宝/微信字段
	account: text(), // 账号/手机号（加密存储）
	accountName: text("account_name"), // 账户名（加密存储）
	isDefault: tinyint("is_default").default(0).notNull(),
	notes: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("digital_wallets_user_id_idx").on(table.userId),
	index("digital_wallets_is_default_idx").on(table.isDefault),
]);

// TypeScript类型定义
export type BankCard = typeof bankCards.$inferSelect;
export type InsertBankCard = typeof bankCards.$inferInsert;
export type DigitalWallet = typeof digitalWallets.$inferSelect;
export type InsertDigitalWallet = typeof digitalWallets.$inferInsert;

// ==================== 充值系统表 ====================

// 充值订单表
export const rechargeOrders = mysqlTable("recharge_orders", {
	id: int().autoincrement().notNull().primaryKey(),
	userId: int("user_id").notNull(),
	orderNo: varchar("order_no", { length: 50 }).notNull(),
	amount: decimal("amount", { precision: 20, scale: 8 }).notNull(), // 带小数的唯一金额
	currency: varchar({ length: 10 }).default('USDT').notNull(),
	network: varchar({ length: 20 }).default('TRC20').notNull(),
	walletAddress: varchar("wallet_address", { length: 255 }), // 收款钱包地址
	status: mysqlEnum(['pending', 'submitted', 'completed', 'expired', 'cancelled']).default('pending').notNull(),
	txnHash: varchar("txn_hash", { length: 100 }), // 交易哈希
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	completedAt: timestamp("completed_at", { mode: 'string' }),
	expiresAt: timestamp("expires_at", { mode: 'string' }).notNull(),
},
(table) => [
	index("recharge_orders_user_id_idx").on(table.userId),
	index("recharge_orders_order_no_idx").on(table.orderNo),
	index("recharge_orders_amount_status_idx").on(table.amount, table.status),
	index("recharge_orders_status_idx").on(table.status),
]);

// 余额变动记录表
export const balanceHistory = mysqlTable("balance_history", {
	id: int().autoincrement().notNull().primaryKey(),
	userId: int("user_id").notNull(),
	amount: decimal({ precision: 20, scale: 8 }).notNull(), // 变动金额（正数为增加，负数为减少）
	type: mysqlEnum(['recharge', 'consume', 'refund', 'reward', 'withdraw']).notNull(),
	relatedId: int("related_id"), // 关联订单ID
	balance: decimal({ precision: 20, scale: 8 }).notNull(), // 变动后的余额
	description: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
(table) => [
	index("balance_history_user_id_idx").on(table.userId),
	index("balance_history_type_idx").on(table.type),
]);

// 在users表添加balance字段（需要迁移）
// ALTER TABLE users ADD COLUMN balance DECIMAL(20, 8) DEFAULT 0 NOT NULL;

// TypeScript类型定义
export type RechargeOrder = typeof rechargeOrders.$inferSelect;
export type InsertRechargeOrder = typeof rechargeOrders.$inferInsert;
export type BalanceHistory = typeof balanceHistory.$inferSelect;
export type InsertBalanceHistory = typeof balanceHistory.$inferInsert;

// 收款地址管理表（管理员后台配置，替代环境变量）
export const walletAddresses = mysqlTable("wallet_addresses", {
	id: int().autoincrement().notNull().primaryKey(),
	address: varchar({ length: 100 }).notNull(), // 钱包地址
	network: varchar({ length: 20 }).notNull(), // 网络类型：TRC20, ERC20, BEP20
	label: varchar({ length: 50 }), // 备注名称，如"主钱包"、"备用钱包"
	enabled: tinyint().default(1).notNull(), // 是否启用：1启用 0禁用
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("wallet_addresses_network_idx").on(table.network),
	index("wallet_addresses_enabled_idx").on(table.enabled),
]);

export type WalletAddress = typeof walletAddresses.$inferSelect;
export type InsertWalletAddress = typeof walletAddresses.$inferInsert;

// 扫描器心跳记录表
export const scannerHeartbeat = mysqlTable("scanner_heartbeat", {
	id: int().autoincrement().notNull().primaryKey(),
	scannerType: varchar("scanner_type", { length: 50 }).notNull(), // 扫描器类型
	lastScanAt: timestamp("last_scan_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(), // 最后扫描时间
	scanCount: int("scan_count").default(0), // 扫描次数
	successCount: int("success_count").default(0), // 成功次数
	errorCount: int("error_count").default(0), // 错误次数
	lastError: text("last_error"), // 最后错误信息
	scannedAddresses: int("scanned_addresses").default(0), // 扫描的地址数
	foundTransactions: int("found_transactions").default(0), // 发现的交易数
	matchedOrders: int("matched_orders").default(0), // 匹配的订单数
	unmatchedTransactions: int("unmatched_transactions").default(0), // 未匹配的交易数
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("scanner_heartbeat_type_unique").on(table.scannerType),
]);

export type ScannerHeartbeat = typeof scannerHeartbeat.$inferSelect;
export type InsertScannerHeartbeat = typeof scannerHeartbeat.$inferInsert;

// ── SNT 提现功能 ──────────────────────────────────────────────────────────────

// 用户 BSC 钱包绑定表（每个用户只允许绑定一个 BEP20 地址）
export const userBscWallets = mysqlTable("user_bsc_wallets", {
	id: int().autoincrement().notNull().primaryKey(),
	userId: int("user_id").notNull().unique(),
	bscAddress: varchar("bsc_address", { length: 100 }).notNull(), // BNB Smart Chain BEP20 地址
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("user_bsc_wallets_user_id_idx").on(table.userId),
]);
export type UserBscWallet = typeof userBscWallets.$inferSelect;
export type InsertUserBscWallet = typeof userBscWallets.$inferInsert;

// SNT 提现申请表
export const sntWithdrawals = mysqlTable("snt_withdrawals", {
	id: int().autoincrement().notNull().primaryKey(),
	userId: int("user_id").notNull(),
	sntAmount: decimal("snt_amount", { precision: 20, scale: 4 }).notNull(), // 申请提现的 SNT 数量
	bscAddress: varchar("bsc_address", { length: 100 }).notNull(), // 目标 BEP20 地址
	status: mysqlEnum(['pending', 'processing', 'completed', 'rejected']).default('pending').notNull(),
	adminNote: text("admin_note"), // 管理员备注（拒绝原因等）
	txnHash: varchar("txn_hash", { length: 100 }), // 链上交易哈希
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("snt_withdrawals_user_id_idx").on(table.userId),
	index("snt_withdrawals_status_idx").on(table.status),
]);
export type SntWithdrawal = typeof sntWithdrawals.$inferSelect;
export type InsertSntWithdrawal = typeof sntWithdrawals.$inferInsert;

// SNT 会员间划转记录表
export const sntTransfers = mysqlTable("snt_transfers", {
	id: int().autoincrement().notNull().primaryKey(),
	fromUserId: int("from_user_id").notNull(),   // 转出方
	toUserId: int("to_user_id").notNull(),         // 转入方
	sntAmount: decimal("snt_amount", { precision: 20, scale: 4 }).notNull(), // 划转 SNT 数量
	remark: varchar({ length: 200 }),              // 备注
	createdAt: timestamp("created_at", { mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
(table) => [
	index("snt_transfers_from_user_idx").on(table.fromUserId),
	index("snt_transfers_to_user_idx").on(table.toUserId),
]);
export type SntTransfer = typeof sntTransfers.$inferSelect;
export type InsertSntTransfer = typeof sntTransfers.$inferInsert;


// ===== 奢贝美容院模块（独立文件，便于迁移）=====
export * from "./beauty-schema";

// ===== 脉动共享商盟 - 商品库模块 =====
export * from "./merchant-schema";

// ===== AB 定制账本 - 共享意见本模块 =====
export * from "./opinion-schema";

// ===== A1 定制账本 - 共享抽奖模块 =====
export * from "./lottery-schema";

// ===== 用户类型导出 =====
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ===== AF型竞猜账本 - Polymarket数据表 =====
export const predictionEvents = mysqlTable("prediction_events", {
  id: int().autoincrement().notNull(),
  polymarketEventId: varchar({ length: 100 }).notNull(),
  polymarketMarketId: varchar({ length: 100 }).notNull(),
  coin: mysqlEnum(['BTC', 'ETH']).notNull(),
  question: text().notNull(),
  description: text(),
  outcomes: json().$type<string[]>().notNull(),
  outcomePrices: json().$type<string[]>().notNull(),
  volume: varchar({ length: 50 }),
  endDate: timestamp({ mode: 'string' }),
  imageUrl: text(),
  active: tinyint().default(1).notNull(),
  closed: tinyint().default(0).notNull(),
  syncedAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
  createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
  updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("prediction_events_coin_idx").on(table.coin),
  index("prediction_events_market_idx").on(table.polymarketMarketId),
]);

export const userPredictions = mysqlTable("user_predictions", {
  id: int().autoincrement().notNull(),
  ledgerId: int().notNull(),
  userId: int().notNull(),
  eventId: int().notNull(),
  selectedOutcome: varchar({ length: 50 }).notNull(),
  selectedIndex: int().notNull(),
  note: text(),
  createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
  updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("user_predictions_ledger_idx").on(table.ledgerId),
  index("user_predictions_user_idx").on(table.userId),
  index("user_predictions_event_idx").on(table.eventId),
]);

// AF 委托订单表
export const afOrders = mysqlTable("af_orders", {
  id: int().autoincrement().notNull(),
  ledgerId: int().notNull(),
  userId: int().notNull(),
  coin: varchar({ length: 10 }).notNull(),
  side: varchar({ length: 10 }).notNull(),
  limitPrice: varchar({ length: 50 }).notNull(),
  amount: varchar({ length: 50 }).notNull(),
  quantity: varchar({ length: 50 }).notNull(),
  status: varchar({ length: 20 }).default('pending').notNull(),
  createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
  updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("af_orders_ledger_idx").on(table.ledgerId),
  index("af_orders_user_idx").on(table.userId),
  index("af_orders_coin_idx").on(table.coin),
]);
