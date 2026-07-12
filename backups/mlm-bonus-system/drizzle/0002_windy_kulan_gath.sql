CREATE TABLE `mlm_company_catalog` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` varchar(50) NOT NULL,
	`name` varchar(100) NOT NULL,
	`nameEn` varchar(100) NOT NULL,
	`tagline` varchar(200) NOT NULL,
	`subtitle` varchar(100) NOT NULL,
	`description` text NOT NULL,
	`schemeType` varchar(50) NOT NULL,
	`tag` varchar(30) NOT NULL,
	`features` varchar(500) NOT NULL,
	`href` varchar(100) NOT NULL,
	`icon` varchar(10) NOT NULL,
	`locked` boolean NOT NULL DEFAULT false,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mlm_company_catalog_id` PRIMARY KEY(`id`),
	CONSTRAINT `mlm_company_catalog_companyId_unique` UNIQUE(`companyId`)
);
--> statement-breakpoint
CREATE INDEX `mlm_catalog_type_idx` ON `mlm_company_catalog` (`schemeType`);--> statement-breakpoint
CREATE INDEX `mlm_catalog_name_idx` ON `mlm_company_catalog` (`name`);