import { tool } from 'ai';
import z from 'zod';
import { readDiscordAttachment } from '../attachments.ts';
import type { StatusUpdate } from '../policy.ts';

export const createDiscordReadAttachmentTool = (options: { onStatus?: StatusUpdate; pageChars?: number } = {}) =>
	tool({
		description:
			'Read a Discord message attachment by its CDN URL. Supports text-like files and image descriptions. Use attachment URLs from discordSearchMessages or the current conversation context.',
		inputSchema: z.object({
			url: z.string().describe('Discord CDN attachment URL (cdn.discordapp.com or media.discordapp.net).'),
			filename: z.string().describe('Attachment filename, if known.').optional(),
			content_type: z.string().describe('Attachment content type, if known.').optional(),
		}),
		execute: async ({ url, filename, content_type }) => {
			console.log('[ai:tool:discordReadAttachment] start', {
				url,
				filename,
				content_type,
			});
			await options.onStatus?.('reading');

			const result = await readDiscordAttachment(
				{
					url,
					filename,
					content_type,
				},
				{ maxChars: options.pageChars },
			);

			console.log('[ai:tool:discordReadAttachment] complete', {
				url,
				ok: result.ok,
				kind: result.ok ? result.kind : undefined,
				text_chars: result.ok ? result.text.length : 0,
				error: result.ok ? undefined : result.error,
			});

			return result;
		},
	});
