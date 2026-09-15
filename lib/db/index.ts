import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { env, join, proj_root } from '$utils/index.ts';
import * as schema from './schema.ts';

const client = postgres(env.DATABASE_URL, { max: 5 });

export const db = drizzle(client, { schema });

export async function migrateDatabase() {
	const migrationsFolder = join(proj_root, 'migrations');
	const startedAt = performance.now();
	console.info('[db:migrate] started', { migrationsFolder });
	await migrate(db, { migrationsFolder });
	console.info('[db:migrate] completed', { durationMs: Math.round(performance.now() - startedAt) });
}
