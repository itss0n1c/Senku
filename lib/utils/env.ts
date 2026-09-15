import { join } from 'node:path';
import arkenv from 'arkenv';

export const proj_root = join(import.meta.path, '../../..');

export const env = arkenv({
	NODE_ENV: '"development" | "production" | "test" = "development"',
	BOT_TOKEN: 'string',
	DEEPSEEK_API_KEY: 'string',
	DATABASE_URL: 'string.url',
	SEARXNG_BASE_URL: 'string.url',
});

export { join };
