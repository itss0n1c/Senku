import type { Message } from '@warsam-e/echo';
import type { Senku } from '$bot/senku.ts';
import { createDiscordSearchTool } from './search.ts';

export const createDiscordTools = (bot: Senku, msg?: Message) => {
	if (!msg || msg.channel.isDMBased()) return {};

	return {
		discordSearchMessages: createDiscordSearchTool(bot, msg),
	};
};
