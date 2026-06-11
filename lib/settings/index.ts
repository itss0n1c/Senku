import type { Snowflake } from '@warsam-e/echo';
import { db } from '$db/index.ts';

export class SettingsStore {
	channel_ctx_limit = async (channel_id: Snowflake) =>
		(await db.get<number>(`channel:${channel_id}:ctx_limit`)) ?? 10;

	set_channel_ctx_limit = async (channel_id: Snowflake, limit: number) =>
		await db.set(`channel:${channel_id}:ctx_limit`, limit);
}
