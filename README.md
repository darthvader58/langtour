# Langtour

This project is a bilingual Speech-to-Text (STT) and translation web application. It uses a **React (Vite)** frontend and an **Express (Node.js)** backend, powered by the **Deepgram API** for live transcription and the **Google Gemini API** for translation.

## Prerequisites
- Node.js installed
- A Deepgram API Key
- A Google Gemini API Key

## Setup & Installation

If you are cloning this project from GitHub on a completely fresh machine, follow these steps to get everything working:

### 1. Install Dependencies
Because this project is structured with a separate frontend (`client/`) and backend (`node/`), you must install the dependencies in three different folders:

```bash
# 1. Install the root dependencies (for the 'concurrently' tool)
npm install

# 2. Install the backend dependencies
cd node
npm install

# 3. Install the frontend dependencies
cd ../client
npm install

# Return to the root folder
cd ..
```

### 2. Configure Environment Variables
You need to manually create a `.env` file in the root directory of the project to store your backend API keys securely:

```bash
# Create the .env file and add the required API keys
echo "DEEPGRAM_API_KEY=your_deepgram_key_here" > .env
echo "GEMINI_API_KEY=your_gemini_key_here" >> .env
```
*(Make sure to replace `your_deepgram_key_here` and `your_gemini_key_here` with your actual API keys).*

Copy `.env.example` to `.env.local` and add the URL and publishable key from your Supabase project settings. Only variables prefixed with `NEXT_PUBLIC_` are exposed to the frontend; backend API keys remain server-only.

### 3. Create the Supabase tables

Run `supabase db push` if this project is linked with the Supabase CLI. Otherwise, paste `supabase/migrations/20260620000000_user_profiles.sql` into the Supabase SQL editor and run it once.

This creates user profiles with a starting balance of 100 tokens, automatic login history, and empty level/rank catalogs ready for future progression data. Row-level security ensures users can only read their own profile and login records. Token spending uses the `spend_tokens` database function so balances cannot go below zero.

### 4. Enable Google sign-in

1. In Google Cloud Console, configure the OAuth consent screen, then create an OAuth 2.0 Client ID for a **Web application**.
2. Add the callback URL shown under **Supabase Dashboard → Authentication → Providers → Google** as an authorized redirect URI in Google Cloud. It has the form `https://<project-ref>.supabase.co/auth/v1/callback`.
3. Paste the Google client ID and client secret into that Supabase Google provider screen and enable the provider.
4. Under **Supabase Dashboard → Authentication → URL Configuration**, set the Site URL to `http://localhost:5173` for local development and add your production origin to Redirect URLs before deploying.

The frontend redirects through Supabase for Google authentication. The database trigger creates a profile with 100 tokens for each new user and appends later sign-ins to `login_history`.

Email/password authentication is also available through Supabase Auth. Ensure **Authentication → Providers → Email** is enabled. If email confirmation is enabled, add each local or production app origin to **Authentication → URL Configuration → Redirect URLs** so confirmation links can return to the app.

### 5. Start the Application
Once the dependencies are installed and the keys are provided, you can spin up both the Vite frontend and Express backend simultaneously from the root folder using `concurrently`:

```bash
npm run dev
```

The app will now be running locally.
