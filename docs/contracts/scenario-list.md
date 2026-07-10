# Contract: mission list — generated chain replaces the static tile list

Status: FROZEN 2026-07-09 (orchestrator). Fixes the two-sources-of-truth bug:
the client still renders the static gameData catalog (8 tiles, ids like
`cafe-terrace`) while the engine runs its own situation catalog
(`SUPERSET_TREES` in `node/lib/graph/chain.js` — ids like `greetings`,
`street-market`). The id namespaces never intersect, so the completed counter
is stuck at 0/8 and the CompletionScreen → `claim_country_reward` flow can
never trigger through normal play.

Owners: backend-graph implements the endpoint (route + db read); frontend-story
consumes it and rewires the client. Neither edits the other's files.

## New endpoint (backend-graph)

```
GET /api/scenario/list?countryCode=<iso2>     auth: Bearer (requireUser)

200 {
  scenarios: [            // this user's generated chain, ordered by position
    {
      scenarioId: string,      // engine id, e.g. 'street-market'
      title: string,           // from situationById(); fall back to scenarioId
      superset: string,
      position: number,
      completed: boolean,      // has a scenario_completions row for this user
      targetSize: number,      // current (growing) target size
      usedCount: number,       // used_word_ids length
      chainClosing: boolean    // this row carries chain_complete = true
    }
  ],
  nextAvailable: boolean,   // false once every catalog situation is generated
  totalSituations: number,  // engine catalog size (currently 15)
  countryComplete: boolean  // mirrors the claim_country_reward gate exactly:
                            // a chain_complete row exists AND every generated
                            // scenario has a completion row
}
400 { error: 'Unknown countryCode' }   // not in the COUNTRIES catalog
```

Rules:
- Read path only — no writes, no economy math. `countryComplete` is advisory
  UI state; the RPC re-checks server-side on claim (economy contract).
- Validate countryCode against the catalog like the other scenario routes.
- Completion truth comes from joining `scenario_completions`, the same tables
  the RPC gate reads — not from any client state.

## Client rewiring (frontend-story)

1. **Header truth** (`GameplayPhase.jsx`): the server's `firstTurn.situation.title`
   wins over the clicked tile's `scenario.title` (flip the `??` precedence).
   Icon: map superset → emoji client-side (server sends no icon);
   fall back to 🗺️.
2. **Mission list** (`ScenariosPage.jsx`): render `GET /api/scenario/list`
   instead of the static `scenariosByCountry` catalog. Completed and
   in-progress missions come from `scenarios[]`; when `nextAvailable`, show
   one "Next Mission" card that starts `ScenarioRunner` with no scenarioId
   (the chain plans it — ScenarioRunner must skip its resume request when the
   scenario prop has no id). Counter reads
   `<completed>/<scenarios.length>` discovered missions, with `totalSituations`
   available as the horizon if the design wants it. Static gameData scenario
   lists stop feeding this page (they remain for vocab/character data
   elsewhere); the special-scenario tile goes away with them — it's
   unreachable in engine ids and blocks nothing (the claim gate never
   references it).
3. **Country completion** (`App.jsx`): replace the static
   `scenarioIdsForCountry(...).every(...)` check with `countryComplete` from
   the list response (refetch after a scenario ends). Only a
   `countryComplete: true` may show `CompletionScreen` / trigger the claim
   call — same invariant as before, new source of truth.

## Invariants preserved

- Completion is still recorded only by the server evaluator path; this change
  is display + claim-trigger plumbing, no new mutation paths.
- The claim RPC remains the enforcement point; a forged `countryComplete`
  renders a screen but cannot mint tokens.
