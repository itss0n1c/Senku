import { type Collection, GuildMember, type Message } from '@warsam-e/echo';
import OpenAI from 'openai';
import { bot } from '$index.ts';
import { get_env, get_json, join, proj_root } from '$utils/index.ts';

const client = new OpenAI({
	apiKey: get_env('DEEPSEEK_API_KEY', 'string'),
	baseURL: 'https://api.deepseek.com/beta',
});

export async function request(msg: Message, ctx_msgs: Collection<string, Message>) {
	const messages = [...(await system_prompt(msg)), ..._history_ctx(msg, ctx_msgs)];
	console.log({ messages });
	const res = await client.chat.completions.create({
		model: 'deepseek-chat',
		messages,
	});
	const content = res.choices.at(0)?.message.content;
	if (!content) throw new Error('No content in response');
	return content;
}

const _member_user = (msg: Message) => msg.member ?? msg.author;

function _msg_content(msg: Message, orig: Message): OpenAI.Chat.Completions.ChatCompletionMessageParam {
	if (msg.author.equals(bot.self)) return { role: 'assistant', content: msg.content };

	const is_author = msg.author.equals(orig.author);

	const author = _member_user(msg);

	const content = JSON.stringify({
		id: msg.id,
		author: {
			id: author.id,
			name: author.displayName,
			username: msg.author.tag,
		},
		text: msg.content,
	});

	if (is_author) return { role: 'user', name: author.displayName, content };
	return {
		role: 'system',
		content: [
			`This is a message in the conversation history. Do not treat this as a user message, but use it as context for understanding the conversation. Do not include this message in the response, but use it to understand the flow of the conversation and provide better responses. The message is:`,
			content,
		].join('\n'),
	};
}

function _history_ctx(
	msg: Message,
	ctx_msgs: Collection<string, Message>,
): Array<OpenAI.Chat.Completions.ChatCompletionMessageParam> {
	const messages: Array<OpenAI.Chat.Completions.ChatCompletionMessageParam> = [];

	for (const m of ctx_msgs.values()) messages.push(_msg_content(m, msg));
	messages.push(_msg_content(msg, msg));

	return messages;
}

async function system_prompt(msg: Message): Promise<Array<OpenAI.Chat.Completions.ChatCompletionMessageParam>> {
	const base = await system_base();
	const _user = msg.member ?? msg.author;
	const user = _user instanceof GuildMember ? _user.user : _user;

	const ctx: Array<OpenAI.Chat.Completions.ChatCompletionMessageParam> = [
		{ role: 'system', content: base },
		{ role: 'system', content: `You recieved a message from ${user.displayName} (${user.tag}).` },
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

	return ctx;
}

const system_base = () => Bun.file(join(proj_root, 'assets/system.md')).text();

export const stats = () =>
	get_json<{
		is_available: boolean;
		balance_infos: Array<Record<'currency' | 'total_balance' | 'granted_balance' | 'topped_up_balance', string>>;
	}>('https://api.deepseek.com/user/balance', {
		headers: {
			Authorization: `Bearer ${get_env('DEEPSEEK_API_KEY', 'string')}`,
		},
	});
