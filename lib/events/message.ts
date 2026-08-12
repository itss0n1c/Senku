import { type Collection, Events, type Message, type SendableChannels, type Snowflake } from '@warsam-e/echo';
import type { HarnessStatus } from '$ai/policy.ts';
import { request } from '$ai/request.ts';
import type { Senku } from '$bot/senku.ts';
import { MessageStreamer } from '$stream.ts';

export function registerMessageEvents(bot: Senku) {
	bot.on(Events.MessageCreate, async (msg) => {
		try {
			await handleMessage(msg, bot);
		} catch (error) {
			console.error('[message] unhandled error', {
				error,
				message_id: msg.id,
				channel_id: msg.channelId,
				author_id: msg.author.id,
			});

			if (msg.channel.isSendable()) {
				await msg.channel.send({
					content: 'I hit an internal error while trying to answer that.',
				});
			}
		}
	});
}

const triggered_channels = new Set<Snowflake>();

async function handleMessage(msg: Message, bot: Senku) {
	if (msg.author.bot || (!msg.content && !msg.attachments.size)) {
		console.log('[message] ignored', {
			message_id: msg.id,
			channel_id: msg.channelId,
			reason: msg.author.bot ? 'bot_author' : 'empty_content',
		});
		return;
	}

	if (!msg.channel.isSendable()) {
		console.log('[message] ignored', {
			message_id: msg.id,
			channel_id: msg.channelId,
			reason: 'not_sendable',
		});
		return;
	}

	const msg_says_name = msg.content.toLocaleLowerCase().includes(bot.self.username.toLowerCase());
	const should_senku_trigger = triggered_channels.has(msg.channelId);
	const mentioned = msg.mentions.has(bot.self);
	const has_attachments = msg.attachments.size > 0;

	console.log('[message] received', {
		message_id: msg.id,
		channel_id: msg.channelId,
		author_id: msg.author.id,
		is_dm: msg.channel.isDMBased(),
		mentioned,
		msg_says_name,
		should_senku_trigger,
		has_attachments,
		content_chars: msg.content.length,
		attachment_count: msg.attachments.size,
	});

	if (!mentioned && !msg_says_name && !should_senku_trigger) {
		if (!msg.channel.isDMBased()) {
			console.log('[message] ignored', {
				message_id: msg.id,
				channel_id: msg.channelId,
				reason: 'not_triggered',
			});
			return;
		}
	}

	if (should_senku_trigger) {
		console.log('[message] consuming follow-up trigger', {
			message_id: msg.id,
			channel_id: msg.channelId,
		});
		triggered_channels.delete(msg.channelId);
	}

	await msg.channel.sendTyping();
	console.log('[message] typing sent', {
		message_id: msg.id,
		channel_id: msg.channelId,
	});

	const ctx_limit = await bot.settings.channel_ctx_limit(msg.channelId);
	const ctx_msgs = await msg.channel.messages.fetch({
		limit: ctx_limit,
		before: msg.id,
	});

	ctx_msgs.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
	console.log('[message] context fetched', {
		message_id: msg.id,
		channel_id: msg.channelId,
		ctx_limit,
		ctx_count: ctx_msgs.size,
	});

	const did_respond = await handleResponse(bot, msg, msg.channel, ctx_msgs);
	if (did_respond && !msg.channel.isDMBased() && !should_senku_trigger) {
		triggered_channels.add(msg.channelId);
		console.log('[message] follow-up trigger armed', {
			message_id: msg.id,
			channel_id: msg.channelId,
		});
	}
}

async function handleResponse(
	bot: Senku,
	msg: Message,
	channel: SendableChannels,
	ctx_msgs: Collection<string, Message>,
) {
	const reply = await channel.send({
		content: statusContent(bot, 'thinking'),
	});
	console.log('[message] reply placeholder sent', {
		message_id: msg.id,
		reply_id: reply.id,
		channel_id: msg.channelId,
	});

	const setStatus = async (status: HarnessStatus) => {
		try {
			await reply.edit({ content: statusContent(bot, status) });
			console.log('[message] status updated', {
				message_id: msg.id,
				reply_id: reply.id,
				channel_id: msg.channelId,
				status,
			});
		} catch {
			console.warn('[message] status update failed', {
				message_id: msg.id,
				reply_id: reply.id,
				channel_id: msg.channelId,
				status,
			});
		}
	};

	const res = await request({
		bot,
		msg,
		ctx_msgs,
		onStatus: setStatus,
	}).catch(async (error) => {
		console.error('[message] request failed before streaming', {
			error,
			message_id: msg.id,
			channel_id: msg.channelId,
		});

		await reply.edit({
			content: 'I hit an internal error while trying to answer that.',
		});

		return undefined;
	});

	if (!res) return false;
	console.log('[message] request ready to stream', {
		message_id: msg.id,
		reply_id: reply.id,
		channel_id: msg.channelId,
		mode: res.mode,
	});

	const streamer = new MessageStreamer(reply, { interval: 500 });

	streamer.start();
	console.log('[message] stream started', {
		message_id: msg.id,
		reply_id: reply.id,
		channel_id: msg.channelId,
		mode: res.mode,
	});

	let streamFailed = false;
	let chunkCount = 0;
	try {
		for await (const chunk of res.stream.textStream) {
			chunkCount++;
			streamer.write(chunk);
			if (chunkCount === 1 || chunkCount % 25 === 0) {
				console.log('[message] stream chunk', {
					message_id: msg.id,
					reply_id: reply.id,
					channel_id: msg.channelId,
					mode: res.mode,
					chunk_count: chunkCount,
					content_chars: streamer.content.length,
				});
			}
		}
	} catch (error) {
		streamFailed = true;
		console.error('[message] response stream failed', {
			error,
			mode: res.mode,
			message_id: msg.id,
			channel_id: msg.channelId,
		});
	} finally {
		if (streamFailed) {
			streamer.write(
				streamer.content
					? '\n\n[Something interrupted me mid-answer.]'
					: 'I got interrupted while writing the answer.',
			);
		}

		await streamer.finish();
		console.log('[message] stream finished', {
			message_id: msg.id,
			reply_id: reply.id,
			channel_id: msg.channelId,
			mode: res.mode,
			chunk_count: chunkCount,
			content_chars: streamer.content.length,
			stream_failed: streamFailed,
		});
	}

	return true;
}

function statusContent(bot: Senku, status: HarnessStatus) {
	const phrase =
		status === 'searching'
			? 'searching'
			: status === 'reading'
				? 'reading'
				: status === 'checking'
					? 'checking sources'
					: status === 'answering'
						? 'answering'
						: 'thinking';

	return bot.thinking.replace('thinking...', `${phrase}...`);
}
