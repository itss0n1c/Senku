import { type Collection, Events, type Message, type SendableChannels, type Snowflake } from '@warsam-e/echo';
import { bot, type Senku } from '$index.ts';
import { MessageStreamer } from '$stream.ts';
import { request } from './ai/index.ts';

export function watcher(bot: Senku) {
	bot.on(Events.MessageCreate, async (msg) => _handle_message(msg, bot));
}

const triggered_channels = new Set<Snowflake>();

async function _handle_message(msg: Message, bot: Senku) {
	if (msg.author.bot || !msg.content) return;

	if (!msg.channel.isSendable()) return;

	const msg_says_name = msg.content.toLocaleLowerCase().includes(bot.self.username.toLowerCase());
	const should_senku_trigger = triggered_channels.has(msg.channelId);
	if (!msg.mentions.has(bot.self) && !msg_says_name && !should_senku_trigger) {
		if (!msg.channel.isDMBased()) return;
	}

	if (should_senku_trigger) triggered_channels.delete(msg.channelId);

	await msg.channel.sendTyping();

	const higher_ctx_channels = ['1320355230264590469', '1394419139996811344']; // sora essp, fire chat
	const is_higher = higher_ctx_channels.includes(msg.channelId);

	const ctx_msgs = await msg.channel.messages.fetch({
		limit: is_higher ? 50 : 10,
		before: msg.id,
	});

	ctx_msgs.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

	const did_respond = await _handle_response(msg, msg.channel, ctx_msgs);
	if (did_respond && !msg.channel.isDMBased() && !should_senku_trigger) triggered_channels.add(msg.channelId);
}

async function _handle_response(msg: Message, channel: SendableChannels, ctx_msgs: Collection<string, Message>) {
	// let res: string | undefined

	const res = await request(msg, ctx_msgs);

	const reply = await channel.send({
		content: bot.thinking,
	});

	const streamer = new MessageStreamer(reply, { interval: 500 });

	streamer.start();

	for await (const chunk of res.textStream) {
		streamer.write(chunk);
	}

	await streamer.finish();

	return true;
}
