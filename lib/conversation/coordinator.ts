import { Events, type Message, type SendableChannels, type Snowflake, type Typing } from '@warsam-e/echo';
import { createResponse, decideParticipation, updateConversationSummary } from '$agent/index.ts';
import type { Senku } from '$bot/senku.ts';

const QUIET_MS = 1_800;
const TYPING_GRACE_MS = 4_000;
const HISTORY_LIMIT = 30;
const ACTIVE_CONVERSATION_MS = 2 * 60_000;

type ChannelState = {
	timer?: ReturnType<typeof setTimeout>;
	activeRun?: AbortController;
	typingUntil: Map<Snowflake, number>;
	lastHumanActivity: number;
	generation: number;
};

export class ConversationCoordinator {
	private readonly channels = new Map<Snowflake, ChannelState>();
	private readonly bot: Senku;

	constructor(bot: Senku) {
		this.bot = bot;
	}

	start() {
		this.bot.on(Events.MessageCreate, (message) => void this.onMessage(message));
		this.bot.on(Events.TypingStart, (typing) => this.onTyping(typing));
		console.info('[conversation:start] listeners registered', {
			quietMs: QUIET_MS,
			typingGraceMs: TYPING_GRACE_MS,
			historyLimit: HISTORY_LIMIT,
		});
	}

	private state(channelId: Snowflake) {
		let state = this.channels.get(channelId);
		if (!state) {
			state = { typingUntil: new Map(), lastHumanActivity: 0, generation: 0 };
			this.channels.set(channelId, state);
			console.info('[conversation:state] channel state created', { channelId });
		}
		return state;
	}

	private async onMessage(message: Message) {
		console.info('[conversation:message] received', {
			messageId: message.id,
			channelId: message.channelId,
			authorId: message.author.id,
			author: message.author.tag,
			bot: message.author.bot,
			content: message.content,
			attachments: message.attachments.size,
			sendable: message.channel.isSendable(),
		});
		if (message.author.bot || !message.channel.isSendable()) {
			console.info('[conversation:message] ignored', {
				messageId: message.id,
				reason: message.author.bot ? 'bot author' : 'channel is not sendable',
			});
			return;
		}
		if (!message.content && message.attachments.size === 0) {
			console.info('[conversation:message] ignored', { messageId: message.id, reason: 'empty message' });
			return;
		}
		const state = this.state(message.channelId);
		state.lastHumanActivity = Date.now();
		state.generation += 1;
		if (state.activeRun) {
			console.info('[conversation:abort] cancelling stale turn', {
				channelId: message.channelId,
				generation: state.generation,
				reason: 'new message',
			});
			state.activeRun.abort('New Discord message arrived');
		}
		this.schedule(message.channel, state, QUIET_MS);
	}

	private onTyping(typing: Typing) {
		console.info('[conversation:typing] observed', {
			channelId: typing.channel.id,
			userId: typing.user.id,
			bot: typing.user.bot,
			sendable: typing.channel.isSendable(),
		});
		if (typing.user.bot || !typing.channel.isSendable()) return;
		const state = this.state(typing.channel.id);
		state.typingUntil.set(typing.user.id, Date.now() + TYPING_GRACE_MS);
		if (Date.now() - state.lastHumanActivity < ACTIVE_CONVERSATION_MS) {
			if (state.activeRun) {
				console.info('[conversation:abort] cancelling stale turn', {
					channelId: typing.channel.id,
					reason: 'user typing',
				});
				state.activeRun.abort('Someone resumed typing');
			}
			this.schedule(typing.channel, state, TYPING_GRACE_MS);
		}
	}

	private schedule(channel: SendableChannels, state: ChannelState, delay: number) {
		const replaced = Boolean(state.timer);
		if (state.timer) clearTimeout(state.timer);
		state.timer = setTimeout(() => void this.consider(channel, state), delay);
		console.info('[conversation:schedule] turn scheduled', {
			channelId: channel.id,
			delayMs: delay,
			generation: state.generation,
			replaced,
		});
	}

	private async consider(channel: SendableChannels, state: ChannelState) {
		state.timer = undefined;
		console.info('[conversation:consider] quiet timer fired', {
			channelId: channel.id,
			generation: state.generation,
			typingUsers: state.typingUntil.size,
		});
		const now = Date.now();
		for (const [userId, until] of state.typingUntil) if (until <= now) state.typingUntil.delete(userId);
		if (state.typingUntil.size) {
			console.info('[conversation:consider] waiting for typing users', {
				channelId: channel.id,
				userIds: [...state.typingUntil.keys()],
			});
			this.schedule(channel, state, TYPING_GRACE_MS);
			return;
		}

		const generation = state.generation;
		const abortController = new AbortController();
		state.activeRun = abortController;
		console.info('[conversation:turn] started', { channelId: channel.id, generation });
		try {
			console.info('[conversation:history] fetching', { channelId: channel.id, limit: HISTORY_LIMIT });
			const fetched = await channel.messages.fetch({ limit: HISTORY_LIMIT });
			const messages = [...fetched.values()]
				.filter((message) => !message.author.bot || message.author.equals(this.bot.self))
				.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
			console.info('[conversation:history] ready', {
				channelId: channel.id,
				fetched: fetched.size,
				usable: messages.length,
				messageIds: messages.map((message) => message.id),
			});
			if (!messages.length || abortController.signal.aborted) {
				console.info('[conversation:turn] stopped before decision', {
					channelId: channel.id,
					reason: abortController.signal.aborted ? 'aborted' : 'no usable messages',
				});
				return;
			}

			console.info('[conversation:decision] requesting', {
				channelId: channel.id,
				messageCount: messages.length,
			});
			const decision = await decideParticipation(this.bot, messages, abortController);
			console.info('[conversation:decision] received', { channelId: channel.id, ...decision });
			if (abortController.signal.aborted || state.generation !== generation) {
				console.info('[conversation:turn] discarded stale decision', {
					channelId: channel.id,
					startedGeneration: generation,
					currentGeneration: state.generation,
					aborted: abortController.signal.aborted,
				});
				return;
			}
			const latest = messages.at(-1);
			if (!latest) return;
			if (decision.action === 'ignore') {
				console.info('[conversation:decision] staying silent', {
					channelId: channel.id,
					reason: decision.reason,
				});
				return;
			}
			if (decision.action === 'react') {
				console.info('[conversation:reaction] attempting', {
					channelId: channel.id,
					messageId: latest.id,
					reaction: decision.reaction,
				});
				if (decision.reaction) await latest.react(decision.reaction);
				console.info('[conversation:reaction] sent', { channelId: channel.id, messageId: latest.id });
				return;
			}

			console.info('[conversation:response] sending typing indicator', { channelId: channel.id });
			await channel.sendTyping();
			console.info('[conversation:response] requesting plan', { channelId: channel.id });
			const plan = await createResponse(this.bot, messages, abortController);
			console.info('[conversation:response] plan received', {
				channelId: channel.id,
				messageCount: plan.messages.length,
				messageLengths: plan.messages.map((content) => content.length),
			});
			if (abortController.signal.aborted || state.generation !== generation) {
				console.info('[conversation:response] discarded stale plan', { channelId: channel.id });
				return;
			}
			for (const [index, content] of plan.messages.slice(0, 4).entries()) {
				const trimmed = content.trim();
				if (!trimmed) continue;
				if (index) await Bun.sleep(350 + Math.min(trimmed.length * 8, 1_200));
				if (abortController.signal.aborted || state.generation !== generation) return;
				const sent = await channel.send({ content: trimmed.slice(0, 2_000) });
				console.info('[conversation:response] message sent', {
					channelId: channel.id,
					messageId: sent.id,
					index,
					characters: trimmed.length,
				});
			}
			console.info('[conversation:summary] updating', { channelId: channel.id });
			await updateConversationSummary(this.bot, messages, plan.messages, abortController);
			console.info('[conversation:summary] updated', { channelId: channel.id });
		} catch (error) {
			if (!abortController.signal.aborted)
				console.error('[conversation] turn failed', { channelId: channel.id, error });
		} finally {
			if (state.activeRun === abortController) state.activeRun = undefined;
			console.info('[conversation:turn] finished', {
				channelId: channel.id,
				generation,
				aborted: abortController.signal.aborted,
			});
		}
	}
}
