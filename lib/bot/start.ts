import cmds from '$cmds/index.ts';
import { ConversationCoordinator } from '$conversation/coordinator.ts';
import { migrateDatabase } from '$db/index.ts';
import { env } from '$utils/index.ts';
import { Senku } from './senku.ts';

export async function startSenku() {
	console.info('[senku:start] applying database migrations');
	await migrateDatabase();
	console.info('[senku:start] database migrations ready');
	console.info('[senku:start] connecting to Discord');
	const bot = await new Senku().registerCommands(cmds).init(env.BOT_TOKEN);
	const coordinator = new ConversationCoordinator(bot);
	coordinator.start();
	console.info('[senku:start] conversation coordinator listening');

	return bot;
}
