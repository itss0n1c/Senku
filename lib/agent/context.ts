import type { ModelMessage as AIModelMessage, ContentPart } from '@tanstack/ai';
import { GuildMember, type Message, MessageReferenceType } from '@warsam-e/echo';
import type { Senku } from '$bot/senku.ts';

function authorOf(message: Message) {
	const memberOrUser = message.member ?? message.author;
	return memberOrUser instanceof GuildMember ? memberOrUser.user : memberOrUser;
}

function cleanContent(message: Message) {
	let content = message.content;
	for (const user of message.mentions.users.values()) content = content.replaceAll(`<@${user.id}>`, `@${user.tag}`);
	for (const role of message.mentions.roles.values()) content = content.replaceAll(`<@&${role.id}>`, `@${role.name}`);
	for (const channel of message.mentions.channels.values()) {
		if (!channel.isDMBased()) content = content.replaceAll(`<#${channel.id}>`, `#${channel.name}`);
	}
	return content.replaceAll(/<a?:(\w+):(\d+)>/g, ':$1:');
}

async function serializeMessage(message: Message) {
	const author = authorOf(message);
	let reply: object | undefined;
	if (message.reference?.type === MessageReferenceType.Default && message.reference.messageId) {
		const referenced = await message.channel.messages.fetch(message.reference.messageId).catch(() => undefined);
		if (referenced) {
			reply = {
				id: referenced.id,
				author: referenced.author.tag,
				text: cleanContent(referenced).slice(0, 1_000),
			};
		}
	}
	return {
		id: message.id,
		timestamp: message.createdAt.toISOString(),
		author: { id: author.id, name: author.displayName, username: message.author.tag },
		text: cleanContent(message),
		...(reply ? { replyTo: reply } : {}),
	};
}

export async function modelMessages(bot: Senku, messages: Message[]): Promise<AIModelMessage[]> {
	const output: AIModelMessage[] = [];
	let imageCount = 0;
	let imageBytes = 0;
	for (const message of messages) {
		if (message.author.equals(bot.self)) {
			output.push({ role: 'assistant', content: message.content });
			continue;
		}

		const parts: ContentPart[] = [{ type: 'text', content: JSON.stringify(await serializeMessage(message)) }];
		for (const attachment of message.attachments.values()) {
			if (!attachment.contentType?.startsWith('image/')) continue;
			if (imageCount >= 10 || imageBytes + attachment.size > 40 * 1024 * 1024) {
				console.warn('[agent:context] image skipped due to request limits', {
					messageId: message.id,
					attachmentId: attachment.id,
					size: attachment.size,
				});
				continue;
			}
			try {
				console.info('[agent:context] downloading Discord image', {
					messageId: message.id,
					attachmentId: attachment.id,
					size: attachment.size,
				});
				const response = await fetch(attachment.url, { signal: AbortSignal.timeout(15_000) });
				if (!response.ok) throw new Error(`Discord CDN returned ${response.status}`);
				const mimeType = response.headers.get('content-type')?.split(';')[0] ?? attachment.contentType;
				if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mimeType)) {
					throw new Error(`Unsupported image type: ${mimeType}`);
				}
				const bytes = await response.arrayBuffer();
				if (bytes.byteLength > 32 * 1024 * 1024) throw new Error('Image exceeds DeepSeek’s 32 MiB limit');
				imageCount += 1;
				imageBytes += bytes.byteLength;
				parts.push({
					type: 'image',
					source: { type: 'data', value: Buffer.from(bytes).toString('base64'), mimeType },
				});
				console.info('[agent:context] Discord image embedded', {
					messageId: message.id,
					attachmentId: attachment.id,
					bytes: bytes.byteLength,
					mimeType,
				});
			} catch (error) {
				console.warn('[agent:context] Discord image unavailable', {
					messageId: message.id,
					attachmentId: attachment.id,
					error,
				});
				parts.push({
					type: 'text',
					content: `[Image attachment ${attachment.name} could not be loaded.]`,
				});
			}
		}
		output.push({ role: 'user', content: parts });
	}
	return output;
}

export async function conversationPacket(bot: Senku, messages: Message[]) {
	return Promise.all(
		messages.map(async (message) => ({
			...(await serializeMessage(message)),
			isSenku: message.author.equals(bot.self),
			mentionsSenku: message.mentions.has(bot.self),
		})),
	);
}

export function situationalContext(message: Message, messages: Message[] = [message]) {
	const localTime = new Intl.DateTimeFormat('en-CA', {
		timeZone: 'America/Toronto',
		dateStyle: 'full',
		timeStyle: 'long',
	}).format(new Date());
	const speaker = authorOf(message);
	const participants = [
		...new Map(
			messages
				.filter((item) => !item.author.bot)
				.map((item) => {
					const author = authorOf(item);
					return [author.id, { id: author.id, name: author.displayName, username: item.author.tag }] as const;
				}),
		).values(),
	];
	const base = {
		localTime,
		timeZone: 'America/Toronto',
		location: 'Ottawa, Ontario, Canada',
		currentSpeaker: {
			id: speaker.id,
			name: speaker.displayName,
			username: message.author.tag,
		},
		participants,
		channelId: message.channelId,
	};

	if (message.channel.isDMBased()) {
		return {
			...base,
			conversationType: 'direct_message',
			channelName: `DM with ${message.author.tag}`,
		};
	}

	return {
		...base,
		conversationType: 'guild_channel',
		channelName: message.channel.name,
		guild: { id: message.channel.guild.id, name: message.channel.guild.name },
	};
}
