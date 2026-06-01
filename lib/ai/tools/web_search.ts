import { tool } from 'ai';
import { SearxngService } from 'searxng';
import z from 'zod';

const service = new SearxngService({
	baseURL: 'https://searxng.s0n.dev',
	defaultSearchParams: {
		format: 'json',
		lang: 'en',
		safesearch: 1,
	},
	defaultRequestHeaders: {
		'Content-Type': 'application/json',
	},
});

export const searxng = (query: string) =>
	service.search(query).then((x) =>
		x.results.slice(0, 5).map((result) => ({
			title: result.title,
			url: result.url,
			content: result.content,
			engine: result.engine,
		})),
	);

const webSearch = tool({
	description: 'Search the web for information, websites, documentation, people, companies, news, and recent events.',
	inputSchema: z.object({
		query: z.string().describe('The search query. Be specific to get better results.'),
	}),

	execute: async ({ query }) => searxng(query),
});

const openWebpage = tool({
	description: 'Open a webpage URL and extract readable text content.',
	inputSchema: z.object({
		url: z.string().describe('The webpage URL to open.'),
	}),
	execute: async ({ url }) => {
		console.log(`[open_webpage] Fetching and extracting text from URL: ${url}`);
		const text = await fetchPageText(url);

		return {
			url,
			text,
			note: 'Extracted webpage text, truncated to 12k chars.',
		};
	},
});

export default { webSearch, openWebpage };

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
