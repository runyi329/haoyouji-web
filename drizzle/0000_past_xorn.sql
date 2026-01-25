CREATE TABLE `addition20_challenges` (
	`id` int AUTO_INCREMENT NOT NULL,
	`kidId` int NOT NULL,
	`parentId` int NOT NULL,
	`targetCorrectCount` int NOT NULL,
	`penaltyPerWrong` int NOT NULL DEFAULT 0,
	`rewardTitle` varchar(100) NOT NULL,
	`rewardImageUrl` text,
	`rewardFileKey` varchar(255),
	`currentCorrectCount` int NOT NULL DEFAULT 0,
	`totalAttempted` int NOT NULL DEFAULT 0,
	`totalCorrect` int NOT NULL DEFAULT 0,
	`totalWrong` int NOT NULL DEFAULT 0,
	`status` enum('active','paused','completed','cancelled') NOT NULL DEFAULT 'active',
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`lastPlayedAt` timestamp,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `addition20_challenges_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `addition20_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`kidId` int NOT NULL,
	`difficulty` enum('easy','medium','hard') NOT NULL DEFAULT 'easy',
	`questionCount` int NOT NULL DEFAULT 10,
	`answerMode` enum('choice','input') NOT NULL DEFAULT 'choice',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `addition20_config_id` PRIMARY KEY(`id`),
	CONSTRAINT `addition20_config_kidId_unique` UNIQUE(`kidId`)
);
--> statement-breakpoint
CREATE TABLE `addition20_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`kidId` int NOT NULL,
	`difficulty` enum('easy','medium','hard') NOT NULL,
	`questionCount` int NOT NULL,
	`correctCount` int NOT NULL,
	`duration` int NOT NULL,
	`answerMode` enum('choice','input') NOT NULL,
	`starsEarned` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `addition20_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `albums` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`childId` int,
	`name` varchar(100) NOT NULL,
	`description` text,
	`coverImage` text,
	`isPublic` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `albums_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `antonyms` (
	`id` int AUTO_INCREMENT NOT NULL,
	`word` varchar(50) NOT NULL,
	`antonym` varchar(50) NOT NULL,
	`category` varchar(50) NOT NULL DEFAULT 'general',
	`difficulty` enum('easy','medium','hard') NOT NULL DEFAULT 'easy',
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `antonyms_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `badges` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`description` text,
	`icon` varchar(50),
	`color` varchar(20),
	`requirement` text,
	`pointsRequired` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `badges_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `brushing_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`kidId` int NOT NULL,
	`duration` int NOT NULL,
	`completed` boolean NOT NULL DEFAULT true,
	`starsEarned` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `brushing_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `character_game_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`kidId` int NOT NULL,
	`autoPlayCount` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `character_game_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `character_game_settings_kidId_unique` UNIQUE(`kidId`)
);
--> statement-breakpoint
CREATE TABLE `character_learning_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`kidId` int NOT NULL,
	`characterId` int NOT NULL,
	`isCorrect` boolean NOT NULL,
	`selectedAnswer` varchar(10),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `character_learning_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `characters` (
	`id` int AUTO_INCREMENT NOT NULL,
	`character` varchar(10) NOT NULL,
	`pinyin` varchar(50) NOT NULL,
	`imageUrl` text NOT NULL,
	`fileKey` varchar(255) NOT NULL,
	`category` varchar(50) NOT NULL,
	`difficulty` int NOT NULL DEFAULT 1,
	`strokeCount` int NOT NULL DEFAULT 0,
	`commonWords` json,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `characters_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `child_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`parentId` int NOT NULL,
	`name` varchar(100) NOT NULL,
	`avatar` text,
	`birthday` timestamp,
	`points` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `child_profiles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `company_reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_name` varchar(255) NOT NULL,
	`report_file_url` text,
	`raw_text` longtext,
	`formatted_content` text NOT NULL,
	`uploaded_by` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `company_reports_id` PRIMARY KEY(`id`),
	CONSTRAINT `company_reports_company_name_unique` UNIQUE(`company_name`)
);
--> statement-breakpoint
CREATE TABLE `contact_custom_fields` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contactId` int NOT NULL,
	`fieldName` varchar(100) NOT NULL,
	`fieldValue` text,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contact_custom_fields_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contact_field_categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`parentUserId` int NOT NULL,
	`parentCategoryId` int DEFAULT 0,
	`name` varchar(100) NOT NULL,
	`icon` varchar(50),
	`fieldType` varchar(20) NOT NULL DEFAULT 'text',
	`options` json,
	`sortOrder` int NOT NULL DEFAULT 0,
	`isRequired` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contact_field_categories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contact_field_values` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contactId` int NOT NULL,
	`categoryId` int NOT NULL,
	`value` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contact_field_values_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contact_interactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contactId` int NOT NULL,
	`interactionDate` timestamp NOT NULL,
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `contact_interactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contact_sharing_connections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sharerId` int NOT NULL,
	`receiverId` int NOT NULL,
	`status` enum('pending','active','rejected') NOT NULL DEFAULT 'pending',
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contact_sharing_connections_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contact_sharing_permissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`connectionId` int NOT NULL,
	`fieldName` varchar(100) NOT NULL,
	`isShared` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contact_sharing_permissions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contact_tag_relations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contactId` int NOT NULL,
	`tagId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `contact_tag_relations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contact_tags` (
	`id` int AUTO_INCREMENT NOT NULL,
	`parentUserId` int NOT NULL,
	`name` varchar(50) NOT NULL,
	`color` varchar(20) NOT NULL DEFAULT '#3b82f6',
	`sortOrder` int NOT NULL DEFAULT 0,
	`isPreset` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `contact_tags_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`parentUserId` int NOT NULL,
	`name` varchar(100) NOT NULL,
	`title` varchar(50),
	`gender` varchar(10),
	`birthDate` varchar(20),
	`occupation` varchar(100),
	`address` text,
	`region` varchar(50),
	`wechat` varchar(100),
	`phone` varchar(20),
	`tags` json,
	`referrerId` int,
	`isBlacklisted` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contacts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `exercise_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`exerciseTypeId` int NOT NULL,
	`count` int NOT NULL,
	`recordDate` date NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `exercise_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `exercise_types` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(50) NOT NULL,
	`icon` varchar(50) DEFAULT '💪',
	`isActive` boolean NOT NULL DEFAULT true,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `exercise_types_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `families` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`description` text,
	`avatar` text,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `families_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `family_characters` (
	`id` int AUTO_INCREMENT NOT NULL,
	`familyId` int NOT NULL,
	`character` varchar(10) NOT NULL,
	`pinyin` varchar(50) NOT NULL,
	`imageUrl` text,
	`fileKey` varchar(255),
	`category` varchar(50) NOT NULL DEFAULT '自定义',
	`difficulty` int NOT NULL DEFAULT 1,
	`commonWords` json,
	`notes` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `family_characters_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `familyFeatures` (
	`id` int AUTO_INCREMENT NOT NULL,
	`familyId` int NOT NULL,
	`featureName` varchar(50) NOT NULL,
	`subFeatureName` varchar(100) NOT NULL,
	`parentFeature` varchar(100),
	`level` int NOT NULL DEFAULT 1,
	`path` varchar(500),
	`displayOrder` int NOT NULL DEFAULT 0,
	`enabled` boolean NOT NULL DEFAULT false,
	`settings` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `familyFeatures_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `family_vi_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`parentUserId` int NOT NULL,
	`viThemeId` varchar(50),
	`customConfig` json,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `family_vi_config_id` PRIMARY KEY(`id`),
	CONSTRAINT `family_vi_config_parentUserId_unique` UNIQUE(`parentUserId`)
);
--> statement-breakpoint
CREATE TABLE `family_vocabulary` (
	`id` int AUTO_INCREMENT NOT NULL,
	`parentUserId` int NOT NULL,
	`vocabularyId` int NOT NULL,
	`kidId` int,
	`addedBy` int NOT NULL,
	`customNote` text,
	`masteryLevel` enum('not_started','learning','mastered') NOT NULL DEFAULT 'not_started',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `family_vocabulary_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `feature_definitions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`featureId` int NOT NULL,
	`title` varchar(100) NOT NULL,
	`description` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`defaultPosition` int NOT NULL,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `feature_definitions_id` PRIMARY KEY(`id`),
	CONSTRAINT `feature_definitions_featureId_unique` UNIQUE(`featureId`)
);
--> statement-breakpoint
CREATE TABLE `flashcard_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`kidId` int NOT NULL,
	`characterId` int NOT NULL,
	`knownCount` int NOT NULL DEFAULT 0,
	`forgottenCount` int NOT NULL DEFAULT 0,
	`lastInteraction` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `flashcard_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `game_order_preferences` (
	`id` int AUTO_INCREMENT NOT NULL,
	`kidId` int NOT NULL,
	`gameOrders` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `game_order_preferences_id` PRIMARY KEY(`id`),
	CONSTRAINT `game_order_preferences_kidId_unique` UNIQUE(`kidId`)
);
--> statement-breakpoint
CREATE TABLE `game_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`childId` int,
	`gameType` enum('memory','puzzle','math') NOT NULL,
	`score` int NOT NULL DEFAULT 0,
	`level` int NOT NULL DEFAULT 1,
	`duration` int NOT NULL DEFAULT 0,
	`completedAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `game_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `game_reward_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`familyId` int,
	`gameType` varchar(50) NOT NULL,
	`activityType` varchar(50) NOT NULL,
	`starsReward` int NOT NULL DEFAULT 1,
	`description` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `game_reward_config_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `homeBanner` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(200),
	`description` text,
	`imageUrl` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `homeBanner_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `invitation_usages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`invitationId` int NOT NULL,
	`userId` int NOT NULL,
	`familyId` int NOT NULL,
	`usedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `invitation_usages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `invitations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(32) NOT NULL,
	`familyName` varchar(100),
	`maxUses` int NOT NULL DEFAULT 1,
	`usedCount` int NOT NULL DEFAULT 0,
	`expiresAt` timestamp,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `invitations_id` PRIMARY KEY(`id`),
	CONSTRAINT `invitations_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `knowledge_categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`icon` varchar(50),
	`color` varchar(20),
	`description` text,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `knowledge_categories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `knowledge_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`categoryId` int NOT NULL,
	`title` varchar(200) NOT NULL,
	`content` text NOT NULL,
	`coverImage` text,
	`images` json,
	`viewCount` int NOT NULL DEFAULT 0,
	`isPublished` boolean NOT NULL DEFAULT true,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `knowledge_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `login_attempts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ipAddress` varchar(45) NOT NULL,
	`username` varchar(50),
	`success` boolean NOT NULL DEFAULT false,
	`attemptedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `login_attempts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `parent_passwords` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`passwordHash` varchar(255) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `parent_passwords_id` PRIMARY KEY(`id`),
	CONSTRAINT `parent_passwords_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `personal_contact_tags` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contactId` int NOT NULL,
	`parentUserId` int NOT NULL,
	`name` varchar(50) NOT NULL,
	`color` varchar(20) NOT NULL DEFAULT '#8b5cf6',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `personal_contact_tags_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `photo_comments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`photoId` int NOT NULL,
	`userId` int NOT NULL,
	`content` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `photo_comments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `photos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`albumId` int NOT NULL,
	`userId` int NOT NULL,
	`url` text NOT NULL,
	`fileKey` varchar(255) NOT NULL,
	`thumbnail` text,
	`description` text,
	`takenAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `photos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `point_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`actionType` varchar(50),
	`points` int NOT NULL,
	`description` text NOT NULL,
	`operatorId` int,
	`relatedId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `point_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `point_rules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`actionType` varchar(50) NOT NULL,
	`actionName` varchar(100) NOT NULL,
	`points` int NOT NULL DEFAULT 0,
	`isActive` boolean NOT NULL DEFAULT true,
	`description` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `point_rules_id` PRIMARY KEY(`id`),
	CONSTRAINT `point_rules_actionType_unique` UNIQUE(`actionType`)
);
--> statement-breakpoint
CREATE TABLE `point_transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`childId` int,
	`amount` int NOT NULL,
	`type` enum('game','task','reward','admin') NOT NULL,
	`referenceId` int,
	`description` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `point_transactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `reading_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`kidId` int NOT NULL,
	`storyId` int NOT NULL,
	`clickCount` int NOT NULL DEFAULT 0,
	`readDuration` int NOT NULL DEFAULT 0,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `reading_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `reading_stories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(200) NOT NULL,
	`content` text NOT NULL,
	`type` enum('template','custom','ai_generated') NOT NULL DEFAULT 'template',
	`coverImageUrl` text,
	`createdBy` int,
	`kidId` int,
	`wordCount` int NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `reading_stories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `reminder_types` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(50) NOT NULL,
	`icon` varchar(50) DEFAULT '🔔',
	`color` varchar(20) DEFAULT '#6366f1',
	`isDefault` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `reminder_types_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `reminders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contactId` int NOT NULL,
	`userId` int NOT NULL,
	`reminderTypeId` int,
	`title` varchar(200) NOT NULL,
	`description` text,
	`reminderTime` timestamp NOT NULL,
	`reminderType` enum('normal','birthday') NOT NULL DEFAULT 'normal',
	`isRecurring` boolean NOT NULL DEFAULT false,
	`birthMonth` int,
	`birthDay` int,
	`notificationMethod` enum('in_app','in_app_sound') NOT NULL DEFAULT 'in_app',
	`isCompleted` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `reminders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `reward_redemptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`rewardId` int NOT NULL,
	`userId` int NOT NULL,
	`childId` int,
	`pointsSpent` int NOT NULL,
	`status` enum('pending','approved','rejected','completed') NOT NULL DEFAULT 'pending',
	`redeemedAt` timestamp NOT NULL DEFAULT (now()),
	`processedAt` timestamp,
	CONSTRAINT `reward_redemptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `rewards` (
	`id` int AUTO_INCREMENT NOT NULL,
	`createdBy` int NOT NULL,
	`familyId` int,
	`name` varchar(100) NOT NULL,
	`description` text,
	`icon` text,
	`pointsCost` int NOT NULL DEFAULT 100,
	`stock` int NOT NULL DEFAULT -1,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `rewards_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `special_kids` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`parentUserId` int,
	`name` varchar(50) NOT NULL,
	`avatar` text,
	`stars` int NOT NULL DEFAULT 0,
	`position` enum('left','right') NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `special_kids_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `star_redemptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`kidId` int NOT NULL,
	`itemId` int NOT NULL,
	`starsSpent` int NOT NULL,
	`status` enum('pending','approved','rejected','completed') NOT NULL DEFAULT 'pending',
	`redeemedAt` timestamp NOT NULL DEFAULT (now()),
	`processedAt` timestamp,
	CONSTRAINT `star_redemptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `star_reward_rules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`activityType` varchar(50) NOT NULL,
	`activityName` varchar(100) NOT NULL,
	`starsReward` int NOT NULL DEFAULT 1,
	`description` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `star_reward_rules_id` PRIMARY KEY(`id`),
	CONSTRAINT `star_reward_rules_activityType_unique` UNIQUE(`activityType`)
);
--> statement-breakpoint
CREATE TABLE `star_rewards` (
	`id` int AUTO_INCREMENT NOT NULL,
	`kidId` int NOT NULL,
	`activityType` varchar(50) NOT NULL,
	`starsEarned` int NOT NULL,
	`description` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `star_rewards_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `star_shop_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`description` text,
	`image` text,
	`starsCost` int NOT NULL DEFAULT 10,
	`stock` int NOT NULL DEFAULT -1,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `star_shop_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `task_completions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`taskId` int NOT NULL,
	`userId` int NOT NULL,
	`childId` int,
	`completedAt` timestamp NOT NULL DEFAULT (now()),
	`pointsEarned` int NOT NULL DEFAULT 0,
	CONSTRAINT `task_completions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`createdBy` int NOT NULL,
	`title` varchar(200) NOT NULL,
	`description` text,
	`taskType` enum('daily','weekly','custom') NOT NULL DEFAULT 'custom',
	`points` int NOT NULL DEFAULT 10,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tasks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `todos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`creatorId` int NOT NULL,
	`title` varchar(200) NOT NULL,
	`description` text,
	`dueDate` timestamp,
	`priority` enum('low','medium','high') NOT NULL DEFAULT 'medium',
	`status` enum('pending','in_progress','completed','cancelled') NOT NULL DEFAULT 'pending',
	`completedAt` timestamp,
	`relatedContactId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `todos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_badges` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`childId` int,
	`badgeId` int NOT NULL,
	`earnedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `user_badges_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_feature_order` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`featureId` int NOT NULL,
	`position` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_feature_order_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_feature_permissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`featureKey` varchar(50) NOT NULL,
	`isEnabled` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_feature_permissions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_preferences` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`homeCardOrder` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_preferences_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_preferences_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`username` varchar(50),
	`passwordHash` varchar(255),
	`name` text,
	`email` varchar(320),
	`loginMethod` varchar(64),
	`role` enum('super_admin','parent','baby') NOT NULL DEFAULT 'parent',
	`familyId` int,
	`avatar` text,
	`points` int NOT NULL DEFAULT 0,
	`sharingEnabled` boolean NOT NULL DEFAULT false,
	`isLocked` boolean NOT NULL DEFAULT false,
	`failedLoginAttempts` int NOT NULL DEFAULT 0,
	`lastFailedLogin` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`),
	CONSTRAINT `users_username_unique` UNIQUE(`username`)
);
--> statement-breakpoint
CREATE TABLE `vocabulary_master` (
	`id` int AUTO_INCREMENT NOT NULL,
	`word` varchar(100) NOT NULL,
	`language` enum('chinese','english') NOT NULL,
	`wordType` enum('character','word') NOT NULL DEFAULT 'word',
	`translation` varchar(200),
	`pinyin` varchar(100),
	`pronunciation` varchar(100),
	`category` varchar(50) NOT NULL DEFAULT 'general',
	`difficulty` enum('easy','medium','hard') NOT NULL DEFAULT 'easy',
	`example` text,
	`imageUrl` text,
	`audioUrl` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vocabulary_master_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `wrong_questions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`kidId` int NOT NULL,
	`gameType` enum('math','antonym','character') NOT NULL,
	`questionData` text NOT NULL,
	`userAnswer` varchar(100) NOT NULL,
	`correctAnswer` varchar(100) NOT NULL,
	`reviewed` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `wrong_questions_id` PRIMARY KEY(`id`)
);
