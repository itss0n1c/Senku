export type RequestMode = 'chat' | 'lookup' | 'deep_lookup';

export type HarnessStatus = 'thinking' | 'searching' | 'reading' | 'checking' | 'answering';

export type StatusUpdate = (status: HarnessStatus) => void | Promise<void>;

export type ResearchBudget = {
	steps: number;
	totalMs: number;
	stepMs: number;
	searchResults: number;
	pageChars: number;
	targetChars: number;
	maxOutputTokens: number;
};

export type HarnessPolicy = {
	mode: RequestMode;
	research?: ResearchBudget;
	reply: {
		targetChars: number;
		maxOutputTokens: number;
		totalMs: number;
		chunkMs: number;
	};
};

const chatReply = {
	targetChars: 900,
	maxOutputTokens: 900,
	totalMs: 30_000,
	chunkMs: 10_000,
};

export const policies = {
	chat: {
		mode: 'chat',
		reply: chatReply,
	},
	lookup: {
		mode: 'lookup',
		research: {
			steps: 12,
			totalMs: 45_000,
			stepMs: 15_000,
			searchResults: 5,
			pageChars: 6_000,
			targetChars: 1_100,
			maxOutputTokens: 1_500,
		},
		reply: {
			targetChars: 1_200,
			maxOutputTokens: 1_200,
			totalMs: 35_000,
			chunkMs: 10_000,
		},
	},
	deep_lookup: {
		mode: 'deep_lookup',
		research: {
			steps: 24,
			totalMs: 75_000,
			stepMs: 20_000,
			searchResults: 7,
			pageChars: 8_000,
			targetChars: 1_500,
			maxOutputTokens: 2_000,
		},
		reply: {
			targetChars: 1_500,
			maxOutputTokens: 1_500,
			totalMs: 45_000,
			chunkMs: 10_000,
		},
	},
} satisfies Record<RequestMode, HarnessPolicy>;

export const policyFor = (mode: RequestMode): HarnessPolicy => policies[mode];

export function replyStyleInstruction(targetChars: number) {
	return [
		'Answer like a person in Discord.',
		`Aim to stay under ${targetChars} characters unless the user explicitly asks for detail.`,
		'Default to 1-3 short paragraphs.',
		'If the full answer would be long, give the useful short version first and offer to expand.',
		'If no research notes were provided, do not claim you searched, looked something up, or checked the web.',
		'Never say you are about to search, will search, are pulling up results, or are checking now in the final answer.',
		'Do not mention internal modes, budgets, tool calls, or harness details.',
	].join(' ');
}
