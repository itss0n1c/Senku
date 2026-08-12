import type { Message } from '@warsam-e/echo';
import type { Senku } from '$bot/senku.ts';
import type { StatusUpdate } from '../../policy.ts';
import { createDiscordReadAttachmentTool } from './read_attachment.ts';
import { createDiscordSearchTool } from './search.ts';

type DiscordToolOptions = {
	onStatus?: StatusUpdate;
	pageChars?: number;
};

export const createDiscordTools = (bot: Senku, msg?: Message, options: DiscordToolOptions = {}) => {
	if (!msg || msg.channel.isDMBased()) return {};

	return {
		discordSearchMessages: createDiscordSearchTool(bot, msg),
		discordReadAttachment: createDiscordReadAttachmentTool(options),
	};
};
