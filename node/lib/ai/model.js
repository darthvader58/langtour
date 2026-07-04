import { generateObject } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { GEMINI_API_KEY } from '../config.js';

// Lazy provider init so importing this module (e.g. from tests that inject a
// stub) never requires a real key or network access.
let google = null;
function model() {
  google ??= createGoogleGenerativeAI({ apiKey: GEMINI_API_KEY });
  return google('gemini-2.5-flash');
}

// The single seam to the model. Tests inject a replacement via createAi();
// production code uses this default. Returns the parsed object directly —
// structured output via generateObject, no regex-over-free-text parsing.
export async function generateStructured({ schema, prompt }) {
  const { object } = await generateObject({ model: model(), schema, prompt });
  return object;
}
