import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '..', '.env') });
dotenv.config({ path: join(__dirname, '..', '..', '.env.local') });

export const PORT = process.env.PORT || 8765;
export const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY || '';
export const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
export const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
export const VOICE_AUDIO_DIR = process.env.VOICE_AUDIO_DIR || '';
export const SUPERMEMORY_API_KEY = process.env.SUPERMEMORY_API_KEY || '';
export const AZURE_SPEECH_KEY = process.env.AZURE_SPEECH_KEY || '';
export const AZURE_SPEECH_REGION = process.env.AZURE_SPEECH_REGION || '';
// Single owner/admin email for the evaluator-skip affordance. Resolved
// server-side against the authenticated user's identity; never client-sent. When
// empty, no user is ever admin (an empty === empty match is explicitly rejected).
export const ADMIN_EMAIL = process.env.ADMIN_EMAIL || '';
