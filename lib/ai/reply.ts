import type { Message } from '@warsam-e/echo';
import type { UserModelMessage } from 'ai';
import { streamText } from 'ai';
import type { Senku } from '$bot/senku.ts';
import { historyContext, messageSystemContext, system } from './context.ts';
import { chatModel } from './model.ts';
import { type HarnessPolicy, replyStyleInstruction } from './policy.ts';
import type { ResearchNotes } from './research.ts';

export async function streamReply(args: {
	bot: Senku;
	instructions: string;
	msg: Message;
	ctx_msgs: Iterable<Message>;
	policy: HarnessPolicy;
	researchNotes?: ResearchNotes;
}) {
	const { bot, ctx_msgs, instructions, msg, policy, researchNotes } = args;
	console.log('[ai:reply] start', {
		message_id: msg.id,
		channel_id: msg.channelId,
		target_chars: policy.reply.targetChars,
		max_output_tokens: policy.reply.maxOutputTokens,
		has_research: Boolean(researchNotes),
		research_confidence: researchNotes?.confidence,
		research_sources: researchNotes?.sources.length,
	});

	return streamText({
		model: chatModel,
		messages: researchNotes ? [finalAnswerRequest(msg, researchNotes)] : await historyContext(bot, msg, ctx_msgs),
		system: [
			system(instructions),
			system(replyStyleInstruction(policy.reply.targetChars)),
			...(await messageSystemContext(bot, msg)),
			...(researchNotes
				? [
						system(
							[
								'Use these private research notes to answer naturally.',
								'The research phase is already complete by the time you write this answer.',
								'Do not dump the notes. When making researched claims, casually mention the useful source or include its URL.',
								'For Discord message sources, include the full https://discord.com/channels/... link plainly when the user asks for a link or when the exact message matters.',
								'Never wrap Discord message links in angle brackets.',
								'Do not say you are searching, reading, checking, pulling up results, or about to look something up.',
								'If the notes are empty or say research failed, say you could not find enough instead of promising to search.',
								'If budget_exhausted is true or confidence is low, be honest about uncertainty.',
								JSON.stringify(researchNotes),
							].join('\n'),
						),
					]
				: []),
		],
		timeout: {
			totalMs: policy.reply.totalMs,
			chunkMs: policy.reply.chunkMs,
		},
		maxOutputTokens: policy.reply.maxOutputTokens,
	});
}

function finalAnswerRequest(msg: Message, researchNotes: ResearchNotes): UserModelMessage {
	return {
		role: 'user',
		content: JSON.stringify({
			task: 'Write the final Discord reply now. Research is complete. Answer from the research notes.',
			original_user_message: msg.content,
			research_notes: researchNotes,
			requirements: [
				'Do not say you will search, are searching, are checking, or are pulling anything up.',
				'If the notes contain findings, summarize those findings directly.',
				'If the answer depends on a source, mention it casually or include the useful source URL.',
				'If citing a Discord message, use the plain full message link from the notes. Do not put it inside < and >.',
				'Use Discord-native mentions from the notes, like <@user_id> and <#channel_id>, when they make the answer clearer.',
				'If the notes are empty or failed, say that you could not find enough useful info.',
				'Keep it natural and concise.',
			],
		}),
	};
}
