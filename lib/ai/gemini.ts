import { createPartFromBase64, createPartFromText, GoogleGenAI } from '@google/genai';
import { get_env } from '$utils/index.ts';

const ai = new GoogleGenAI({ apiKey: get_env('GEMINI_API_KEY', 'string') });

async function image_part_from_url(image_url: string) {
	const res = await fetch(image_url);
	if (!res.ok) throw new Error(`Failed to fetch image: ${res.status} ${res.statusText}`);

	const mime_type = res.headers.get('content-type')?.split(';')[0];
	if (!mime_type?.startsWith('image/')) {
		throw new Error(`Expected an image response, got ${mime_type ?? 'unknown content type'}`);
	}

	const data = Buffer.from(await res.arrayBuffer()).toString('base64');
	return createPartFromBase64(data, mime_type);
}

export async function gemini_describe_image(image_url: string) {
	const response = await ai.models.generateContent({
		model: 'gemma-4-31b-it',
		contents: [
			createPartFromText('Describe this image plainly and accurately. Return text only.'),
			await image_part_from_url(image_url),
		],
	});

	const description = response.text?.trim();
	if (!description) throw new Error('No description returned from Gemma');
	return description;
}
