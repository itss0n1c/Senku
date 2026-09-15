import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const memories = pgTable(
	'memories',
	{
		id: uuid().defaultRandom().primaryKey(),
		scope: text().notNull(),
		kind: text().default('fact').notNull(),
		guildId: text('guild_id'),
		channelId: text('channel_id'),
		userId: text('user_id'),
		originGuildId: text('origin_guild_id'),
		originChannelId: text('origin_channel_id'),
		content: text().notNull(),
		importance: integer().default(5).notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
		lastRecalledAt: timestamp('last_recalled_at', { withTimezone: true }),
	},
	(table) => [
		index('memories_scope_idx').on(table.scope, table.guildId, table.channelId, table.userId),
		index('memories_importance_idx').on(table.importance),
	],
);

export const conversationSummaries = pgTable(
	'conversation_summaries',
	{
		id: uuid().defaultRandom().primaryKey(),
		channelId: text('channel_id').notNull(),
		summary: text().notNull(),
		throughMessageId: text('through_message_id').notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [uniqueIndex('conversation_summaries_channel_idx').on(table.channelId)],
);
