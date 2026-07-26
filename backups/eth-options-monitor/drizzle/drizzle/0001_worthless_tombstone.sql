CREATE TABLE `stock_risk_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`symbols` text NOT NULL,
	`names` text NOT NULL,
	`baseRate` double NOT NULL,
	`totalRate` double NOT NULL,
	`highestSymbol` varchar(10),
	`highestName` varchar(50),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `stock_risk_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stock_risk_stocks` (
	`symbol` varchar(10) NOT NULL,
	`name` varchar(50) NOT NULL,
	`ts_code` varchar(12) NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `stock_risk_stocks_symbol` PRIMARY KEY(`symbol`)
);
