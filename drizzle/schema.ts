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
	type: mysqlEnum(['income','expense']).notNull(),
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
	canEdit: tinyint().default(1).notNull(),
	canDelete: tinyint().default(0).notNull(),
	canInvite: tinyint().default(0).notNull(),
	invitedBy: int(),
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
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
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
	isVip: tinyint().default(0).notNull(),
	isArchived: tinyint().default(0).notNull(),
	defaultPermissionView: mysqlEnum("default_permission_view", ['all','own','none']).default('own').notNull(),
	defaultPermissionAdd: mysqlEnum("default_permission_add", ['all','own','none']).default('own').notNull(),
	defaultPermissionEdit: mysqlEnum("default_permission_edit", ['all','own','none']).default('own').notNull(),
	defaultPermissionDelete: mysqlEnum("default_permission_delete", ['all','own','none']).default('own').notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

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
	highestLevelAchieved: varchar('highest_level_achieved', { length: 50 }).default('partner'),
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

// TypeScript类型定义
export type UserProfile = typeof userProfiles.$inferSelect;
export type InsertUserProfile = typeof userProfiles.$inferInsert;
export type ShippingAddress = typeof shippingAddresses.$inferSelect;
export type InsertShippingAddress = typeof shippingAddresses.$inferInsert;
