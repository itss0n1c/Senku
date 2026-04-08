import { Events, type Message } from '@warsam-e/echo';
import type { Senku } from '$index.ts';
import { request } from './ai/index.ts';

export function watcher(bot: Senku) {
	bot.on(Events.MessageCreate, async (msg) => _handle_message(msg, bot));
}

async function _handle_message(msg: Message, bot: Senku) {
	if (msg.author.bot || !msg.content) return;

	if (!msg.channel.isSendable()) return;

	if (!msg.mentions.has(bot.self)) {
		if (!msg.channel.isDMBased()) return;
	}

	await msg.channel.sendTyping();

	const ctx_msgs = await msg.channel.messages.fetch({ limit: 10, before: msg.id });

	ctx_msgs.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

	let res: string;

	try {
		res = await request(msg, ctx_msgs);
	} catch (e) {
		console.error('Error processing message:', e);
		return msg.reply({
			content: 'An error occurred while processing your message. Please try again later.',
			allowedMentions: { repliedUser: false },
		});
	}

	await msg.channel.send({
		content: res,
	});
}
