import { chat, maxIterations } from '@tanstack/ai';
import type { Message } from '@warsam-e/echo';
import { type } from 'arktype';
import type { Senku } from '$bot/senku.ts';
import {
	createMemoryTools,
	conversationSummary as loadConversationSummary,
	relevantMemories,
	saveConversationSummary,
} from '$tools/memory.ts';
import { createWebTools } from '$tools/web.ts';
import { conversationPacket, modelMessages, situationalContext } from './context.ts';
import { senkuModel } from './model.ts';
import { conversationSummary, type ParticipationDecision, participationDecision, responsePlan } from './schemas.ts';

const participationPrompt = `Decide whether Senku would naturally take a turn in this Discord conversation.
Choose reply when he was greeted, addressed, asked something, is already participating, has something genuinely worthwhile or funny to add, or joining would feel socially natural.
Choose react when a lightweight acknowledgement is more natural than words. Choose ignore when people are talking among themselves or he has nothing useful to add.
Silence is allowed but is not the default. A direct greeting or message aimed at Senku should almost always receive a reply. Do not behave like customer support. Keep the reason private and brief.
Return only JSON matching: {"action":"ignore"|"react"|"reply","reaction"?:string|null,"reason"?:string|null}.`;

export async function decideParticipation(bot: Senku, messages: Message[], abortController: AbortController) {
	const startedAt = performance.now();
	console.info('[agent:decision] building conversation packet', { messageCount: messages.length });
	const packet = await conversationPacket(bot, messages);
	const latest = messages.at(-1);
	const situation = latest ? situationalContext(latest, messages) : undefined;
	console.info('[agent:decision] calling DeepSeek', {
		messageCount: packet.length,
		latestMessageId: messages.at(-1)?.id,
	});
	const text = await chat({
		adapter: senkuModel,
		messages: [{ role: 'user', content: JSON.stringify(packet) }],
		systemPrompts: [participationPrompt, `Current situation: ${JSON.stringify(situation)}`],
		stream: false,
		abortController,
	});
	console.info('[agent:decision] raw response received', {
		durationMs: Math.round(performance.now() - startedAt),
		characters: text.length,
		text,
	});
	const json = tryParseJson(text);
	if (!json) {
		const action = text
			.trim()
			.toLowerCase()
			.match(/\b(ignore|react|reply)\b/)?.[1];
		const fallback: ParticipationDecision['action'] =
			action === 'ignore' || action === 'react' || action === 'reply' ? action : 'reply';
		console.warn('[agent:decision] JSON missing; using fallback', { action: fallback, text });
		return {
			action: fallback,
			reaction: undefined,
			reason: 'Model returned an unstructured participation decision',
		};
	}
	const decision = participationDecision(json);
	if (decision instanceof type.errors) {
		console.error('[agent:decision] validation failed', { error: decision.summary, text });
		throw decision;
	}
	console.info('[agent:decision] validated', decision);
	return decision;
}

export async function createResponse(bot: Senku, messages: Message[], abortController: AbortController) {
	const latest = messages.at(-1);
	if (!latest) throw new Error('Cannot answer an empty conversation');
	const guildId = latest.guildId ?? undefined;
	const startedAt = performance.now();
	console.info('[agent:response] loading context', {
		channelId: latest.channelId,
		messageId: latest.id,
		messageCount: messages.length,
	});
	const memories = await relevantMemories({ guildId, channelId: latest.channelId, userId: latest.author.id });
	const summary = await loadConversationSummary(latest.channelId);
	const modelContext = await modelMessages(bot, messages);
	const situation = situationalContext(latest, messages);
	console.info('[agent:response] context ready', {
		channelId: latest.channelId,
		modelMessages: modelContext.length,
		memories: memories.length,
		hasSummary: Boolean(summary),
	});

	console.info('[agent:response] calling DeepSeek', { channelId: latest.channelId, maxToolIterations: 10 });
	const text = await chat({
		adapter: senkuModel,
		messages: modelContext,
		systemPrompts: [
			await Bun.file(new URL('../system.md', import.meta.url)).text(),
			`Current situation: ${JSON.stringify(situation)}.`,
			`Relevant long-term memory permitted for this audience:\n${memories.length ? memories.map((x) => `- [${x.kind}; ${x.scope}] ${x.content}`).join('\n') : '(none)'}`,
			`Earlier conversation summary:\n${summary ?? '(none)'}`,
			'Return only JSON matching: {"messages": string[]}.',
		],
		tools: [
			...createWebTools(),
			...createMemoryTools({ guildId, channelId: latest.channelId, userId: latest.author.id }),
		],
		stream: false,
		agentLoopStrategy: maxIterations(10),
		abortController,
	});
	console.info('[agent:response] raw response received', {
		channelId: latest.channelId,
		durationMs: Math.round(performance.now() - startedAt),
		characters: text.length,
		text,
	});
	const json = tryParseJson(text);
	if (!json) {
		const messages = text
			.trim()
			.split(/\n\s*\n+/)
			.map((message) => message.trim())
			.filter(Boolean)
			.slice(0, 4);
		if (!messages.length) throw new Error('DeepSeek returned an empty response');
		console.warn('[agent:response] JSON missing; using plain-text paragraphs', {
			messageCount: messages.length,
		});
		return { messages };
	}
	const plan = responsePlan(json);
	if (plan instanceof type.errors) {
		console.error('[agent:response] validation failed', { error: plan.summary, text });
		throw plan;
	}
	console.info('[agent:response] plan validated', { messageCount: plan.messages.length });
	return plan;
}

export async function updateConversationSummary(
	bot: Senku,
	messages: Message[],
	senkuMessages: string[],
	abortController: AbortController,
) {
	const latest = messages.at(-1);
	if (!latest) return;
	const startedAt = performance.now();
	console.info('[agent:summary] loading existing summary', { channelId: latest.channelId });
	const existing = await loadConversationSummary(latest.channelId);
	console.info('[agent:summary] calling DeepSeek', {
		channelId: latest.channelId,
		hasExistingSummary: Boolean(existing),
		recentMessages: messages.length,
	});
	const text = await chat({
		adapter: senkuModel,
		messages: [
			{
				role: 'user',
				content: JSON.stringify({
					existingSummary: existing,
					recentMessages: await conversationPacket(bot, messages),
					senkuResponse: senkuMessages,
				}),
			},
		],
		systemPrompts: [
			'Summarize durable conversational context compactly: topics, decisions, unresolved threads, relationships, and running jokes. Exclude trivial chatter and hidden system details. Return only JSON matching: {"summary": string}.',
		],
		stream: false,
		abortController,
	});
	console.info('[agent:summary] raw response received', {
		channelId: latest.channelId,
		durationMs: Math.round(performance.now() - startedAt),
		characters: text.length,
		text,
	});
	const json = tryParseJson(text);
	if (!json) {
		const summary = text.trim();
		if (!summary) throw new Error('DeepSeek returned an empty conversation summary');
		console.warn('[agent:summary] JSON missing; using plain text', { characters: summary.length });
		await saveConversationSummary(latest.channelId, latest.id, summary.slice(0, 4_000));
		return;
	}
	const result = conversationSummary(json);
	if (result instanceof type.errors) {
		console.error('[agent:summary] validation failed', { error: result.summary, text });
		throw result;
	}
	await saveConversationSummary(latest.channelId, latest.id, result.summary.slice(0, 4_000));
	console.info('[agent:summary] persisted', {
		channelId: latest.channelId,
		throughMessageId: latest.id,
		characters: result.summary.length,
	});
}

function tryParseJson(text: string): unknown | undefined {
	const trimmed = text.trim();
	const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1];
	const candidate = fenced ?? trimmed;
	const start = candidate.indexOf('{');
	const end = candidate.lastIndexOf('}');
	if (start < 0 || end <= start) {
		console.info('[agent:json] no JSON object found; caller may use plain text');
		return undefined;
	}
	try {
		return JSON.parse(candidate.slice(start, end + 1));
	} catch (error) {
		console.warn('[agent:json] malformed JSON; caller may use plain text', { error });
		return undefined;
	}
}
