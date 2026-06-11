import { Command, get_default_cmds } from '@warsam-e/echo';
import type { Senku } from '$index.ts';
import channel from './channel.ts';

const { eval: evalc } = get_default_cmds<Senku>();

export default new Command<Senku>({
	name: 'manage',
	description: 'manage commands',
	owners_only: true,
})
	.addSubCommandGroup({
		name: 'channel',
		description: 'manage channel settings',
		commands: channel,
	})
	.addSubCommands([evalc]);
