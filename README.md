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
You need to manually create a `.env` file in the root directory of the project to store your API keys securely:

```bash
# Create the .env file and add the required API keys
echo "DEEPGRAM_API_KEY=your_deepgram_key_here" > .env
echo "GEMINI_API_KEY=your_gemini_key_here" >> .env
```
*(Make sure to replace `your_deepgram_key_here` and `your_gemini_key_here` with your actual API keys).*

### 3. Start the Application
Once the dependencies are installed and the keys are provided, you can spin up both the Vite frontend and Express backend simultaneously from the root folder using `concurrently`:

```bash
npm run dev
```

The app will now be running locally.
