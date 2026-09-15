import { openaiCompatible } from '@tanstack/ai-openai/compatible';
import { env } from '$utils/index.ts';

const deepseek = openaiCompatible({
	name: 'deepseek',
	baseURL: 'https://api.deepseek.com/v1',
	apiKey: env.DEEPSEEK_API_KEY,
	models: ['deepseek-flash'],
});

export const senkuModel = deepseek('deepseek-flash');
