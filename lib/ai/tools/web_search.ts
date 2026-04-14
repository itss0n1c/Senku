import { tool } from '@openai/agents';
import z from 'zod';
import { get_env, get_json } from '$utils/index.ts';

const searchWebTool = tool({
	name: 'search_web',
	description: 'Search the web for current information using SearXNG.',
	parameters: z.object({
		query: z.string().min(2).describe('The search query.'),
	}),
	execute: async ({ query }) => {
		console.log(`[search_web] Executing search for query: "${query}"`);
		const results = await searchSearxng(query);
		return {
			query,
			results,
			note: 'Top 5 search results from SearXNG.',
		};
	},
});

const openWebpageTool = tool({
	name: 'open_webpage',
	description: 'Open a webpage URL and extract readable text content.',
	parameters: z.object({
		url: z.string().describe('The webpage URL to open.'),
	}),
	async execute({ url }) {
		console.log(`[open_webpage] Fetching and extracting text from URL: ${url}`);
		const text = await fetchPageText(url);

		return {
			url,
			text,
			note: 'Extracted webpage text, truncated to 12k chars.',
		};
	},
});

export default [searchWebTool, openWebpageTool];

type SearchResult = {
	title: string;
	url: string;
	content: string;
	engine?: string;
};

async function searchSearxng(query: string): Promise<SearchResult[]> {
	const url = new URL('/search', get_env('SEARXNG_BASE_URL'));
	url.searchParams.set('q', query);
	url.searchParams.set('format', 'json');
	url.searchParams.set('language', 'en');
	url.searchParams.set('safesearch', '1');

	const res = await get_json<{
		query?: string;
		number_of_results?: number;
		results?: Array<{
			title?: string;
			url?: string;
			content?: string;
			engine?: string;
			score?: number;
			publishedDate?: string;
		}>;
		answers?: string[];
		infoboxes?: Array<Record<string, unknown>>;
	}>(url.toString(), {
		headers: {
			'User-Agent': 'my-agents-app/1.0',
			Accept: 'application/json',
		},
	});

	return (res.results ?? []).slice(0, 5).map((r: any) => ({
		title: r.title ?? '',
		url: r.url ?? '',
		content: r.content ?? '',
		engine: r.engine ?? undefined,
	}));
}

async function fetchPageText(url: string): Promise<string> {
	const parsed = new URL(url);

	// Basic SSRF guard. Tighten this if needed.
	if (!['http:', 'https:'].includes(parsed.protocol)) {
		throw new Error('Only http/https URLs are allowed.');
	}

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 10000);

	try {
		const res = await fetch(parsed.toString(), {
			signal: controller.signal,
			headers: {
				'User-Agent': 'my-agents-app/1.0',
				Accept: 'text/html, text/plain',
			},
			redirect: 'follow',
		});

		if (!res.ok) {
			throw new Error(`Page fetch failed: ${res.status} ${res.statusText}`);
		}

		const html = await res.text();

		// Very rough HTML -> text cleanup.
		const text = html
			.replace(/<script[\s\S]*?<\/script>/gi, ' ')
			.replace(/<style[\s\S]*?<\/style>/gi, ' ')
			.replace(/<[^>]+>/g, ' ')
			.replace(/\s+/g, ' ')
			.trim();

		return text.slice(0, 12000);
	} finally {
		clearTimeout(timeout);
	}
}
