ALTER TABLE `repositories` ADD `retry_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `repositories` ADD `last_retry_at` integer;