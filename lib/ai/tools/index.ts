import type { Senku } from '$bot/senku.ts';
import type { StatusUpdate } from '../policy.ts';
import { createWebTools } from './web_search.ts';

type ToolOptions = {
	onStatus?: StatusUpdate;
	searchResults?: number;
	pageChars?: number;
};

export const createTools = (_bot: Senku, options: ToolOptions = {}) => ({
	...createWebTools(options),
});
