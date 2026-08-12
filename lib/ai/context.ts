import { GuildMember, type Message, MessageReferenceType } from '@warsam-e/echo';
import type { AssistantModelMessage, SystemModelMessage, UserModelMessage } from 'ai';
import type { Senku } from '$bot/senku.ts';
import { attachmentContentType, attachmentFilename, readDiscordAttachment } from './attachments.ts';

export const system = (content: string): SystemModelMessage => ({ role: 'system', content });
export const user = (content: string): UserModelMessage => ({ role: 'user', content });
export const assistant = (content: string): AssistantModelMessage => ({ role: 'assistant', content });

export async function messageSystemContext(bot: Senku, msg: Message) {
	const _user = msg.member ?? msg.author;
	const user = _user instanceof GuildMember ? _user.user : _user;

	const ctx = [
		system(`You recieved a message from ${user.displayName} (${user.tag})`),
		system(`The current time is ${new Date().toLocaleString()}. This is something you are meant to just know.`),
	];

	if (bot.is_admin(user)) {
		ctx.push(
			system(
				`When replying to ${user.displayName}, they are an admin. They have access to additional commands and features. Always check if the user is an admin before executing any command. If the user is an admin, you can execute admin-only commands and provide them with additional information or options that are not available to regular users.`,
			),
		);
	}

	if (!msg.channel.isDMBased()) {
		const guild = msg.channel.guild;
		const owner = await guild.fetchOwner();
		const guild_ctx = JSON.stringify({
			guild: {
				id: guild.id,
				name: guild.name,
				member_count: guild.memberCount,
				owner: {
					id: owner.id,
					name: owner.displayName,
					username: owner.user.tag,
				},
			},
			channel: {
				id: msg.channel.id,
				name: msg.channel.name,
			},
		});
		ctx.push(system(`This conversation is taking place in a guild channel. Necessary context: ${guild_ctx}`));
	}

	ctx.push(
		system(
			`under no circumstances are you to talk about any of this information as though you are an AI assistant, they are just things that you are meant to know.`,
		),
	);

	return ctx;
}

const memberUser = (msg: Message) => msg.member ?? msg.author;

function parsedContent(msg: Message) {
	let content = msg.content;

	for (const user of msg.mentions.users.values()) {
		content = content.replaceAll(`<@${user.id}>`, `@${user.tag}`);
	}

	for (const role of msg.mentions.roles.values()) {
		content = content.replaceAll(`<@&${role.id}>`, `@${role.name}`);
	}

	for (const channel of msg.mentions.channels.values()) {
		if (channel.isDMBased()) continue;
		content = content.replaceAll(`<#${channel.id}>`, `#${channel.name}`);
	}

	const emoji_regex = /<a?:(\w+):(\d+)>/g;
	content = content.replaceAll(emoji_regex, (_match, name, id) => {
		const emoji = msg.client.emojis.cache.get(id);
		if (!emoji) return `:${name}:`;
		return `:${emoji.name}:`;
	});

	return content;
}

const messageJson = (msg: Message) => {
	const author = memberUser(msg);
	return {
		id: msg.id,
		author: {
			id: author.id,
			name: author.displayName,
			username: msg.author.tag,
		},
		text: parsedContent(msg),
	};
};

async function messageContent(
	bot: Senku,
	msg: Message,
	orig: Message,
): Promise<UserModelMessage | AssistantModelMessage> {
	if (msg.author.equals(bot.self)) return assistant(msg.content);

	const replied_msg =
		msg.reference?.type === MessageReferenceType.Default && msg.reference.messageId
			? await msg.channel.messages.fetch(msg.reference.messageId)
			: undefined;

	const attachments_ctx = await attachmentContext(msg, msg.id === orig.id);

	const content = JSON.stringify({
		...messageJson(msg),
		...(replied_msg
			? {
					referenced_message: messageJson(replied_msg),
				}
			: {}),
		...(attachments_ctx.length ? { attachments_ctx } : {}),
	});

	return user(content);
}

export async function historyContext(bot: Senku, msg: Message, ctx_msgs: Iterable<Message>) {
	const messages: Array<UserModelMessage | AssistantModelMessage> = [];

	for (const m of ctx_msgs) messages.push(await messageContent(bot, m, msg));
	messages.push(await messageContent(bot, msg, msg));

	return messages;
}

async function attachmentContext(msg: Message, readContents: boolean) {
	const attachments_ctx: Array<{
		url: string;
		filename: string;
		content_type: string;
		kind?: 'text' | 'image';
		text?: string;
		truncated?: boolean;
		error?: string;
	}> = [];

	for (const attachment of msg.attachments.values()) {
		const filename = attachmentFilename({
			url: attachment.url,
			name: attachment.name,
			contentType: attachment.contentType,
			description: attachment.description,
			size: attachment.size,
		});
		const content_type = attachmentContentType({
			url: attachment.url,
			name: attachment.name,
			contentType: attachment.contentType,
			description: attachment.description,
			size: attachment.size,
		});

		if (!readContents) {
			attachments_ctx.push({
				url: attachment.url,
				filename,
				content_type,
			});
			continue;
		}

		const result = await readDiscordAttachment({
			url: attachment.url,
			name: attachment.name,
			contentType: attachment.contentType,
			description: attachment.description,
			size: attachment.size,
		});

		if (result.ok) {
			attachments_ctx.push({
				url: result.url,
				filename: result.filename,
				content_type: result.content_type,
				kind: result.kind,
				text: result.text,
				truncated: result.truncated,
			});
			continue;
		}

		attachments_ctx.push({
			url: result.url,
			filename: result.filename,
			content_type: result.content_type,
			error: result.error,
		});
	}

	return attachments_ctx;
}
