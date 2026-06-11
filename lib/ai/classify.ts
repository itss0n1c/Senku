import type { Message } from '@warsam-e/echo';
import { generateText, type UserModelMessage } from 'ai';
import type { Senku } from '$bot/senku.ts';
import { chatModel } from './model.ts';
import type { RequestMode } from './policy.ts';

const CLASSIFIER_MAX_OUTPUT_TOKENS = 256;

export async function classifyRequest(bot: Senku, msg: Message, ctx_msgs: Iterable<Message>): Promise<RequestMode> {
	const packet = classificationPacket(bot, msg, ctx_msgs);
	console.log('[ai:classify] start', {
		message_id: msg.id,
		channel_id: msg.channelId,
		current_chars: msg.content.length,
		recent_count: packet.recent_messages.length,
	});

	try {
		const first = await runClassifier('primary', packet);
		const firstMode = parseMode(first.text);
		logClassifierResult(msg, 'primary', first, firstMode);
		if (firstMode) return firstMode;

		const retry = await runClassifier('retry', retryPacket(packet));
		const retryMode = parseMode(retry.text);
		logClassifierResult(msg, 'retry', retry, retryMode);
		if (retryMode) return retryMode;

		console.warn('[ai:classify] invalid empty result after retry; falling back to chat', {
			message_id: msg.id,
			channel_id: msg.channelId,
			primary_raw: first.text.trim(),
			retry_raw: retry.text.trim(),
		});
		return 'chat';
	} catch (error) {
		console.warn('[ai:classify] falling back to chat', {
			error,
			message_id: msg.id,
			channel_id: msg.channelId,
		});
		return 'chat';
	}
}

async function runClassifier(attempt: 'primary' | 'retry', packet: unknown) {
	return await generateText({
		model: chatModel,
		messages: [user(classifierPrompt(attempt, packet))],
		timeout: { totalMs: 10_000, stepMs: 10_000 },
		maxOutputTokens: CLASSIFIER_MAX_OUTPUT_TOKENS,
	});
}

function classifierPrompt(attempt: 'primary' | 'retry', packet: unknown) {
	return [
		'Classify this Discord message for Senku.',
		'Return exactly one of these mode tokens and nothing else: chat, lookup, deep_lookup.',
		'Classify intent, not your ability to answer from memory.',
		'chat: casual conversation, banter, opinions, jokes, simple explanations, or anything that should be answered directly without external lookup.',
		'lookup: the user wants external/web information, asks to search/check/look something up, or asks a factual question where web lookup would materially improve accuracy.',
		'deep_lookup: the user wants research, sources, latest/current/recent info, comparisons, investigation, or a multi-part factual answer.',
		'If the user explicitly wants something searched online, choose lookup or deep_lookup.',
		`Attempt: ${attempt}.`,
		`Input JSON: ${JSON.stringify(packet)}`,
	].join('\n');
}

function parseMode(text: string): RequestMode | undefined {
	const normalized = text.trim().toLowerCase();
	if (normalized === 'chat' || normalized === 'lookup' || normalized === 'deep_lookup') return normalized;

	const match = normalized.match(/\b(deep_lookup|lookup|chat)\b/);
	if (match?.[1] === 'chat' || match?.[1] === 'lookup' || match?.[1] === 'deep_lookup') return match[1];
}

function logClassifierResult(
	msg: Message,
	attempt: 'primary' | 'retry',
	result: Awaited<ReturnType<typeof runClassifier>>,
	selected: RequestMode | undefined,
) {
	console.log('[ai:classify] result', {
		message_id: msg.id,
		channel_id: msg.channelId,
		attempt,
		raw: result.text.trim(),
		text_chars: result.text.length,
		finish_reason: result.finishReason,
		selected,
		usage: result.usage,
	});
}

const user = (content: string): UserModelMessage => ({ role: 'user', content });

function classificationPacket(bot: Senku, msg: Message, ctx_msgs: Iterable<Message>) {
	const recent_messages = [...ctx_msgs].slice(-6).map((m) => ({
		author: m.author.equals(bot.self) ? bot.self.username : m.author.tag,
		text: m.content.slice(0, 500),
	}));

	return {
		bot_name: bot.self.username,
		current_message: {
			author: msg.author.tag,
			text: msg.content.slice(0, 1_000),
		},
		recent_messages,
	};
}

function retryPacket(packet: ReturnType<typeof classificationPacket>) {
	return {
		bot_name: packet.bot_name,
		current_message_text: packet.current_message.text,
		recent_messages: packet.recent_messages.slice(-2),
	};
}
