import { ApplicationIntegrationType, get_default_cmds, InteractionContextType } from '@warsam-e/echo';
import type { Senku } from '$bot/senku.ts';

const { ping } = get_default_cmds<Senku>();

const cmds = [ping];

export default cmds.map((c) => {
	c.contexts = [InteractionContextType.BotDM, InteractionContextType.PrivateChannel, InteractionContextType.Guild];
	c.integration_types = [ApplicationIntegrationType.UserInstall, ApplicationIntegrationType.GuildInstall];
	return c;
});
