import { BunDB } from 'bun.db';
import { join, proj_root } from '$utils/index.ts';

export const db = new BunDB(join(proj_root, 'assets', 'db.sqlite'));
