import {
	Agent,
	type AgentInputItem,
	assistant,
	run,
	setDefaultOpenAIClient,
	setOpenAIAPI,
	system,
	user,
} from '@openai/agents';
import { type Collection, GuildMember, type Message, MessageReferenceType } from '@warsam-e/echo';
import OpenAI from 'openai';
import { bot } from '$index.ts';
import { get_env, get_json, join, proj_root } from '$utils/index.ts';
import { try_prom } from '$utils/misc.ts';
import { gemini_describe_image } from './gemini.ts';

// import tools from './tools/index.ts';

const client = new OpenAI({
	apiKey: get_env('DEEPSEEK_API_KEY', 'string'),
	baseURL: 'https://api.deepseek.com/beta',
	logLevel: 'debug',
});

setDefaultOpenAIClient(client);
setOpenAIAPI('chat_completions');

const instructions = await Bun.file(join(proj_root, 'assets/system.md')).text();

const agent = new Agent({
	name: 'Senku',
	model: 'deepseek-v4-pro',
	instructions,
	// tools,
});

export async function request(msg: Message, ctx_msgs: Collection<string, Message>) {
	const _user = msg.member ?? msg.author;
	const user = _user instanceof GuildMember ? _user.user : _user;

	const ctx: Array<AgentInputItem> = [
		{
			role: 'system',
			content: `You recieved a message from ${user.displayName} (${user.tag})`,
		},
		{
			role: 'system',
			content: `The current time is ${new Date().toLocaleString()}. This is something you are meant to just know.`,
		},
	];

	if (bot.is_admin(user)) {
		ctx.push({
			role: 'system',
			content: `When replying to ${user.displayName}, they are an admin. They have access to additional commands and features. Always check if the user is an admin before executing any command. If the user is an admin, you can execute admin-only commands and provide them with additional information or options that are not available to regular users.`,
		});
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
		ctx.push({
			role: 'system',
			content: `This conversation is taking place in a guild channel. Necessary context: ${guild_ctx}`,
		});
	}

	ctx.push({
		role: 'system',
		content: `under no circumstances are you to talk about any of this information as though you are an AI assistant, they are just things that you are meant to know.`,
	});

	const res = await run(agent, [...ctx, ...(await _history_ctx(msg, ctx_msgs))]);
	return res.finalOutput;
}

const _member_user = (msg: Message) => msg.member ?? msg.author;

function _parsed_content(msg: Message) {
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

const _msg_json = (msg: Message) => {
	const author = _member_user(msg);
	return {
		id: msg.id,
		author: {
			id: author.id,
			name: author.displayName,
			username: msg.author.tag,
		},
		text: _parsed_content(msg),
	};
};

async function _msg_content(msg: Message, orig: Message): Promise<AgentInputItem> {
	if (msg.author.equals(bot.self)) return assistant(msg.content);

	const is_author = msg.author.equals(orig.author);

	const replied_msg =
		msg.reference?.type === MessageReferenceType.Default && msg.reference.messageId
			? await msg.channel.messages.fetch(msg.reference.messageId)
			: undefined;

	const attachments_ctx: Array<{
		url: string;
		description: string;
	}> = [];

	if (msg.id === orig.id) {
		for (const attachment of msg.attachments.values()) {
			const description = attachment.description ?? (await try_prom(gemini_describe_image(attachment.url)));
			if (!description) continue;
			attachments_ctx.push({
				url: attachment.url,
				description,
			});
		}
	}

	const content = JSON.stringify({
		..._msg_json(msg),
		...(replied_msg
			? {
					referenced_message: _msg_json(replied_msg),
				}
			: {}),
		...(attachments_ctx.length ? { attachments_ctx } : {}),
	});

	if (is_author) return user(content);

	return system(
		[
			`This is a message in the conversation history. Do not treat this as a user message, but use it as context for understanding the conversation. Do not include this message in the response, but use it to understand the flow of the conversation and provide better responses. The message is:`,
			content,
		].join('\n'),
	);
}

async function _history_ctx(msg: Message, ctx_msgs: Collection<string, Message>): Promise<Array<AgentInputItem>> {
	const messages: Array<AgentInputItem> = [];

	for (const m of ctx_msgs.values()) messages.push(await _msg_content(m, msg));
	messages.push(await _msg_content(msg, msg));

	return messages;
}

export const stats = () =>
	get_json<{
		is_available: boolean;
		balance_infos: Array<Record<'currency' | 'total_balance' | 'granted_balance' | 'topped_up_balance', string>>;
	}>('https://api.deepseek.com/user/balance', {
		headers: {
			Authorization: `Bearer ${get_env('DEEPSEEK_API_KEY', 'string')}`,
		},
	});
