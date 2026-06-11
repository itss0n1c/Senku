import {
	type APIMessageSearchResult,
	type GuildBasedChannel,
	type Message,
	MessageSearchAuthorType,
	MessageSearchEmbedType,
	MessageSearchHasType,
	MessageSearchSortMode,
	type RESTGetAPIGuildMessagesSearchQuery,
	Routes,
} from '@warsam-e/echo';
import { tool } from 'ai';
import z from 'zod';
import type { Senku } from '$bot/senku.ts';

export const createDiscordSearchTool = (bot: Senku, msg: Message) =>
	tool({
		description:
			'Search prior messages in the current Discord server. This is read-only and automatically limited to channels visible to both the user and Senku.',
		inputSchema: z.object({
			query: z.object({
				limit: z
					.number()
					.describe('Max number of messages to return (1-25). default is 25.')
					.min(1)
					.max(25)
					.optional(),
				offset: z
					.number()
					.describe('Number to offset the returned messages by (max 9975).')
					.min(0)
					.max(9975)
					.optional(),
				max_id: z.string().describe('Get messages before this message ID').optional(),
				min_id: z.string().describe('Get messages after this message ID').optional(),
				content: z
					.string()
					.describe('Filter messages by content (max 1024 characters)')
					.min(1)
					.max(1024)
					.optional(),
				channel_id: z
					.array(z.string())
					.describe('Filter messages by these channels (max 500)')
					.max(500)
					.optional(),
				author_type: z
					.array(
						z.enum([
							MessageSearchAuthorType.User,
							MessageSearchAuthorType.Bot,
							MessageSearchAuthorType.Webhook,
							MessageSearchAuthorType.NotUser,
							MessageSearchAuthorType.NotBot,
							MessageSearchAuthorType.NotWebhook,
						]),
					)
					.describe(
						'Filter messages by author type. All types can be negated by prefixing them with `-`, which means results will not include messages that match the type.',
					)
					.optional(),
				author_id: z
					.array(z.string())
					.describe('Filter messages by these authors (max 100)')
					.max(100)
					.optional(),
				mentions: z
					.array(z.string())
					.describe('Filter messages that mention these users (max 100)')
					.max(100)
					.optional(),
				mentions_role_id: z
					.array(z.string())
					.describe('Filter messages that mention these roles (max 100)')
					.max(100)
					.optional(),
				mention_everyone: z
					.boolean()
					.describe('Filter messages that do or do not mention `@everyone`')
					.optional(),
				replied_to_user_id: z
					.array(z.string())
					.describe('Filter messages that reply to these users (max 100)')
					.max(100)
					.optional(),
				replied_to_message_id: z
					.array(z.string())
					.describe('Filter messages that reply to these messages (max 100)')
					.max(100)
					.optional(),
				pinned: z.boolean().describe('Filter messages by whether they are or are not pinned').optional(),
				has: z
					.array(
						z.enum([
							MessageSearchHasType.Image,
							MessageSearchHasType.Sound,
							MessageSearchHasType.Video,
							MessageSearchHasType.File,
							MessageSearchHasType.Sticker,
							MessageSearchHasType.Embed,
							MessageSearchHasType.Link,
							MessageSearchHasType.Poll,
							MessageSearchHasType.Snapshot,
							MessageSearchHasType.NotSound,
							MessageSearchHasType.NotImage,
							MessageSearchHasType.NotVideo,
							MessageSearchHasType.NotFile,
							MessageSearchHasType.NotSticker,
							MessageSearchHasType.NotEmbed,
							MessageSearchHasType.NotLink,
							MessageSearchHasType.NotPoll,
							MessageSearchHasType.NotSnapshot,
						]),
					)
					.describe(
						'Filter messages by whether they do or do not have certain types of content. All types can be negated by prefixing them with `-`, which means results will not include messages that match the type.',
					)
					.optional(),
				embed_type: z
					.array(
						z.enum([
							MessageSearchEmbedType.Image,
							MessageSearchEmbedType.Video,
							MessageSearchEmbedType.Gif,
							MessageSearchEmbedType.Sound,
							MessageSearchEmbedType.Article,
						]),
					)
					.describe('Filter messages by embed type')
					.optional(),
				link_hostname: z
					.array(z.string().max(256))
					.describe('Filter messages by link hostname (e.g. `discordapp.com`) (max 256 characters, max 100)')
					.max(100)
					.optional(),
				attachment_filename: z
					.array(z.string().max(1024))
					.describe('Filter messages by attachment filename (max 1024 characters, max 100)')
					.max(100)
					.optional(),
				attachment_extension: z
					.array(z.string().max(256))
					.describe('Filter messages by attachment extension (e.g. `txt`) (max 256 characters, max 100)')
					.max(100)
					.optional(),
				sort_by: z
					.enum([MessageSearchSortMode.Timestamp, MessageSearchSortMode.Relevance])
					.describe('The sorting algorithm to use')
					.optional(),
				sort_order: z.enum(['asc', 'desc']).describe('The direction to sort (`asc` or `desc`)').optional(),
				include_nsfw: z
					.boolean()
					.describe('Whether to include results from age-restricted channels')
					.optional(),
			}),
		}),
		execute: async ({ query }) => {
			if (msg.channel.isDMBased()) {
				return { ok: false, error: 'Discord server search is not available in DMs.' };
			}

			const guild = msg.channel.guild;
			const scopedQuery = scopeQueryToVisibleChannels(bot, msg, query);
			if (!scopedQuery.ok) return scopedQuery;

			console.log('[ai:tool:discordSearchMessages] start', {
				guild_id: guild.id,
				channel_count: scopedQuery.query.channel_id?.length ?? 0,
				content_chars: scopedQuery.query.content?.length ?? 0,
				limit: scopedQuery.query.limit,
				sort_by: scopedQuery.query.sort_by,
			});

			let res: APIMessageSearchResult;
			try {
				res = await _search(guild.id, scopedQuery.query, bot);
			} catch (error) {
				console.warn('[ai:tool:discordSearchMessages] failed', {
					error,
					guild_id: guild.id,
					channel_count: scopedQuery.query.channel_id?.length ?? 0,
				});

				return {
					ok: false,
					error: 'Discord message search failed.',
				};
			}

			const msgs = res.messages.flat();
			console.log('[ai:tool:discordSearchMessages] complete', {
				guild_id: guild.id,
				result_count: msgs.length,
				result_ids: msgs.map((x) => x.id),
			});

			return {
				ok: true,
				results: msgs.map((x) => ({
					id: x.id,
					url: `https://discord.com/channels/${guild.id}/${x.channel_id}/${x.id}`,
					guild_id: guild.id,
					channel_id: x.channel_id,
					channel_mention: `<#${x.channel_id}>`,
					timestamp: x.timestamp,
					author: {
						id: x.author.id,
						mention: `<@${x.author.id}>`,
						name: x.author.global_name ?? x.author.username,
						username: x.author.discriminator
							? `${x.author.username}#${x.author.discriminator}`
							: x.author.username,
					},
					content: x.content.slice(0, 1_000),
					attachments: x.attachments.map((attachment) => ({
						id: attachment.id,
						filename: attachment.filename,
						content_type: attachment.content_type,
						url: attachment.url,
					})),
					embeds: x.embeds.map((embed) => ({
						title: embed.title,
						url: embed.url,
						type: embed.type,
					})),
				})),
			};
		},
	});

function scopeQueryToVisibleChannels(bot: Senku, msg: Message, query: RESTGetAPIGuildMessagesSearchQuery) {
	if (msg.channel.isDMBased()) return { ok: false as const, error: 'Discord server search is not available in DMs.' };

	const allowed = searchableChannelIds(bot, msg);
	const requested = query.channel_id ?? allowed;
	const channel_id = requested.filter((id) => allowed.includes(id));

	if (!channel_id.length) {
		return {
			ok: false as const,
			error: 'No searchable channels are visible to both the user and Senku.',
		};
	}

	return {
		ok: true as const,
		query: {
			...query,
			channel_id,
			limit: query.limit ?? 25,
			include_nsfw: query.include_nsfw ?? false,
		},
	};
}

function searchableChannelIds(bot: Senku, msg: Message) {
	if (msg.channel.isDMBased()) return [];

	const memberOrUser = msg.member ?? msg.author;
	return msg.channel.guild.channels.cache
		.filter((channel): channel is GuildBasedChannel => {
			if (!isSearchableChannel(channel)) return false;
			const userCanView = channel.permissionsFor(memberOrUser)?.has('ViewChannel') ?? false;
			const botCanView = channel.permissionsFor(bot.self)?.has('ViewChannel') ?? false;
			return userCanView && botCanView;
		})
		.map((channel) => channel.id);
}

function isSearchableChannel(channel: GuildBasedChannel) {
	return 'isTextBased' in channel && channel.isTextBased();
}

async function _search(guild_id: string, _query: RESTGetAPIGuildMessagesSearchQuery, bot: Senku) {
	const query = new URLSearchParams();

	for (const [key, value] of Object.entries(_query)) {
		if (value === undefined) continue;

		if (Array.isArray(value)) {
			for (const item of value) {
				query.append(key, String(item));
			}
			continue;
		}

		query.append(key, String(value));
	}

	return bot.rest.get(Routes.guildMessagesSearch(guild_id), {
		query,
	}) as Promise<APIMessageSearchResult>;
}
