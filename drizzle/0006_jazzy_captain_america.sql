CREATE TABLE `ledger_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ledgerId` int NOT NULL,
	`userId` int NOT NULL,
	`role` varchar(20) NOT NULL DEFAULT 'member',
	`joinedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ledger_members_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ledgers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`description` text,
	`creatorId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ledgers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ledgerId` int NOT NULL,
	`userId` int NOT NULL,
	`type` varchar(20) NOT NULL,
	`amount` decimal(10,2) NOT NULL,
	`category` varchar(50) NOT NULL,
	`description` text,
	`transactionDate` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `transactions_id` PRIMARY KEY(`id`)
);
