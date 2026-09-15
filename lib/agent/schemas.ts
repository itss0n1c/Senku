import { type } from 'arktype';

export const participationDecision = type({
	action: "'ignore' | 'react' | 'reply'",
	'reaction?': 'string | null',
	'reason?': 'string | null',
});

export const responsePlan = type({
	messages: 'string[]',
});

export const conversationSummary = type({ summary: 'string' });

export type ParticipationDecision = typeof participationDecision.infer;
export type ResponsePlan = typeof responsePlan.infer;
