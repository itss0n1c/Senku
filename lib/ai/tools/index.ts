import type { Senku } from '$bot/senku.ts';
import web_search from './web_search.ts';

export const createTools = (_bot: Senku) => ({
	...web_search,
});
