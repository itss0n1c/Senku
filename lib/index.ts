import { DefaultWebSocketManagerOptions } from '@warsam-e/echo';
import { startSenku } from '$bot/start.ts';

export { Senku } from '$bot/senku.ts';

(DefaultWebSocketManagerOptions.identifyProperties as Record<string, unknown>).browser = 'Discord iOS';

export const bot = await startSenku();
