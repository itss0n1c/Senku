import { Command, codeBlock } from '@warsam-e/echo';
import { stats } from '$ai/index.ts';
import type { Senku } from '$index.ts';

export default new Command<Senku>({
	name: 'stats',
	description: 'Stats about the AI',
}).addHandler('chat_input', async (_bot, int) => {
	await int.deferReply();
	const res = await stats();

	await int.editReply({
		content: codeBlock('json', JSON.stringify(res, null, 4)),
	});
});
