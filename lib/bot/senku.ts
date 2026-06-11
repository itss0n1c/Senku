import Echo, { bold, GatewayIntentBits, Partials, User } from '@warsam-e/echo';
import { emojis } from '$emojis.ts';
import { SettingsStore } from '$settings/index.ts';

export class Senku extends Echo {
	constructor() {
		super({
			name: 'Senku',
			color: '#88c585',
			client_options: {
				intents: [
					GatewayIntentBits.Guilds,
					GatewayIntentBits.GuildMembers,
					GatewayIntentBits.GuildModeration,
					GatewayIntentBits.GuildExpressions,
					GatewayIntentBits.GuildIntegrations,
					GatewayIntentBits.GuildWebhooks,
					GatewayIntentBits.GuildInvites,
					GatewayIntentBits.GuildVoiceStates,
					GatewayIntentBits.GuildPresences,
					GatewayIntentBits.GuildMessages,
					GatewayIntentBits.GuildMessageReactions,
					GatewayIntentBits.GuildMessageTyping,
					GatewayIntentBits.DirectMessages,
					GatewayIntentBits.DirectMessageReactions,
					GatewayIntentBits.DirectMessageTyping,
					GatewayIntentBits.MessageContent,
					GatewayIntentBits.GuildScheduledEvents,
					GatewayIntentBits.AutoModerationConfiguration,
					GatewayIntentBits.AutoModerationExecution,
					GatewayIntentBits.GuildMessagePolls,
					GatewayIntentBits.DirectMessagePolls,
				],
				partials: [
					Partials.User,
					Partials.Channel,
					Partials.GuildMember,
					Partials.Message,
					Partials.Reaction,
					Partials.GuildScheduledEvent,
					Partials.ThreadMember,
					Partials.SoundboardSound,
					Partials.Poll,
					Partials.PollAnswer,
				],
			},
		});
	}

	settings = new SettingsStore();

	is_admin(user: User) {
		if (!this.application) throw new Error('Application not found');
		const team = this.application.owner;
		if (!team) throw new Error('Application owner not found');
		if (team instanceof User) return team.equals(user);
		return team.members.some((m) => m.user.equals(user));
	}

	get thinking() {
		return `${emojis.typing} ${bold(this.name)} is thinking...`;
	}

	get self() {
		if (!this.user) throw new Error('Bot user not found');
		return this.user;
	}
}
