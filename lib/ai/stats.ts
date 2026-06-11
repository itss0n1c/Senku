import { env, get_json } from '$utils/index.ts';

export const stats = () =>
	get_json<{
		is_available: boolean;
		balance_infos: Array<Record<'currency' | 'total_balance' | 'granted_balance' | 'topped_up_balance', string>>;
	}>('https://api.deepseek.com/user/balance', {
		headers: {
			Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
		},
	});
