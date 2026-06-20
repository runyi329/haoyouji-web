CREATE TABLE `ledger_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ledgerId` int NOT NULL,
	`userId` int NOT NULL,
	`role` enum('owner','member') NOT NULL DEFAULT 'member',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ledger_members_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ledgers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`ownerId` int NOT NULL,
	`isVip` boolean NOT NULL DEFAULT false,
	`isArchived` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ledgers_id` PRIMARY KEY(`id`)
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
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `transactions_id` PRIMARY KEY(`id`)
);
