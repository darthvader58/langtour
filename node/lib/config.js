import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '..', '.env') });
dotenv.config({ path: join(__dirname, '..', '..', '.env.local') });

export const PORT = process.env.PORT || 8765;
export const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY || '';
export const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
export const SUPERMEMORY_API_KEY = process.env.SUPERMEMORY_API_KEY || '';
export const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
export const VOICE_AUDIO_DIR = process.env.VOICE_AUDIO_DIR || '';

// Speech scoring: any new adapter must read process.env at call-time, not import-time.
// Caching env vars as module-level exports here introduces stale-config bugs — do not add them.
// Set SPEECH_ENGINE, AZURE_SPEECH_KEY, and AZURE_SPEECH_REGION in the Railway deploy environment.
