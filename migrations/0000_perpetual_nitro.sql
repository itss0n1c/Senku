CREATE TABLE "conversation_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" text NOT NULL,
	"summary" text NOT NULL,
	"through_message_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text NOT NULL,
	"guild_id" text,
	"channel_id" text,
	"user_id" text,
	"content" text NOT NULL,
	"importance" integer DEFAULT 5 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_recalled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_summaries_channel_idx" ON "conversation_summaries" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "memories_scope_idx" ON "memories" USING btree ("scope","guild_id","channel_id","user_id");--> statement-breakpoint
CREATE INDEX "memories_importance_idx" ON "memories" USING btree ("importance");