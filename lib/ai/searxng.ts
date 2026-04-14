import { get_env, get_json } from '$utils/index.ts';

type SearxNGResult = {
	title?: string;
	url?: string;
	content?: string;
	engine?: string;
	score?: number;
	publishedDate?: string;
};

type SearxNGResponse = {
	query?: string;
	number_of_results?: number;
	results?: SearxNGResult[];
	answers?: string[];
	infoboxes?: Array<Record<string, unknown>>;
};

export type WebSearchResult = {
	title: string;
	url: string;
	snippet: string;
	engine?: string;
	score?: number;
	published_date?: string;
};

export type WebSearchResponse = {
	query: string;
	results: WebSearchResult[];
};

export async function search_web(query: string, max_results = 5): Promise<WebSearchResponse> {
	const trimmed_query = query.trim();
	if (!trimmed_query) throw new Error('Search query cannot be empty');

	const base_url = get_env('SEARXNG_BASE_URL', 'string');
	const url = new URL('/search', base_url);

	url.searchParams.set('q', trimmed_query);
	url.searchParams.set('format', 'json');
	url.searchParams.set('language', 'en-US');
	url.searchParams.set('safesearch', '1');

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 8_000);

	try {
		const data = await get_json<SearxNGResponse>(url.toString(), {
			signal: controller.signal,
			headers: {
				Accept: 'application/json',
			},
		});

		const results = (data.results ?? [])
			.filter((result): result is Required<Pick<SearxNGResult, 'title' | 'url'>> & SearxNGResult =>
				Boolean(result.title && result.url),
			)
			.slice(0, Math.max(1, Math.min(max_results, 8)))
			.map((result) => ({
				title: clean_text(result.title),
				url: result.url,
				snippet: clean_text(result.content ?? ''),
				engine: result.engine,
				score: result.score,
				published_date: result.publishedDate,
			}));

		return {
			query: trimmed_query,
			results,
		};
	} catch (err) {
		if (err instanceof Error && err.name === 'AbortError') {
			throw new Error('SearxNG search timed out');
		}
		throw err;
	} finally {
		clearTimeout(timeout);
	}
}

function clean_text(text: string) {
	return text.replaceAll(/\s+/g, ' ').trim();
}
