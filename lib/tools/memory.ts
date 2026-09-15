import { toolDefinition } from '@tanstack/ai';
import { type } from 'arktype';
import { and, desc, eq, ilike, isNull, or } from 'drizzle-orm';
import { db } from '$db/index.ts';
import { conversationSummaries, memories } from '$db/schema.ts';

type MemoryScope = { guildId?: string; channelId: string; userId: string };

function accessibleMemory(scope: MemoryScope) {
	return and(
		or(eq(memories.userId, scope.userId), isNull(memories.userId)),
		or(
			and(eq(memories.scope, 'private'), eq(memories.channelId, scope.channelId)),
			and(eq(memories.scope, 'channel'), eq(memories.channelId, scope.channelId)),
			scope.guildId ? and(eq(memories.scope, 'guild'), eq(memories.guildId, scope.guildId)) : undefined,
			eq(memories.scope, 'public'),
		),
	);
}

export async function relevantMemories(scope: MemoryScope) {
	console.info('[memory:relevant] querying', scope);
	const results = await db
		.select()
		.from(memories)
		.where(accessibleMemory(scope))
		.orderBy(desc(memories.importance), desc(memories.updatedAt))
		.limit(12);
	console.info('[memory:relevant] loaded', { ...scope, count: results.length });
	return results;
}

export async function conversationSummary(channelId: string) {
	console.info('[memory:summary] loading', { channelId });
	const summary = (
		await db
			.select({ summary: conversationSummaries.summary })
			.from(conversationSummaries)
			.where(eq(conversationSummaries.channelId, channelId))
			.limit(1)
	).at(0)?.summary;
	console.info('[memory:summary] loaded', { channelId, found: Boolean(summary), characters: summary?.length ?? 0 });
	return summary;
}

export async function saveConversationSummary(channelId: string, throughMessageId: string, summary: string) {
	console.info('[memory:summary] saving', { channelId, throughMessageId, characters: summary.length });
	await db
		.insert(conversationSummaries)
		.values({ channelId, throughMessageId, summary })
		.onConflictDoUpdate({
			target: conversationSummaries.channelId,
			set: { throughMessageId, summary, updatedAt: new Date() },
		});
	console.info('[memory:summary] saved', { channelId, throughMessageId });
}

export function createMemoryTools(scope: MemoryScope) {
	const recall = toolDefinition({
		name: 'recall_memory',
		description: 'Search only the durable memories permitted in the current conversation and audience.',
		inputSchema: type({ query: 'string' }),
	}).server(async ({ query }) => {
		console.info('[tool:recall_memory] started', { query, ...scope });
		const results = await db
			.select({ id: memories.id, content: memories.content, visibility: memories.scope, kind: memories.kind })
			.from(memories)
			.where(and(ilike(memories.content, `%${query}%`), accessibleMemory(scope)))
			.limit(10);
		console.info('[tool:recall_memory] completed', { query, count: results.length });
		return results;
	});

	const remember = toolDefinition({
		name: 'remember',
		description:
			'Store durable context with audience-aware visibility. Personal or sensitive matters are private. Channel context stays in the channel. Server context stays in the guild. Safe preferences and behavioral boundaries that should follow a person are public.',
		inputSchema: type({
			content: 'string',
			visibility: "'private' | 'channel' | 'guild' | 'public'",
			kind: "'fact' | 'preference' | 'boundary' | 'relationship' | 'promise' | 'running_joke'",
			subject: "'current_user' | 'server'",
			'importance?': 'number.integer >= 1',
		}),
	}).server(async ({ content, visibility, kind, subject, importance = 5 }) => {
		console.info('[tool:remember] started', {
			visibility,
			kind,
			subject,
			importance,
			characters: content.length,
		});
		const [saved] = await db
			.insert(memories)
			.values({
				content,
				scope: visibility,
				kind,
				importance: Math.min(importance, 10),
				userId: subject === 'current_user' ? scope.userId : null,
				channelId: visibility === 'private' || visibility === 'channel' ? scope.channelId : null,
				guildId: visibility === 'guild' ? scope.guildId : null,
				originChannelId: scope.channelId,
				originGuildId: scope.guildId,
			})
			.returning({ id: memories.id });
		console.info('[tool:remember] completed', { id: saved?.id, visibility, kind, subject });
		return { saved: true, id: saved?.id };
	});

	return [recall, remember];
}
