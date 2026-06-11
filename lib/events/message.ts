import { type Collection, Events, type Message, type SendableChannels, type Snowflake } from '@warsam-e/echo';
import { request } from '$ai/request.ts';
import type { Senku } from '$bot/senku.ts';
import { MessageStreamer } from '$stream.ts';

export function registerMessageEvents(bot: Senku) {
	bot.on(Events.MessageCreate, async (msg) => handleMessage(msg, bot));
}

const triggered_channels = new Set<Snowflake>();

async function handleMessage(msg: Message, bot: Senku) {
	if (msg.author.bot || !msg.content) return;

	if (!msg.channel.isSendable()) return;

	const msg_says_name = msg.content.toLocaleLowerCase().includes(bot.self.username.toLowerCase());
	const should_senku_trigger = triggered_channels.has(msg.channelId);
	if (!msg.mentions.has(bot.self) && !msg_says_name && !should_senku_trigger) {
		if (!msg.channel.isDMBased()) return;
	}

	if (should_senku_trigger) triggered_channels.delete(msg.channelId);

	await msg.channel.sendTyping();

	const ctx_msgs = await msg.channel.messages.fetch({
		limit: await bot.settings.channel_ctx_limit(msg.channelId),
		before: msg.id,
	});

	ctx_msgs.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

	const did_respond = await handleResponse(bot, msg, msg.channel, ctx_msgs);
	if (did_respond && !msg.channel.isDMBased() && !should_senku_trigger) triggered_channels.add(msg.channelId);
}

async function handleResponse(
	bot: Senku,
	msg: Message,
	channel: SendableChannels,
	ctx_msgs: Collection<string, Message>,
) {
	const res = await request(bot, msg, ctx_msgs);

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
