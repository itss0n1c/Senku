ALTER TABLE "memories" ADD COLUMN "kind" text DEFAULT 'fact' NOT NULL;--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "origin_guild_id" text;--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "origin_channel_id" text;--> statement-breakpoint
UPDATE "memories" SET "origin_guild_id" = "guild_id", "origin_channel_id" = "channel_id";--> statement-breakpoint
UPDATE "memories" SET "scope" = 'public' WHERE "scope" = 'global';--> statement-breakpoint
UPDATE "memories" SET "scope" = 'private' WHERE "scope" = 'user';
