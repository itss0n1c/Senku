import { createDeepSeek } from '@ai-sdk/deepseek';
import type { Collection, Message } from '@warsam-e/echo';
import { stepCountIs, streamText } from 'ai';
import type { Senku } from '$bot/senku.ts';
import { env, join, proj_root } from '$utils/index.ts';
import { historyContext, messageSystemContext, system } from './context.ts';
import { createTools } from './tools/index.ts';

const deepseek = createDeepSeek({
	apiKey: env.DEEPSEEK_API_KEY,
});

export async function request(bot: Senku, msg: Message, ctx_msgs: Collection<string, Message>) {
	const instructions = await Bun.file(join(proj_root, 'assets/system.md')).text();

	return streamText({
		model: deepseek('deepseek-v4-flash'),
		messages: await historyContext(bot, msg, ctx_msgs.values()),
		system: [system(instructions), ...(await messageSystemContext(bot, msg))],
		tools: createTools(bot),
		stopWhen: stepCountIs(5),
		maxOutputTokens: 500,
	});
}
