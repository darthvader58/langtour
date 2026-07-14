# Langtour: Speak the World

Langtour is a speech-driven, story-mode language game. You don't drill flashcards — you *travel*. You spin a 3D globe, spend LangCoins to unlock a country, slip into a disguise, and clear the real-life situations a tourist actually hits by **speaking** your way through them. A voice in your ear coaches you, an in-scene character talks back, and the only thing that advances the story is a sentence you actually said out loud — and said well.

---

## The story of the Langtourist

> *You're a langtourist — a traveler who never visits anywhere as just a tourist.*
>
> *Every country you unlock hands you a new cover story and a new voice in your ear, walking you through it.*
>
> *The costume changes. The rule doesn't: you only pass as a local once you can actually talk like one.*
>
> *Pack light. Speak up. Let's go.*

That framing pops up once, before you've picked anywhere to go. The tone is deliberately Sackboy / LittleBigPlanet — a toybox world of costumes, not a spy thriller. Then every country you land in reframes you as a different character with a different reason to blend in, and gives you a **sidekick** — a companion in your ear whose whole job is getting you through your cover convincingly.

The disguise is never decoration. It's the *reason* the vocabulary matters: you're not "learning to order food," you're a spy who'll get made if you ask a market vendor the price like a tourist. Each of the six launch countries has its own cover and its own sidekick, authored once as canon in `shared/personaCanon.js` and read by both the UI (arrival story, lore codex) and the server (the sidekick's live voice), so the character you meet in the popup is the same one who corrects your grammar mid-scene:

| Country | Your cover | Sidekick | Their voice |
|---------|-----------|----------|-------------|
| 🇨🇳 China | **Spy** infiltrating a Shanghai black market | **Wren**, your handler on the radio | Dry, clipped, Watson-to-your-Sherlock. *"You're not blending into the crowd correctly."* |
| 🇮🇳 India | **Bollywood actor** chasing a first callback in Mumbai | **Rhea**, a fast-talking talent agent | Hype and hustle, but she'll cut a flat line reading |
| 🇫🇷 France | **Art thief** casing the Louvre | a fence who moves stolen canvases | Cool, exacting, Marcel-register French |
| 🇲🇽 Mexico | **Treasure hunter** on the trail of a relic | a guide who's done this before | Adventurous, warns you off the obvious traps |
| 🇪🇬 Egypt | **Archaeologist** reading a tomb | a scholar-companion | Patient, teacherly, respectful of the place |
| 🇧🇷 Brazil | **Undercover journalist** chasing a story in Rio | a local reporter | Warm, quick, keeps you on the story |

The sidekick praises you in character, corrects you in character, and — crucially — **can't do the one thing you have to do yourself: talk.** That's the whole game.

---

## The full user flow

A run through Langtour, from the globe to unlocking the next country:

1. **Land on the globe.** A 3D Earth (Three.js) shows the world with land geometry drawn from GeoJSON polygons. New players start with **100 LangCoins and zero countries unlocked** — the first thing you do is *choose* where to go.

2. **Unlock a country.** Spending 100 LangCoins unlocks a country and rotates the globe to it. The cost, the balance check, and the unlock are all decided **server-side** by a Postgres RPC — the client can ask to unlock, but never computes or asserts a balance. Unlocking the *next* country is gated on having actually finished (and claimed the reward for) the one before it.

3. **Meet your cover.** An arrival story pops up: a few tap-to-continue pages introducing your disguise and your sidekick, plus a lore codex you can revisit. The UI re-skins itself to that character — palette, accent, motifs, sidekick portrait — all driven by theme tokens keyed to the character, never hardcoded per screen.

4. **Pick a scenario.** Each country is a chain of real-life situations (market, restaurant, directions, reading a sign…). They're not a fixed list authored by hand — the chain is **generated for you**, each new situation seeded from the vocabulary you just mastered in the previous one (see *Forward-chaining* below). You clear them in order.

5. **Play a turn, out loud.** Inside a scenario, an in-scene character (the "NPC") says a line — shown with the native script, a phonetic reading, and a translation. You **speak your reply into the mic.** Deepgram transcribes it live. Your transcript goes to the server's evaluator, which decides pass or fail against a strict three-part rubric (below). On a pass, the sidekick praises you and the words you used correctly get logged into your memory. On a fail, the sidekick *teaches* — it names what went wrong (off-topic, too vague, bare word, grammar, wrong word) and nudges you toward a fix **without handing you the correct sentence.**

6. **Watch the scenario grow.** A situation doesn't have a fixed word count. It starts with 3–4 target words and **grows** its target set as you actually use words, up to an adaptive cap sized to what a tourist genuinely needs there and how fast you're moving. The scenario is only *complete* when the set has grown to its cap and you've used every word in it correctly.

7. **Finish the country and get paid.** When your whole generated chain for a country is covered and every scenario in it is complete, you can claim the country's LangCoin reward — again, a server RPC verifies completeness and pays the server-side reward value. That's the fuel to unlock your next destination, and the loop repeats with a new cover and a new sidekick.

8. **See your forest.** Everything you've learned renders as a living **word graph** — a 3D constellation growing from a root, out to a tree per situation-type, out to the full language. Words are colored by how well you know them. You don't just have a score; you can *see* the language filling in.

> **On fairness / anti-cheat:** completion is *earned by speaking*, full stop. The server's evaluator is the only thing that can mark a turn passed, and only a passed turn (with the scenario's goal met) records a completion. There's a single admin-only skip button for the owner's own testing, gated on a server-verified email — no player can reach it.

---

## How the pieces work

### Speech-to-text (Deepgram)

Voice is the core interaction, not a feature. The pipeline uses **Deepgram** on two paths, each tuned for a different job (`node/lib/voice/langParams.js`, `node/routes/voice.js`):

- **Live streaming** (`wss://…/listen`) gives you low-latency interim captions as you speak, so the conversation feels like a conversation. It runs `nova-3` for all six languages, with `interim_results=true` and `utterance_end_ms=1000` (Deepgram rejects the stream if that's below 1000 — a real bug we hit and fixed). This path feeds the on-screen text only.
- **Batch transcription** (`https://…/listen`) runs over the *complete* recorded utterance with accuracy prioritized over latency: `punctuate=true`, `smart_format=true`, and diarization. This is the **authoritative** transcript that feeds the evaluator.

Model choice is per-language and deliberate: batch uses `nova-2` for Chinese (verified stronger Chinese coverage and diarization on complete audio) but `nova-3` for Hindi, French, Spanish, Arabic, and Portuguese — `nova-3` is more robust to the **non-native accents this whole game is built around**, and critically, `nova-2` doesn't support Arabic at all (an early hardcoded `nova-2` batch URL silently broke Egypt entirely until it was routed to `nova-3`).

The transcriber's only job is to capture *what you said*. It does **not** decide whether you passed — that's the evaluator's call. This split matters: it means a mumbled-but-correct answer and a crystal-clear-but-off-topic answer are judged on *meaning*, not audio quality.

*(An optional pronunciation-scoring layer sits behind a swappable `scorePronunciation(audio, lang, targetText)` interface — an Azure Speech candidate — but it's strictly optional and only feeds the evaluator as an extra signal; the game is fully playable on Deepgram-plus-evaluator alone.)*

### Embeddings & vocabulary discovery

When a scenario needs to pick which words to teach, it doesn't grab from a static list — it computes the *right* words for you, using **semantic embeddings** and your personal review schedule together (`node/lib/graph/graph.js`).

Every word and every scenario topic is turned into a vector with Google's `gemini-embedding-2` model. Two vectors that mean similar things point in similar directions, and **cosine similarity** measures that. Word discovery mixes two streams into the target set:

1. **Due-for-review words** come first. Each word you know carries FSRS spaced-repetition state (stability, difficulty, last-review time). The engine computes each word's current *retrievability* and pulls the ones slipping below 0.9, highest-priority first — so review is woven into new situations instead of being a separate chore.

2. **New words** fill the rest of the slots, scored by a blend:

   ```
   combinedScore = 0.7 × (similarity to the scenario topic)
                 + 0.3 × (similarity to your strongest known words)
   ```

   The first term keeps new vocab **relevant to the situation you're in**; the second keeps it **anchored to what you already know well**, so you grow outward from your existing vocabulary instead of being handed random unrelated words. Embeddings are cached (scenario topics repeat across players; the Gemini call is the slowest hop) and back-filled in parallel for any word missing a vector.

The result is that the words you're taught in a Parisian café are both café-relevant *and* one comfortable step past what you already know.

### Forward-chaining scenarios & growing targets

A country's scenarios chain forward: **scenario N is seeded from the vocabulary you mastered in scenario N−1** (`node/lib/graph/chain.js`), continuing until the chain covers the basic real-life situations for that language. There's no hand-authored fixed list to exhaust.

Within a scenario, the target word set **grows** rather than being fixed (`node/lib/graph/growth.js`):

- Starts at 3–4 words (`MIN_TARGET_WORDS = 3`), never above the situation's cap.
- Grows by small steps (2 words) once you've used ≥75% of the current set — small nudges, never a wall of new vocabulary.
- Caps adaptively per situation (`MAX_TARGET_WORDS = 8`), sized to how many words a tourist essentially needs *there* and how fast you're moving (a quick player earns a slightly higher ceiling).
- Is **complete** only when the set has grown to its cap *and* every word in it has been used correctly — that, behind an evaluator-confirmed pass, is the single trigger for recording completion.

This replaces the old hard "4 words, use one of them" model with something that stays elementary for a struggling player and stretches for a fast one.

### The evaluator: what "passing" means

A turn passes only when your spoken reply is **all three** of (`node/lib/ai/`):

1. **Contextually meaningful** — a real, appropriate answer to what the NPC actually asked. A bare word fails. A filler sentence that merely *contains* the target word fails.
2. **Grammatically correct** for that language and register (minor accent/transcription noise is forgiven; broken structure isn't).
3. **Using the target vocab correctly** in that sentence.

Bare-word answers are caught deterministically before any model call. On failure, the evaluator returns an *error kind* (`off-topic` / `too-vague` / `bare-word` / `grammar` / `wrong-word` / `wrong-register`) and a teaching note voiced by your sidekick that points at the fix without spoon-feeding the answer. Only words that appear in the scenario's actual target set can be credited, and a pass is the *only* thing that updates your FSRS state, writes to your word memory, and — when the scenario's goal is met — records completion.

The model layer is a **fallback chain**, not a single call: it tries Cerebras, then Groq, then Gemini, advancing only on rate-limit/outage errors (never on a prompt bug, which would fail identically everywhere). If every provider is exhausted, the route returns a clean "the guide needs a breather, try again" instead of a raw error.

### The word graph (your living forest)

Your progress is a **forest**, mirrored into Postgres so it renders fast and never blocks on the memory service:

- **root → tree per situation-superset → word.** Words hang under supersets like "food & stuff" (street-market, restaurant, pastry-shop, grocery all under one canopy), expanding toward the full language.
- Each word node carries a **mastery tier** (0 = encountered, 1 = used once, 2 = recurring, 3 = mastered) that colors it in the 3D constellation view, plus its superset and when it was last used.
- Node positions come from a **PCA projection** of the word embeddings, so semantically related words sit near each other in space — the graph's *shape* reflects meaning, not just a tidy layout.

Per-user learning memory lives in **Supermemory**, scoped strictly per user (`containerTag = user_<uuid>`), which tracks mastered vocab, the current learning cycle, and — via its notion of what's gone quiet — **stale words** that haven't been used in a while, so the scenario generator can resurface them naturally. The FSRS scheduling math and everything the graph view needs are mirrored into Postgres; the graph endpoint reads only from there.

---

## Architecture at a glance

- **Frontend** (`client/`) — React 19, Vite 8, Tailwind 4, Three.js 0.184 (globe + word constellation), d3, Supabase JS. The globe and land geometry live in `LandingPage.jsx` / `assets/landPolygons.js`; the scenario flow runs `ScenarioRunner → InputPhase → GameplayPhase`; the mic is `MicrophoneRecorder.jsx`; the forest view is `WordConstellation3D.jsx`; character theming is `countryTheme.js`.
- **Backend** (`node/`) — Node ≥22.12 (ESM), Express 5, the Vercel `ai` SDK, Deepgram, `fsrs.js`, `ws`. Routes stay thin (`routes/scenario.js`, `routes/profile.js`, `routes/voice.js`); the real work lives in `lib/` — dialog + evaluation in `lib/ai/`, discovery/chaining/growth in `lib/graph/`, spaced repetition in `lib/srs/`, the Supermemory forest behind `lib/memory/forest.js`.
- **Database** — Supabase Postgres with Row-Level Security on every user-scoped table. **The economy is server-authoritative through `SECURITY DEFINER` RPCs**: unlocking a country, recording a completion, and claiming a reward are all Postgres functions that check auth, validate inputs against the catalog, mutate atomically, and return server truth. The client may *call* an RPC; it may never compute a balance, an XP delta, an unlock, or a reward. Completion-recording is service-role-only and reachable solely through the server evaluator.

The whole thing serves from a single origin (API + WebSocket + built client) and is deployed on Railway.
