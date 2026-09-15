import { defineConfig } from 'drizzle-kit';
import { env } from './lib/utils/env.ts';

export default defineConfig({
	dialect: 'postgresql',
	schema: './lib/db/schema.ts',
	out: './migrations',
	dbCredentials: { url: env.DATABASE_URL },
});
