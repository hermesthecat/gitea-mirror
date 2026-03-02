CREATE TABLE `git_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`host` text NOT NULL,
	`source_type` text DEFAULT 'git' NOT NULL,
	`username` text,
	`token` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_git_credentials_user_id` ON `git_credentials` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_git_credentials_host` ON `git_credentials` (`host`);--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_git_credentials_user_host` ON `git_credentials` (`user_id`,`host`);--> statement-breakpoint
ALTER TABLE `repositories` ADD `source_type` text DEFAULT 'github';--> statement-breakpoint
ALTER TABLE `repositories` ADD `source_host` text;