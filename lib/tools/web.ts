import { toolDefinition } from '@tanstack/ai';
import { type } from 'arktype';
import { env } from '$utils/index.ts';

const searchInput = type({ query: 'string', 'limit?': 'number.integer >= 1' });
const readInput = type({ url: 'string' });

type SearxResponse = {
	results?: Array<{ title?: string; url?: string; content?: string; engine?: string }>;
};

const searchWeb = toolDefinition({
	name: 'search_web',
	description: 'Search the web with SearXNG for current or externally verifiable information.',
	inputSchema: searchInput,
}).server(async ({ query, limit = 5 }) => {
	const startedAt = performance.now();
	console.info('[tool:search_web] started', { query, limit });
	const url = new URL('/search', env.SEARXNG_BASE_URL);
	url.searchParams.set('q', query);
	url.searchParams.set('format', 'json');
	url.searchParams.set('language', 'en');
	url.searchParams.set('safesearch', '1');
	const response = await fetch(url);
	if (!response.ok) throw new Error(`SearXNG returned ${response.status}`);
	const data = (await response.json()) as SearxResponse;
	const results = (data.results ?? []).slice(0, Math.min(limit, 10)).map((result) => ({
		title: result.title ?? 'Untitled',
		url: result.url,
		snippet: result.content,
		engine: result.engine,
	}));
	console.info('[tool:search_web] completed', {
		query,
		results: results.length,
		durationMs: Math.round(performance.now() - startedAt),
	});
	return results;
});

const readUrl = toolDefinition({
	name: 'read_url',
	description: 'Read a specific HTTP(S) page returned by search_web. Use after search, not as a search engine.',
	inputSchema: readInput,
}).server(async ({ url }) => {
	const startedAt = performance.now();
	console.info('[tool:read_url] started', { url });
	const parsed = new URL(url);
	if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Only HTTP(S) URLs are supported');
	const response = await fetch(parsed, {
		signal: AbortSignal.timeout(12_000),
		headers: { Accept: 'text/html,text/plain', 'User-Agent': 'Senku/1.0' },
	});
	if (!response.ok) throw new Error(`Page returned ${response.status}`);
	const contentType = response.headers.get('content-type') ?? '';
	if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
		throw new Error(`Unsupported content type: ${contentType}`);
	}
	const html = await response.text();
	const title = html
		.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
		?.replace(/\s+/g, ' ')
		.trim();
	const text = html
		.replace(/<script[\s\S]*?<\/script>/gi, ' ')
		.replace(/<style[\s\S]*?<\/style>/gi, ' ')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/\s+/g, ' ')
		.trim();
	const result = { url: parsed.toString(), title, text: text.slice(0, 12_000), truncated: text.length > 12_000 };
	console.info('[tool:read_url] completed', {
		url,
		characters: result.text.length,
		truncated: result.truncated,
		durationMs: Math.round(performance.now() - startedAt),
	});
	return result;
});

export const createWebTools = () => [searchWeb, readUrl];
