import { tool } from 'ai';
import { SearxngService } from 'searxng';
import z from 'zod';
import { env } from '$utils/index.ts';
import type { StatusUpdate } from '../policy.ts';

type WebToolOptions = {
	onStatus?: StatusUpdate;
	searchResults?: number;
	pageChars?: number;
};

const service = new SearxngService({
	baseURL: env.SEARXNG_BASE_URL,
	defaultSearchParams: {
		format: 'json',
		lang: 'en',
		safesearch: 1,
	},
	defaultRequestHeaders: {
		'Content-Type': 'application/json',
	},
});

export const searxng = (query: string, limit = 5) =>
	service.search(query).then((x) =>
		x.results.slice(0, limit).map((result) => ({
			title: result.title,
			url: result.url,
			snippet: result.content,
			engine: result.engine,
		})),
	);

export function createWebTools(options: WebToolOptions = {}) {
	const searchResults = options.searchResults ?? 5;
	const pageChars = options.pageChars ?? 6_000;

	const webSearch = tool({
		description:
			'Search the web for information, websites, documentation, people, companies, news, and recent events.',
		inputSchema: z.object({
			query: z.string().describe('The search query. Be specific to get better results.'),
		}),

		execute: async ({ query }) => {
			console.log('[ai:tool:webSearch] start', {
				query,
				limit: searchResults,
			});
			await options.onStatus?.('searching');
			const results = await searxng(query, searchResults);
			console.log('[ai:tool:webSearch] complete', {
				query,
				result_count: results.length,
				urls: results.map((result) => result.url),
			});
			return results;
		},
	});

	const openWebpage = tool({
		description:
			'Open a specific resource page URL and extract compact readable text. Do not use this for search engine result pages; use webSearch for searching.',
		inputSchema: z.object({
			url: z.string().describe('The webpage URL to open.'),
		}),
		execute: async ({ url }) => {
			console.log('[ai:tool:openWebpage] start', {
				url,
				max_chars: pageChars,
			});
			await options.onStatus?.('reading');
			const page = await fetchPageText(url, pageChars);
			console.log('[ai:tool:openWebpage] complete', {
				url,
				title: page.title,
				text_chars: page.text.length,
				truncated: page.truncated,
			});

			return {
				url,
				...page,
				note: `Extracted compact webpage text, truncated to ${pageChars.toLocaleString()} chars.`,
			};
		},
	});

	return { webSearch, openWebpage };
}

async function fetchPageText(url: string, maxChars: number) {
	const parsed = new URL(url);

	if (!['http:', 'https:'].includes(parsed.protocol)) {
		throw new Error('Only http/https URLs are allowed.');
	}

	assertNotSearchPage(parsed);

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 10_000);

	try {
		const res = await fetch(parsed.toString(), {
			signal: controller.signal,
			headers: {
				'User-Agent': 'senku-discord-bot/1.0',
				Accept: 'text/html, text/plain',
			},
			redirect: 'follow',
		});

		if (!res.ok) {
			throw new Error(`Page fetch failed: ${res.status} ${res.statusText}`);
		}

		const contentType = res.headers.get('content-type')?.split(';')[0] ?? 'unknown';
		if (!['text/html', 'text/plain', 'application/xhtml+xml'].includes(contentType)) {
			throw new Error(`Unsupported content type: ${contentType}`);
		}

		const html = await res.text();
		const title = html
			.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
			?.replace(/\s+/g, ' ')
			.trim();
		const text = html
			.replace(/<script[\s\S]*?<\/script>/gi, ' ')
			.replace(/<style[\s\S]*?<\/style>/gi, ' ')
			.replace(/<[^>]+>/g, ' ')
			.replace(/\s+/g, ' ')
			.trim();

		return {
			title,
			text: text.slice(0, maxChars),
			truncated: text.length > maxChars,
		};
	} finally {
		clearTimeout(timeout);
	}
}

function assertNotSearchPage(url: URL) {
	const host = url.hostname.replace(/^www\./, '').toLocaleLowerCase();
	const path = url.pathname.toLocaleLowerCase();

	const isSearchPage =
		(host === 'google.com' && path.startsWith('/search')) ||
		(host === 'bing.com' && path.startsWith('/search')) ||
		(host === 'duckduckgo.com' && (path === '/' || path.startsWith('/html'))) ||
		(host === 'github.com' && path.startsWith('/search'));

	if (isSearchPage) {
		throw new Error(`Search result pages must be queried with webSearch, not openWebpage: ${url.toString()}`);
	}
}
