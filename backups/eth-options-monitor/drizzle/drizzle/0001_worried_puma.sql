CREATE TABLE `buy_records` (
	`id` varchar(64) NOT NULL,
	`userId` int,
	`clientId` varchar(64) NOT NULL,
	`instrumentName` varchar(64) NOT NULL,
	`strike` int NOT NULL,
	`expiryLabel` varchar(32) NOT NULL,
	`annualizedRate` double,
	`markPriceUsd` double,
	`ethPriceAtBuy` double NOT NULL,
	`trueBreakeven` double,
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `buy_records_id` PRIMARY KEY(`id`)
);
