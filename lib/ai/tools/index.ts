import type { Message } from '@warsam-e/echo';
import type { Senku } from '$bot/senku.ts';
import type { StatusUpdate } from '../policy.ts';
import { createDiscordTools } from './discord/index.ts';
import { createWebTools } from './web_search.ts';

type ToolOptions = {
	msg?: Message;
	onStatus?: StatusUpdate;
	searchResults?: number;
	pageChars?: number;
};

export const createTools = (bot: Senku, options: ToolOptions = {}) => {
	const tools = {
		...createWebTools(options),
	};

	if (options.msg && !options.msg.channel.isDMBased()) {
		return {
			...tools,
			...createDiscordTools(bot, options.msg),
		};
	}

	return tools;
};
