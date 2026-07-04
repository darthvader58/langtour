-- Per-scenario progress state for the forward-chaining engine (growing word
-- targets). Pure state storage written by the backend (service role); no money
-- rule changes, no RPC changes. The existing select-own RLS policy on
-- user_generated_scenarios already covers reads, and there are still no user
-- write policies, so browser writes remain denied.

alter table public.user_generated_scenarios
  add column seed_word_ids jsonb not null default '[]'::jsonb,
  add column target_word_ids jsonb not null default '[]'::jsonb,
  add column used_word_ids jsonb not null default '[]'::jsonb,
  add column target_size smallint check (target_size is null or target_size > 0),
  add column adaptive_cap smallint check (adaptive_cap is null or adaptive_cap > 0);
