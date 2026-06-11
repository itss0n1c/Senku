import cmds from '$cmds/index.ts';
import { registerMessageEvents } from '$events/message.ts';
import { env } from '$utils/index.ts';
import { Senku } from './senku.ts';

export async function startSenku() {
	const bot = await new Senku().registerCommands(cmds).init(env.BOT_TOKEN);
	registerMessageEvents(bot);

	return bot;
}
