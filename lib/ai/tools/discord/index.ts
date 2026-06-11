import type { Senku } from '$bot/senku.ts';
import { createDiscordSearchTool } from './search.ts';

export const createDiscordTools = (bot: Senku) => [createDiscordSearchTool(bot)];
