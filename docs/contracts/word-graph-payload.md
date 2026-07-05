# Contract: /api/profile/word-graph forest extension

Status: FROZEN (Phase 4). backend-graph implements; frontend-story consumes.

Existing response fields (nodes with PCA coords, edges, missing count) stay byte-compatible. Additions, sourced from `learning_user_word_forest` (never from Supermemory — the endpoint must not call it):

- Each word node gains: `superset: string|null`, `masteryTier: number` (0–3, default 0), `lastUsedAt: ISO string|null`. Words absent from the mirror get `superset: null, masteryTier: 0, lastUsedAt: null`.
- Top-level addition: `trees: [{ superset: string, wordIds: [...] }]` — one entry per superset present for the user, for root → tree → word rendering.

Mastery tiers (display semantics): 0 = encountered, 1 = used once, 2 = recurring, 3 = mastered. The mirror's `mastery_tier` is authoritative; the endpoint does not recompute it.
