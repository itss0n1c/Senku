import type { Collection, Message } from '@warsam-e/echo';
import type { Senku } from '$bot/senku.ts';
import { join, proj_root } from '$utils/index.ts';
import { classifyRequest } from './classify.ts';
import { policyFor, type StatusUpdate } from './policy.ts';
import { streamReply } from './reply.ts';
import { type ResearchNotes, research } from './research.ts';

export async function request(args: {
	bot: Senku;
	msg: Message;
	ctx_msgs: Collection<string, Message>;
	onStatus?: StatusUpdate;
}) {
	const { bot, ctx_msgs, msg, onStatus } = args;
	console.log('[ai:request] start', {
		message_id: msg.id,
		channel_id: msg.channelId,
		ctx_count: ctx_msgs.size,
	});
	const instructions = await Bun.file(join(proj_root, 'assets/system.md')).text();
	console.log('[ai:request] instructions loaded', {
		message_id: msg.id,
		channel_id: msg.channelId,
		instruction_chars: instructions.length,
	});

	const mode = await classifyRequest(bot, msg, ctx_msgs.values());
	const policy = policyFor(mode);
	console.log('[ai:request] mode selected', {
		message_id: msg.id,
		channel_id: msg.channelId,
		mode,
		research_steps: policy.research?.steps,
		reply_target_chars: policy.reply.targetChars,
	});

	let researchNotes: ResearchNotes | undefined;
	if (mode === 'chat') {
		console.log('[ai:request] research skipped', {
			message_id: msg.id,
			channel_id: msg.channelId,
			mode,
		});
	} else {
		researchNotes = await research({
			bot,
			msg,
			ctx_msgs: ctx_msgs.values(),
			mode,
			policy,
			onStatus,
		});
	}

	await onStatus?.('answering');
	console.log('[ai:request] creating final stream', {
		message_id: msg.id,
		channel_id: msg.channelId,
		mode,
		has_research: Boolean(researchNotes),
		research_confidence: researchNotes?.confidence,
		research_sources: researchNotes?.sources.length,
		budget_exhausted: researchNotes?.budget_exhausted,
	});

	return {
		mode,
		stream: await streamReply({
			bot,
			instructions,
			msg,
			ctx_msgs: ctx_msgs.values(),
			policy,
			researchNotes,
		}),
	};
}
