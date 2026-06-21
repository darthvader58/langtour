import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '..', '.env') });

export const PORT = process.env.PORT || 8765;
export const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY || '';
export const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
