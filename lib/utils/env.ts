import { join } from 'node:path';

export const proj_root = join(import.meta.filename, '../../..');

type BotEnv = 'BOT_TOKEN';
type AIEnv = 'DEEPSEEK_API_KEY' | 'GEMINI_API_KEY';
type Env = 'NODE_ENV' | BotEnv | AIEnv;

export function get_env<
	T extends 'string' | 'boolean' | 'number' = 'string',
	V = T extends 'string' ? string : T extends 'boolean' ? boolean : number,
>(env: Env, type?: T): V {
	const current_type = type ?? ('string' as T);
	const val = process.env[env];
	if (!val) {
		if (env === 'NODE_ENV') return 'development' as V;
		throw new Error(`Environment variable ${env} is not set`);
	}
	if (current_type === 'string') return val as V;
	if (current_type === 'boolean') return (val === 'true') as V;
	const num = Number(val);
	if (Number.isNaN(num)) {
		throw new Error(`Environment variable ${env} is not a number`);
	}
	return num as V;
}

export { join };
