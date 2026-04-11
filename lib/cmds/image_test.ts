import { ApplicationCommandOptionType, Command, codeBlock } from '@warsam-e/echo';
import { inspect } from 'bun';
import { gemini_describe_image } from '$ai/gemini.ts';
import type { Senku } from '$index.ts';

export default new Command<Senku>({
	name: 'image_test',
	description: 'test describe an image',
	options: [
		{
			name: 'attachment',
			type: ApplicationCommandOptionType.Attachment,
			description: 'The image to describe',
			required: true,
		},
	],
}).addHandler('chat_input', async (_bot, int) => {
	const attachment = int.options.getAttachment('attachment', true);
	await int.deferReply();

	let res: string;
	try {
		res = await gemini_describe_image(attachment.url);
	} catch (e) {
		await int.editReply({ content: `An error occurred while describing the image.\n${codeBlock(inspect(e))}` });
		return;
	}

	await int.editReply({ content: res });
});
