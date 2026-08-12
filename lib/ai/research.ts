import type { Message } from '@warsam-e/echo';
import { generateText, stepCountIs } from 'ai';
import z from 'zod';
import type { Senku } from '$bot/senku.ts';
import { historyContext, messageSystemContext, system } from './context.ts';
import { chatModel } from './model.ts';
import type { HarnessPolicy, RequestMode, StatusUpdate } from './policy.ts';
import { createTools } from './tools/index.ts';

const researchSchema = z.object({
	summary: z.string().describe('Compact answer-oriented summary of what was learned.'),
	findings: z.array(z.string()).max(8).describe('Short factual findings relevant to the user.'),
	sources: z
		.array(
			z.object({
				title: z.string(),
				url: z.string(),
				note: z.string(),
			}),
		)
		.max(8)
		.describe('Useful sources consulted or found.'),
	confidence: z.enum(['low', 'medium', 'high']),
	budget_exhausted: z.boolean().describe('True if the answer may be incomplete due to time or step budget.'),
});

export type ResearchNotes = z.infer<typeof researchSchema>;

export async function research(args: {
	bot: Senku;
	msg: Message;
	ctx_msgs: Iterable<Message>;
	mode: Exclude<RequestMode, 'chat'>;
	policy: HarnessPolicy;
	onStatus?: StatusUpdate;
}): Promise<ResearchNotes> {
	const { bot, ctx_msgs, mode, msg, onStatus, policy } = args;
	const budget = policy.research;
	if (!budget) throw new Error(`No research budget configured for ${mode}`);

	console.log('[ai:research] start', {
		message_id: msg.id,
		channel_id: msg.channelId,
		mode,
		steps: budget.steps,
		total_ms: budget.totalMs,
		step_ms: budget.stepMs,
		search_results: budget.searchResults,
		page_chars: budget.pageChars,
	});
	await onStatus?.('checking');

	try {
		const { finishReason, steps, text, usage } = await generateText({
			model: chatModel,
			system: [
				system(
					[
						'You are Senku doing private research before a Discord reply.',
						'Use discordSearchMessages when the user asks about prior Discord/server conversation or server memory.',
						'Use discordReadAttachment to read Discord attachment URLs returned by discordSearchMessages or present in the conversation context. Prefer this over openWebpage for Discord CDN links.',
						'Use webSearch for all search engine queries. Never open Google, Bing, DuckDuckGo, GitHub search, or other search-result pages with openWebpage.',
						'Use openWebpage only for specific resource pages from webSearch results or already-known canonical pages.',
						'Gather enough to answer, then stop.',
						'Do not write the final Discord message. Produce compact notes only.',
						'Prefer source quality over quantity. If information is thin, say so in the notes.',
						'Keep source URLs exactly as tools returned them. For Discord messages, preserve the full message jump link when available.',
						'Return valid JSON only. No markdown. No prose outside JSON.',
						'JSON shape: {"summary": string, "findings": string[], "sources": [{"title": string, "url": string, "note": string}], "confidence": "low" | "medium" | "high", "budget_exhausted": boolean}.',
						`Mode: ${mode}. Research target: about ${budget.targetChars} chars of notes.`,
					].join(' '),
				),
				...(await messageSystemContext(bot, msg)),
			],
			messages: await historyContext(bot, msg, ctx_msgs),
			tools: createTools(bot, {
				msg,
				onStatus,
				searchResults: budget.searchResults,
				pageChars: budget.pageChars,
			}),
			stopWhen: stepCountIs(budget.steps),
			timeout: { totalMs: budget.totalMs, stepMs: budget.stepMs },
			maxOutputTokens: budget.maxOutputTokens,
		});
		const parsedOutput = parseResearchNotes(text);
		const toolOutput = notesFromToolResults(steps);
		const output = parsedOutput ? mergeResearchNotes(parsedOutput, toolOutput) : toolOutput;
		if (!output) throw new Error('Research response did not contain JSON or usable tool results.');
		const budget_exhausted = output.budget_exhausted || steps.length >= budget.steps || finishReason === 'length';

		console.log('[ai:research] complete', {
			message_id: msg.id,
			channel_id: msg.channelId,
			mode,
			step_count: steps.length,
			finish_reason: finishReason,
			text_chars: text.length,
			usage,
			findings: output.findings.length,
			sources: output.sources.length,
			confidence: output.confidence,
			budget_exhausted,
		});

		return {
			...output,
			budget_exhausted,
		};
	} catch (error) {
		console.warn('[ai:research] failed', {
			error,
			message_id: msg.id,
			channel_id: msg.channelId,
			mode,
		});
		return {
			summary: 'Research failed before enough notes could be gathered.',
			findings: [],
			sources: [],
			confidence: 'low',
			budget_exhausted: true,
		};
	}
}

function parseResearchNotes(text: string): ResearchNotes | undefined {
	const json = extractJson(text);
	if (!json) return undefined;
	const parsed = researchSchema.safeParse(JSON.parse(json));
	if (!parsed.success) throw parsed.error;
	return parsed.data;
}

function extractJson(text: string) {
	const trimmed = text.trim();
	if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;

	const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
	if (fenced?.startsWith('{') && fenced.endsWith('}')) return fenced;

	const start = trimmed.indexOf('{');
	const end = trimmed.lastIndexOf('}');
	if (start >= 0 && end > start) return trimmed.slice(start, end + 1);

	return undefined;
}

function mergeResearchNotes(primary: ResearchNotes, secondary?: ResearchNotes): ResearchNotes {
	if (!secondary) return primary;

	return {
		summary: primary.summary || secondary.summary,
		findings: [...new Set([...primary.findings, ...secondary.findings])].slice(0, 8),
		sources: uniqueByUrl([...primary.sources, ...secondary.sources]).slice(0, 8),
		confidence: primary.confidence,
		budget_exhausted: primary.budget_exhausted || secondary.budget_exhausted,
	};
}

function notesFromToolResults(steps: Array<{ toolResults: Array<{ toolName: string; output?: unknown }> }>) {
	const findings: string[] = [];
	const sources: ResearchNotes['sources'] = [];

	for (const step of steps) {
		for (const result of step.toolResults) {
			if (result.toolName === 'webSearch' && Array.isArray(result.output)) {
				for (const item of result.output) addSearchResult(item, findings, sources);
			}

			if (result.toolName === 'openWebpage') addPageResult(result.output, findings, sources);

			if (result.toolName === 'discordSearchMessages') addDiscordSearchResult(result.output, findings, sources);

			if (result.toolName === 'discordReadAttachment') addAttachmentResult(result.output, findings, sources);
		}
	}

	const uniqueSources = uniqueByUrl(sources).slice(0, 8);
	const uniqueFindings = [...new Set(findings)].slice(0, 8);

	if (!uniqueSources.length && !uniqueFindings.length) return undefined;

	return {
		summary: uniqueFindings.length
			? uniqueFindings.join(' ')
			: `Found ${uniqueSources.length} potentially relevant source${uniqueSources.length === 1 ? '' : 's'}, but little extractable detail.`,
		findings: uniqueFindings,
		sources: uniqueSources,
		confidence: uniqueFindings.length >= 2 ? 'medium' : 'low',
		budget_exhausted: true,
	} satisfies ResearchNotes;
}

function addSearchResult(item: unknown, findings: string[], sources: ResearchNotes['sources']) {
	if (!item || typeof item !== 'object') return;
	const result = item as { title?: unknown; url?: unknown; snippet?: unknown };
	if (typeof result.url !== 'string') return;

	const title = typeof result.title === 'string' && result.title ? result.title : result.url;
	const note = typeof result.snippet === 'string' && result.snippet ? result.snippet.slice(0, 280) : 'Search result.';

	sources.push({ title, url: result.url, note });
	if (note !== 'Search result.') findings.push(`${title}: ${note}`);
}

function addPageResult(output: unknown, findings: string[], sources: ResearchNotes['sources']) {
	if (!output || typeof output !== 'object') return;
	const page = output as { title?: unknown; url?: unknown; text?: unknown };
	if (typeof page.url !== 'string') return;

	const title = typeof page.title === 'string' && page.title ? page.title : page.url;
	const text = typeof page.text === 'string' ? page.text.trim() : '';
	const note = text ? text.slice(0, 280) : 'Page opened but had little extractable text.';

	sources.push({ title, url: page.url, note });
	if (text) findings.push(`${title}: ${note}`);
}

function addDiscordSearchResult(output: unknown, findings: string[], sources: ResearchNotes['sources']) {
	if (!output || typeof output !== 'object') return;
	const search = output as { ok?: unknown; results?: unknown };
	if (search.ok !== true || !Array.isArray(search.results)) return;

	for (const item of search.results) {
		if (!item || typeof item !== 'object') continue;
		const result = item as {
			id?: unknown;
			url?: unknown;
			guild_id?: unknown;
			channel_id?: unknown;
			channel_mention?: unknown;
			timestamp?: unknown;
			content?: unknown;
			author?: { username?: unknown; name?: unknown; mention?: unknown };
		};
		if (typeof result.id !== 'string' || typeof result.content !== 'string') continue;

		const author =
			typeof result.author?.mention === 'string'
				? result.author.mention
				: typeof result.author?.username === 'string'
					? result.author.username
					: typeof result.author?.name === 'string'
						? result.author.name
						: 'unknown author';
		const channel =
			typeof result.channel_mention === 'string'
				? ` in ${result.channel_mention}`
				: typeof result.channel_id === 'string'
					? ` in channel ${result.channel_id}`
					: '';
		const url =
			typeof result.url === 'string'
				? result.url
				: typeof result.guild_id === 'string' && typeof result.channel_id === 'string'
					? `https://discord.com/channels/${result.guild_id}/${result.channel_id}/${result.id}`
					: undefined;
		const title = `Discord message ${result.id}`;
		const note = `${author}${channel}${typeof result.timestamp === 'string' ? ` at ${result.timestamp}` : ''}: ${result.content.slice(0, 280)}`;

		if (url) sources.push({ title, url, note });
		findings.push(note);
	}
}

function addAttachmentResult(output: unknown, findings: string[], sources: ResearchNotes['sources']) {
	if (!output || typeof output !== 'object') return;
	const attachment = output as {
		ok?: unknown;
		url?: unknown;
		filename?: unknown;
		kind?: unknown;
		text?: unknown;
		error?: unknown;
	};
	if (typeof attachment.url !== 'string') return;

	const filename =
		typeof attachment.filename === 'string' && attachment.filename ? attachment.filename : attachment.url;
	const title = `Discord attachment ${filename}`;

	if (attachment.ok !== true) {
		const error = typeof attachment.error === 'string' ? attachment.error : 'Attachment could not be read.';
		sources.push({ title, url: attachment.url, note: error });
		return;
	}

	const text = typeof attachment.text === 'string' ? attachment.text.trim() : '';
	const kind = typeof attachment.kind === 'string' ? attachment.kind : 'attachment';
	const note = text
		? `${kind}: ${text.slice(0, 280)}`
		: `${kind} attachment opened but had little extractable content.`;

	sources.push({ title, url: attachment.url, note });
	if (text) findings.push(`${title}: ${note}`);
}

function uniqueByUrl(sources: ResearchNotes['sources']) {
	const seen = new Set<string>();
	return sources.filter((source) => {
		if (seen.has(source.url)) return false;
		seen.add(source.url);
		return true;
	});
}
