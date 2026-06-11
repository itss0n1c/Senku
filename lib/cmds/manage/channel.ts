import {
	ApplicationCommandOptionType,
	bold,
	ChannelType,
	Command,
	ContainerBuilder,
	MessageFlags,
	type SendableChannels,
} from '@warsam-e/echo';
import type { Senku } from '$bot/senku.ts';

export default [
	new Command<Senku>({
		name: 'get',
		description: 'get channel info',
		options: [
			{
				name: 'channel',
				description: 'the channel (current by default)',
				type: ApplicationCommandOptionType.Channel,
				channel_types: [ChannelType.GuildText],
				required: false,
			},
		],
	}).addHandler('chat_input', async (bot, int) => {
		const channel = int.options.getChannel('channel', false, [ChannelType.GuildText]) ?? int.channel;
		if (!channel?.isSendable()) return int.reply({ content: 'Invalid channel', ephemeral: true });

		return int.reply({
			components: [await _channel_info(bot, channel)],
			flags: [MessageFlags.IsComponentsV2],
		});
	}),
	new Command<Senku>({
		name: 'set',
		description: 'set channel settings',
		options: [
			{
				name: 'ctx_limit',
				description: 'the context message limit (default 10)',
				type: ApplicationCommandOptionType.Integer,
				required: true,
				min_value: 1,
			},
			{
				name: 'channel',
				description: 'the channel (current by default)',
				type: ApplicationCommandOptionType.Channel,
				channel_types: [ChannelType.GuildText],
				required: false,
			},
		],
	}).addHandler('chat_input', async (bot, int) => {
		const channel = int.options.getChannel('channel', false, [ChannelType.GuildText]) ?? int.channel;
		if (!channel?.isSendable()) return int.reply({ content: 'Invalid channel', ephemeral: true });

		const ctx_limit = int.options.getInteger('ctx_limit', true);

		await bot.settings.set_channel_ctx_limit(channel.id, ctx_limit);

		return int.reply({
			components: [await _channel_info(bot, channel)],
			flags: [MessageFlags.IsComponentsV2],
		});
	}),
];

async function _channel_info(bot: Senku, channel: SendableChannels) {
	const ctx_limit = await bot.settings.channel_ctx_limit(channel.id);

	const name = channel.isDMBased() ? (channel.recipient?.username ?? 'DM Channel') : channel.name;
	const type = channel.isDMBased() ? 'DM' : 'Guild Text';
	const can_read = channel.isDMBased() ? true : (channel.permissionsFor(bot.self)?.has('ViewChannel') ?? false);
	const can_speak = channel.isDMBased() ? true : (channel.permissionsFor(bot.self)?.has('SendMessages') ?? false);

	return new ContainerBuilder().addTextDisplayComponents((t) =>
		t.setContent(
			[
				`## #${name} (${channel.id})`,
				`Type: ${bold(type)}`,
				`Can read? ${bold(can_read ? 'Yes' : 'No')}`,
				`Can speak? ${bold(can_speak ? 'Yes' : 'No')}`,
				'',
				'**Settings:**',
				`- Context limit: ${bold(ctx_limit.toLocaleString())} message${ctx_limit > 1 ? 's' : ''} (${ctx_limit === 10 ? 'default - 10' : 'custom'})`,
			].join('\n'),
		),
	);
}
