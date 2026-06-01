import type { Message } from '@warsam-e/echo';

type MessageStreamerOptions = {
	interval?: number;
	cursor?: string;
};

export class MessageStreamer {
	private readonly message: Message;
	private readonly interval: number;
	private readonly cursor: string;

	private buffer = '';
	private lastSent = '';
	private done = false;
	private flushPromise?: Promise<void>;

	constructor(message: Message, options: MessageStreamerOptions = {}) {
		this.message = message;
		this.interval = options.interval ?? 1000;
		this.cursor = options.cursor ?? '▌';
	}

	write(chunk: string) {
		this.buffer += chunk;
	}

	start() {
		if (this.flushPromise) return this.flushPromise;

		this.flushPromise = this.flush();
		return this.flushPromise;
	}

	async finish() {
		this.done = true;
		await this.flushPromise;
		return this.buffer;
	}

	get content() {
		return this.buffer;
	}

	private async flush() {
		while (!this.done) {
			await this.update(this.previewContent());
			await Bun.sleep(this.interval);
		}

		await this.update(this.finalContent());
	}

	private async update(content: string) {
		if (content === this.lastSent) return;

		this.lastSent = content;

		try {
			await this.message.edit({
				content,
			});
		} catch {
			// ignore edit failures because Discord is Discord
		}
	}

	private previewContent() {
		const cursor = this.cursor;

		if (this.buffer.length > 1990) {
			return `${this.buffer.slice(0, 1980)}${cursor}\n\n[Still generating...]`;
		}

		return `${this.buffer}${cursor}`;
	}

	private finalContent() {
		if (!this.buffer) {
			return '[empty response]';
		}

		if (this.buffer.length > 2000) {
			return `${this.buffer.slice(0, 1900)}\n\n[Response truncated. Full response was ${this.buffer.length} characters.]`;
		}

		return this.buffer;
	}
}
