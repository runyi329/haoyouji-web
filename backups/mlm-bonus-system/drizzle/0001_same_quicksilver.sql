CREATE TABLE `mlm_custom_schemes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`name` varchar(200) NOT NULL,
	`industry` varchar(100) NOT NULL DEFAULT '',
	`schemeType` varchar(50) NOT NULL DEFAULT 'staircase',
	`description` text,
	`config` text NOT NULL,
	`color` varchar(20) NOT NULL DEFAULT '#3B82F6',
	`icon` varchar(10) NOT NULL DEFAULT '⭐',
	`isPublic` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mlm_custom_schemes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mlm_bonus_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`memberId` int NOT NULL,
	`year` int NOT NULL,
	`month` int NOT NULL,
	`retailProfit` decimal(10,2) NOT NULL DEFAULT '0.00',
	`wholesaleProfit` decimal(10,2) NOT NULL DEFAULT '0.00',
	`royaltyOverride` decimal(10,2) NOT NULL DEFAULT '0.00',
	`productionBonus` decimal(10,2) NOT NULL DEFAULT '0.00',
	`annualBonus` decimal(10,2) NOT NULL DEFAULT '0.00',
	`totalBonus` decimal(10,2) NOT NULL DEFAULT '0.00',
	`royaltyDetail` text,
	`productionDetail` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mlm_bonus_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mlm_bonus_rules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`level` enum('member','senior_consultant','qualified_producer','supervisor','world_team','get_team','millionaire_team','presidents_team') NOT NULL,
	`discountRate` decimal(5,2) NOT NULL,
	`minVP` decimal(10,2) NOT NULL DEFAULT '0.00',
	`royaltyRate` decimal(5,2) NOT NULL DEFAULT '0.00',
	`royaltyLevels` int NOT NULL DEFAULT 0,
	`productionRate` decimal(5,2) NOT NULL DEFAULT '0.00',
	`isTabTeam` boolean NOT NULL DEFAULT false,
	`color` varchar(20) NOT NULL DEFAULT '#6b7280',
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mlm_bonus_rules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mlm_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`memberId` varchar(20) NOT NULL,
	`name` varchar(100) NOT NULL,
	`email` varchar(320),
	`phone` varchar(30),
	`sponsorId` int,
	`level` enum('member','senior_consultant','qualified_producer','supervisor','world_team','get_team','millionaire_team','presidents_team') NOT NULL DEFAULT 'member',
	`discountRate` decimal(5,2) NOT NULL DEFAULT '25.00',
	`path` varchar(1000) NOT NULL DEFAULT '/',
	`depth` int NOT NULL DEFAULT 0,
	`isActive` boolean NOT NULL DEFAULT true,
	`country` varchar(50) DEFAULT 'CN',
	`joinDate` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mlm_members_id` PRIMARY KEY(`id`),
	CONSTRAINT `mlm_members_memberId_unique` UNIQUE(`memberId`)
);
--> statement-breakpoint
CREATE TABLE `mlm_monthly_performance` (
	`id` int AUTO_INCREMENT NOT NULL,
	`memberId` int NOT NULL,
	`year` int NOT NULL,
	`month` int NOT NULL,
	`personalVP` decimal(10,2) NOT NULL DEFAULT '0.00',
	`groupVP` decimal(12,2) NOT NULL DEFAULT '0.00',
	`levelSnapshot` enum('member','senior_consultant','qualified_producer','supervisor','world_team','get_team','millionaire_team','presidents_team') NOT NULL DEFAULT 'member',
	`calculated` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mlm_monthly_performance_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mlm_syjk_bonus_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`memberId` int NOT NULL,
	`year` int NOT NULL,
	`month` int NOT NULL,
	`revenueBase` decimal(14,2) NOT NULL DEFAULT '0.00',
	`receivedRateSnapshot` decimal(5,2) NOT NULL DEFAULT '0.00',
	`retainedRate` decimal(5,2) NOT NULL DEFAULT '0.00',
	`bonusAmount` decimal(12,2) NOT NULL DEFAULT '0.00',
	`allocationDetail` text,
	`sourceDetail` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mlm_syjk_bonus_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mlm_syjk_commission_rules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`uplineId` int NOT NULL,
	`downlineId` int NOT NULL,
	`rate` decimal(5,2) NOT NULL,
	`maxRate` decimal(5,2) NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mlm_syjk_commission_rules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mlm_syjk_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`configKey` varchar(100) NOT NULL,
	`configValue` varchar(500) NOT NULL,
	`description` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mlm_syjk_config_id` PRIMARY KEY(`id`),
	CONSTRAINT `mlm_syjk_config_configKey_unique` UNIQUE(`configKey`)
);
--> statement-breakpoint
CREATE TABLE `mlm_syjk_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`memberId` varchar(20) NOT NULL,
	`name` varchar(100) NOT NULL,
	`email` varchar(320),
	`phone` varchar(30),
	`sponsorId` int,
	`receivedRate` decimal(5,2) NOT NULL DEFAULT '0.00',
	`allocatedRate` decimal(5,2) NOT NULL DEFAULT '0.00',
	`path` varchar(2000) NOT NULL DEFAULT '/',
	`depth` int NOT NULL DEFAULT 0,
	`isActive` boolean NOT NULL DEFAULT true,
	`joinDate` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mlm_syjk_members_id` PRIMARY KEY(`id`),
	CONSTRAINT `mlm_syjk_members_memberId_unique` UNIQUE(`memberId`)
);
--> statement-breakpoint
CREATE TABLE `mlm_syjk_performance` (
	`id` int AUTO_INCREMENT NOT NULL,
	`memberId` int NOT NULL,
	`year` int NOT NULL,
	`month` int NOT NULL,
	`personalRevenue` decimal(12,2) NOT NULL DEFAULT '0.00',
	`teamRevenue` decimal(14,2) NOT NULL DEFAULT '0.00',
	`calculated` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mlm_syjk_performance_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `mlm_custom_scheme_user_idx` ON `mlm_custom_schemes` (`userId`);--> statement-breakpoint
CREATE INDEX `mlm_custom_scheme_public_idx` ON `mlm_custom_schemes` (`isPublic`);--> statement-breakpoint
CREATE INDEX `mlm_member_bonus_idx` ON `mlm_bonus_records` (`memberId`,`year`,`month`);--> statement-breakpoint
CREATE INDEX `mlm_sponsor_idx` ON `mlm_members` (`sponsorId`);--> statement-breakpoint
CREATE INDEX `mlm_path_idx` ON `mlm_members` (`path`);--> statement-breakpoint
CREATE INDEX `mlm_level_idx` ON `mlm_members` (`level`);--> statement-breakpoint
CREATE INDEX `mlm_member_month_idx` ON `mlm_monthly_performance` (`memberId`,`year`,`month`);--> statement-breakpoint
CREATE INDEX `mlm_syjk_bonus_idx` ON `mlm_syjk_bonus_records` (`memberId`,`year`,`month`);--> statement-breakpoint
CREATE INDEX `mlm_syjk_rule_idx` ON `mlm_syjk_commission_rules` (`uplineId`,`downlineId`);--> statement-breakpoint
CREATE INDEX `mlm_syjk_downline_idx` ON `mlm_syjk_commission_rules` (`downlineId`);--> statement-breakpoint
CREATE INDEX `mlm_syjk_sponsor_idx` ON `mlm_syjk_members` (`sponsorId`);--> statement-breakpoint
CREATE INDEX `mlm_syjk_path_idx` ON `mlm_syjk_members` (`path`);--> statement-breakpoint
CREATE INDEX `mlm_syjk_perf_idx` ON `mlm_syjk_performance` (`memberId`,`year`,`month`);