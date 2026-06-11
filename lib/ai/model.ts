import { createDeepSeek } from '@ai-sdk/deepseek';
import { env } from '$utils/index.ts';

const deepseek = createDeepSeek({
	apiKey: env.DEEPSEEK_API_KEY,
});

export const chatModel = deepseek('deepseek-v4-flash');
