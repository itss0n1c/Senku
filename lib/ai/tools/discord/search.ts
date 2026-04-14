import { tool } from '@openai/agents-core';
import { type APIMessageSearchResult, Routes } from '@warsam-e/echo';
import z from 'zod';
import { bot } from '$index.ts';

export default tool({
	name: 'discord_search',
	description: 'Search for messages in a Discord server / channel.',
	parameters: z.object({
		server: z.string().describe('The ID of the Discord server to search in.'),
		query: z.string().describe('Filter messages by content (max 1024 characters)'),
	}),
	execute: async ({ server, query }) => {
		const guild = await bot.guilds.fetch(server);

		const search = new URLSearchParams();
		search.append('content', query);
		console.log({ search: search.toString() });

		const res = (await bot.rest.get(Routes.guildMessagesSearch(guild.id), {
			query: search,
		})) as APIMessageSearchResult;
		const msgs = res.messages.flat();
		console.log({ msgs });
		return {
			results: msgs.map((x) => ({
				id: x.id,
				author: {
					id: x.author.id,
					name: x.author.global_name ?? x.author.username,
					username: x.author.discriminator
						? `${x.author.username}#${x.author.discriminator}`
						: x.author.username,
				},
				content: x.content,
			})),
		};
	},
});
