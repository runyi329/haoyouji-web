CREATE TABLE `company_reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_name` varchar(255) NOT NULL,
	`report_file_url` text,
	`raw_text` text,
	`formatted_content` text NOT NULL,
	`uploaded_by` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `company_reports_id` PRIMARY KEY(`id`),
	CONSTRAINT `company_reports_company_name_unique` UNIQUE(`company_name`)
);
