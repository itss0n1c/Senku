import { join } from 'node:path';
import arkenv from 'arkenv';

export const proj_root = join(import.meta.filename, '../../..');

export const env = arkenv({
	NODE_ENV: '"development" | "production" | "test" = "development"',
	BOT_TOKEN: 'string',
	DEEPSEEK_API_KEY: 'string',
	GEMINI_API_KEY: 'string',
	SEARXNG_BASE_URL: 'string.url',
});

export { join };
