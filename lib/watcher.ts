import { AttachmentBuilder, Events, type Message } from '@warsam-e/echo';
import type { Senku } from '$index.ts';
import { request } from './ai/index.ts';

export function watcher(bot: Senku) {
	bot.on(Events.MessageCreate, async (msg) => _handle_message(msg, bot));
}

async function _handle_message(msg: Message, bot: Senku) {
	if (msg.author.bot || !msg.content) return;

	if (!msg.channel.isSendable()) return;

	const msg_says_name = msg.content.toLocaleLowerCase().includes(bot.self.username.toLowerCase());
	if (!msg.mentions.has(bot.self) && !msg_says_name) {
		if (!msg.channel.isDMBased()) return;
	}

	await msg.channel.sendTyping();

	const higher_ctx_channels = ['1320355230264590469', '1394419139996811344']; // sora essp, fire chat
	const is_higher = higher_ctx_channels.includes(msg.channelId);

	const ctx_msgs = await msg.channel.messages.fetch({
		limit: is_higher ? 50 : 10,
		before: msg.id,
	});

	ctx_msgs.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

	let res: string | undefined;

	try {
		res = await request(msg, ctx_msgs);
	} catch (e) {
		console.error('Error processing message:', e);
		return msg.reply({
			content: 'An error occurred while processing your message. Please try again later.',
			allowedMentions: { repliedUser: false },
		});
	}
	if (!res)
		return msg.reply({
			content: "Sorry, I couldn't generate a response for your message.",
			allowedMentions: { repliedUser: false },
		});
	if (res.length > 2000) {
		console.log(res);
		const file = new AttachmentBuilder(Buffer.from(res), { name: `${msg.id}_response.txt` });
		return msg.reply({
			content: 'the response is too long. here is a file containing the full message',
			allowedMentions: { repliedUser: false },
			files: [file],
		});
	}
	await msg.channel.send({
		content: res,
	});
}
