CREATE TABLE `ledger_categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ledgerId` int NOT NULL,
	`name` varchar(50) NOT NULL,
	`type` enum('income','expense') NOT NULL,
	`parentId` int,
	`icon` text,
	`color` varchar(20),
	`sortOrder` int NOT NULL DEFAULT 0,
	`isDefault` tinyint NOT NULL DEFAULT 0,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `ledger_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ledgerId` int NOT NULL,
	`userId` int NOT NULL,
	`role` enum('owner','member') NOT NULL DEFAULT 'member',
	`nickname` varchar(50),
	`canEdit` tinyint NOT NULL DEFAULT 1,
	`canDelete` tinyint NOT NULL DEFAULT 0,
	`canInvite` tinyint NOT NULL DEFAULT 0,
	`invitedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE TABLE `ledger_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ledgerId` int NOT NULL,
	`categoryId` int NOT NULL,
	`amount` decimal(10,2) NOT NULL,
	`type` enum('income','expense') NOT NULL,
	`date` date NOT NULL,
	`description` text,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `ledgers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`description` text,
	`type` varchar(50) NOT NULL DEFAULT 'personal',
	`currency` varchar(10) NOT NULL DEFAULT 'CNY',
	`icon` text,
	`createdBy` int NOT NULL,
	`ownerId` int NOT NULL,
	`isVip` tinyint NOT NULL DEFAULT 0,
	`isArchived` tinyint NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ledgerId` int NOT NULL,
	`userId` int NOT NULL,
	`type` enum('income','expense') NOT NULL,
	`amount` decimal(10,2) NOT NULL,
	`category` varchar(50) NOT NULL,
	`subcategory` varchar(50),
	`description` text,
	`transactionDate` date NOT NULL,
	`images` json,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `verification_codes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(320) NOT NULL,
	`code` varchar(4) NOT NULL,
	`type` enum('register','reset_password') NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`used` tinyint NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
ALTER TABLE `addition20_config` DROP INDEX `addition20_config_kidId_unique`;--> statement-breakpoint
ALTER TABLE `character_game_settings` DROP INDEX `character_game_settings_kidId_unique`;--> statement-breakpoint
ALTER TABLE `company_reports` DROP INDEX `company_reports_company_name_unique`;--> statement-breakpoint
ALTER TABLE `family_vi_config` DROP INDEX `family_vi_config_parentUserId_unique`;--> statement-breakpoint
ALTER TABLE `feature_definitions` DROP INDEX `feature_definitions_featureId_unique`;--> statement-breakpoint
ALTER TABLE `game_order_preferences` DROP INDEX `game_order_preferences_kidId_unique`;--> statement-breakpoint
ALTER TABLE `invitations` DROP INDEX `invitations_code_unique`;--> statement-breakpoint
ALTER TABLE `parent_passwords` DROP INDEX `parent_passwords_userId_unique`;--> statement-breakpoint
ALTER TABLE `point_rules` DROP INDEX `point_rules_actionType_unique`;--> statement-breakpoint
ALTER TABLE `star_reward_rules` DROP INDEX `star_reward_rules_activityType_unique`;--> statement-breakpoint
ALTER TABLE `user_preferences` DROP INDEX `user_preferences_userId_unique`;--> statement-breakpoint
ALTER TABLE `users` DROP INDEX `users_openId_unique`;--> statement-breakpoint
ALTER TABLE `users` DROP INDEX `users_username_unique`;--> statement-breakpoint
ALTER TABLE `addition20_challenges` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `addition20_config` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `addition20_records` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `albums` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `antonyms` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `badges` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `brushing_sessions` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `character_game_settings` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `character_learning_records` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `characters` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `child_profiles` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `company_reports` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `contact_custom_fields` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `contact_field_categories` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `contact_field_values` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `contact_interactions` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `contact_sharing_connections` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `contact_sharing_permissions` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `contact_tag_relations` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `contact_tags` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `contacts` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `exercise_records` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `exercise_types` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `families` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `family_characters` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `familyFeatures` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `family_vi_config` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `family_vocabulary` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `feature_definitions` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `flashcard_records` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `game_order_preferences` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `game_records` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `game_reward_config` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `homeBanner` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `invitation_usages` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `invitations` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `knowledge_categories` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `knowledge_items` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `login_attempts` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `parent_passwords` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `personal_contact_tags` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `photo_comments` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `photos` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `point_logs` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `point_rules` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `point_transactions` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `reading_records` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `reading_stories` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `reminder_types` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `reminders` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `reward_redemptions` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `rewards` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `special_kids` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `star_redemptions` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `star_reward_rules` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `star_rewards` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `star_shop_items` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `task_completions` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `tasks` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `todos` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `user_badges` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `user_feature_order` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `user_feature_permissions` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `user_preferences` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `users` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `vocabulary_master` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `wrong_questions` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `addition20_challenges` MODIFY COLUMN `startedAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `addition20_challenges` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `addition20_config` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `addition20_records` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `albums` MODIFY COLUMN `isPublic` tinyint NOT NULL;--> statement-breakpoint
ALTER TABLE `albums` MODIFY COLUMN `isPublic` tinyint NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `albums` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `antonyms` MODIFY COLUMN `isActive` tinyint NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `antonyms` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `badges` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `brushing_sessions` MODIFY COLUMN `completed` tinyint NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `brushing_sessions` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `character_game_settings` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `character_learning_records` MODIFY COLUMN `isCorrect` tinyint NOT NULL;--> statement-breakpoint
ALTER TABLE `character_learning_records` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `characters` MODIFY COLUMN `isActive` tinyint NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `characters` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `child_profiles` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `company_reports` MODIFY COLUMN `created_at` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `contact_custom_fields` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `contact_field_categories` MODIFY COLUMN `isRequired` tinyint NOT NULL;--> statement-breakpoint
ALTER TABLE `contact_field_categories` MODIFY COLUMN `isRequired` tinyint NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `contact_field_categories` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `contact_field_values` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `contact_interactions` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `contact_sharing_connections` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `contact_sharing_permissions` MODIFY COLUMN `isShared` tinyint NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `contact_sharing_permissions` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `contact_tag_relations` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `contact_tags` MODIFY COLUMN `isPreset` tinyint NOT NULL;--> statement-breakpoint
ALTER TABLE `contact_tags` MODIFY COLUMN `isPreset` tinyint NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `contact_tags` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `contacts` MODIFY COLUMN `isBlacklisted` tinyint NOT NULL;--> statement-breakpoint
ALTER TABLE `contacts` MODIFY COLUMN `isBlacklisted` tinyint NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `contacts` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `exercise_records` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `exercise_types` MODIFY COLUMN `isActive` tinyint NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `exercise_types` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `families` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `family_characters` MODIFY COLUMN `isActive` tinyint NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `family_characters` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `familyFeatures` MODIFY COLUMN `enabled` tinyint NOT NULL;--> statement-breakpoint
ALTER TABLE `familyFeatures` MODIFY COLUMN `enabled` tinyint NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `familyFeatures` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `family_vi_config` MODIFY COLUMN `isActive` tinyint NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `family_vi_config` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `family_vocabulary` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `feature_definitions` MODIFY COLUMN `isActive` tinyint NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `feature_definitions` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `flashcard_records` MODIFY COLUMN `lastInteraction` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `flashcard_records` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `game_order_preferences` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `game_records` MODIFY COLUMN `completedAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `game_records` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `game_reward_config` MODIFY COLUMN `isActive` tinyint NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `game_reward_config` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `homeBanner` MODIFY COLUMN `isActive` tinyint NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `homeBanner` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `invitation_usages` MODIFY COLUMN `usedAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `invitations` MODIFY COLUMN `isActive` tinyint NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `invitations` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `knowledge_categories` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `knowledge_items` MODIFY COLUMN `isPublished` tinyint NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `knowledge_items` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `login_attempts` MODIFY COLUMN `success` tinyint NOT NULL;--> statement-breakpoint
ALTER TABLE `login_attempts` MODIFY COLUMN `success` tinyint NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `login_attempts` MODIFY COLUMN `attemptedAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `parent_passwords` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `personal_contact_tags` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `photo_comments` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `photos` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `point_logs` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `point_rules` MODIFY COLUMN `isActive` tinyint NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `point_rules` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `point_transactions` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `reading_records` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `reading_stories` MODIFY COLUMN `isActive` tinyint NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `reading_stories` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `reminder_types` MODIFY COLUMN `isDefault` tinyint NOT NULL;--> statement-breakpoint
ALTER TABLE `reminder_types` MODIFY COLUMN `isDefault` tinyint NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `reminder_types` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `reminders` MODIFY COLUMN `isRecurring` tinyint NOT NULL;--> statement-breakpoint
ALTER TABLE `reminders` MODIFY COLUMN `isRecurring` tinyint NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `reminders` MODIFY COLUMN `isCompleted` tinyint NOT NULL;--> statement-breakpoint
ALTER TABLE `reminders` MODIFY COLUMN `isCompleted` tinyint NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `reminders` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `reward_redemptions` MODIFY COLUMN `redeemedAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `rewards` MODIFY COLUMN `isActive` tinyint NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `rewards` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `special_kids` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `star_redemptions` MODIFY COLUMN `redeemedAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `star_reward_rules` MODIFY COLUMN `isActive` tinyint NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `star_reward_rules` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `star_rewards` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `star_shop_items` MODIFY COLUMN `isActive` tinyint NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `star_shop_items` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `task_completions` MODIFY COLUMN `completedAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `tasks` MODIFY COLUMN `isActive` tinyint NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `tasks` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `todos` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `user_badges` MODIFY COLUMN `earnedAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `user_feature_order` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `user_feature_permissions` MODIFY COLUMN `isEnabled` tinyint NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `user_feature_permissions` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `user_preferences` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `openId` varchar(64);--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `sharingEnabled` tinyint NOT NULL;--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `sharingEnabled` tinyint NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `isLocked` tinyint NOT NULL;--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `isLocked` tinyint NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `lastSignedIn` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `vocabulary_master` MODIFY COLUMN `isActive` tinyint NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `vocabulary_master` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `wrong_questions` MODIFY COLUMN `reviewed` tinyint NOT NULL;--> statement-breakpoint
ALTER TABLE `wrong_questions` MODIFY COLUMN `reviewed` tinyint NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `wrong_questions` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `contacts` ADD `avatar` text;--> statement-breakpoint
CREATE INDEX `addition20_config_kidId_unique` ON `addition20_config` (`kidId`);--> statement-breakpoint
CREATE INDEX `character_game_settings_kidId_unique` ON `character_game_settings` (`kidId`);--> statement-breakpoint
CREATE INDEX `company_reports_company_name_unique` ON `company_reports` (`company_name`);--> statement-breakpoint
CREATE INDEX `family_vi_config_parentUserId_unique` ON `family_vi_config` (`parentUserId`);--> statement-breakpoint
CREATE INDEX `feature_definitions_featureId_unique` ON `feature_definitions` (`featureId`);--> statement-breakpoint
CREATE INDEX `game_order_preferences_kidId_unique` ON `game_order_preferences` (`kidId`);--> statement-breakpoint
CREATE INDEX `invitations_code_unique` ON `invitations` (`code`);--> statement-breakpoint
CREATE INDEX `parent_passwords_userId_unique` ON `parent_passwords` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_userId` ON `point_logs` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_createdAt` ON `point_logs` (`createdAt`);--> statement-breakpoint
CREATE INDEX `actionType` ON `point_rules` (`actionType`);--> statement-breakpoint
CREATE INDEX `star_reward_rules_activityType_unique` ON `star_reward_rules` (`activityType`);--> statement-breakpoint
CREATE INDEX `user_preferences_userId_unique` ON `user_preferences` (`userId`);--> statement-breakpoint
CREATE INDEX `users_openId_unique` ON `users` (`openId`);--> statement-breakpoint
CREATE INDEX `users_username_unique` ON `users` (`username`);