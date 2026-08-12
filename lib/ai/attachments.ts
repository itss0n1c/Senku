import { gemini_describe_image } from './gemini.ts';

const DISCORD_CDN_HOSTS = new Set(['cdn.discordapp.com', 'media.discordapp.net']);
const MAX_BYTES = 1_000_000;
const DEFAULT_MAX_CHARS = 6_000;

const TEXT_EXTENSIONS = new Set([
	'txt',
	'md',
	'markdown',
	'json',
	'jsonl',
	'csv',
	'tsv',
	'log',
	'yml',
	'yaml',
	'toml',
	'xml',
	'html',
	'htm',
	'css',
	'js',
	'jsx',
	'ts',
	'tsx',
	'mjs',
	'cjs',
	'py',
	'rb',
	'go',
	'rs',
	'java',
	'kt',
	'swift',
	'c',
	'h',
	'cpp',
	'hpp',
	'cs',
	'sh',
	'bash',
	'zsh',
	'sql',
	'env',
	'ini',
	'cfg',
	'conf',
	'diff',
	'patch',
	'r',
	'php',
	'pl',
	'lua',
]);

export type AttachmentLike = {
	url: string;
	filename?: string | null;
	name?: string | null;
	content_type?: string | null;
	contentType?: string | null;
	description?: string | null;
	size?: number | null;
};

export type ReadAttachmentResult =
	| {
			ok: true;
			url: string;
			filename: string;
			content_type: string;
			kind: 'text' | 'image';
			text: string;
			truncated: boolean;
	  }
	| {
			ok: false;
			url: string;
			filename: string;
			content_type: string;
			error: string;
	  };

export function attachmentFilename(attachment: AttachmentLike) {
	return attachment.filename || attachment.name || 'attachment';
}

export function attachmentContentType(attachment: AttachmentLike) {
	return attachment.content_type || attachment.contentType || 'application/octet-stream';
}

export function isDiscordCdnUrl(url: string) {
	try {
		const parsed = new URL(url);
		return ['http:', 'https:'].includes(parsed.protocol) && DISCORD_CDN_HOSTS.has(parsed.hostname);
	} catch {
		return false;
	}
}

export async function readDiscordAttachment(
	attachment: AttachmentLike,
	options: { maxChars?: number } = {},
): Promise<ReadAttachmentResult> {
	const url = attachment.url;
	const filename = attachmentFilename(attachment);
	const contentType = attachmentContentType(attachment);
	const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;

	if (!isDiscordCdnUrl(url)) {
		return {
			ok: false,
			url,
			filename,
			content_type: contentType,
			error: 'Only Discord CDN attachment URLs are allowed.',
		};
	}

	if (typeof attachment.size === 'number' && attachment.size > MAX_BYTES) {
		return {
			ok: false,
			url,
			filename,
			content_type: contentType,
			error: `Attachment is too large to read (max ${MAX_BYTES.toLocaleString()} bytes).`,
		};
	}

	if (isImageAttachment(contentType, filename)) {
		if (attachment.description?.trim()) {
			return {
				ok: true,
				url,
				filename,
				content_type: contentType,
				kind: 'image',
				text: attachment.description.trim(),
				truncated: false,
			};
		}

		try {
			const description = await gemini_describe_image(url);
			return {
				ok: true,
				url,
				filename,
				content_type: contentType,
				kind: 'image',
				text: description,
				truncated: false,
			};
		} catch (error) {
			return {
				ok: false,
				url,
				filename,
				content_type: contentType,
				error: error instanceof Error ? error.message : 'Failed to describe image attachment.',
			};
		}
	}

	if (!isTextAttachment(contentType, filename)) {
		return {
			ok: false,
			url,
			filename,
			content_type: contentType,
			error: `Unsupported attachment type: ${contentType}`,
		};
	}

	try {
		const text = await fetchAttachmentText(url, maxChars);
		return {
			ok: true,
			url,
			filename,
			content_type: contentType,
			kind: 'text',
			text: text.value,
			truncated: text.truncated,
		};
	} catch (error) {
		return {
			ok: false,
			url,
			filename,
			content_type: contentType,
			error: error instanceof Error ? error.message : 'Failed to read text attachment.',
		};
	}
}

function isImageAttachment(contentType: string, filename: string) {
	if (contentType.startsWith('image/')) return true;
	return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(extensionOf(filename));
}

function isTextAttachment(contentType: string, filename: string) {
	if (
		contentType.startsWith('text/') ||
		contentType === 'application/json' ||
		contentType === 'application/xml' ||
		contentType === 'application/javascript' ||
		contentType === 'application/typescript' ||
		contentType === 'application/x-yaml' ||
		contentType === 'application/yaml'
	) {
		return true;
	}

	return TEXT_EXTENSIONS.has(extensionOf(filename));
}

function extensionOf(filename: string) {
	const parts = filename.toLowerCase().split('.');
	return parts.length > 1 ? (parts.at(-1) ?? '') : '';
}

async function fetchAttachmentText(url: string, maxChars: number) {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 10_000);

	try {
		const res = await fetch(url, {
			signal: controller.signal,
			headers: {
				'User-Agent': 'senku-discord-bot/1.0',
				Accept: 'text/*, application/json, application/xml, application/javascript',
			},
			redirect: 'follow',
		});

		if (!res.ok) {
			throw new Error(`Attachment fetch failed: ${res.status} ${res.statusText}`);
		}

		const length = Number(res.headers.get('content-length') ?? 0);
		if (length > MAX_BYTES) {
			throw new Error(`Attachment is too large to read (max ${MAX_BYTES.toLocaleString()} bytes).`);
		}

		const buffer = Buffer.from(await res.arrayBuffer());
		if (buffer.byteLength > MAX_BYTES) {
			throw new Error(`Attachment is too large to read (max ${MAX_BYTES.toLocaleString()} bytes).`);
		}

		const value = buffer.toString('utf8');
		return {
			value: value.slice(0, maxChars),
			truncated: value.length > maxChars,
		};
	} finally {
		clearTimeout(timeout);
	}
}
