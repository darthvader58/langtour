-- Per-turn economy grants. Two changes shipped together because they form one
-- contract: the per-turn RPC takes over XP/token awards, and the existing
-- record_scenario_completion is refitted to a summary-only marker.
--
-- New design:
--   * scenario_turn_grants is a ledger keyed (user_id, scenario_id, turn_index).
--   * record_scenario_turn(country, scenario, turn_index, used_word_ids)
--     re-derives the award server-side: xp = 5 * len, tokens = 1 * len.
--     Owner-ratified rates are baked into the RPC; the client never sends them.
--   * record_scenario_completion no longer awards XP or tokens — those were
--     already credited per turn. It only stamps idempotent completion and
--     leaves the existing claim_country_reward path untouched.
--   * forest_edges mirrors the Supermemory vocab-forest so /api/profile/word-graph
--     can render without a Supermemory round-trip.
--
-- Anti-cheat invariants enforced inside the RPC:
--   * auth.uid() must be non-null (28000).
--   * Country and scenario must exist in the catalog (22023).
--   * Country must be unlocked for the caller (P0001 if not).
--   * Every used_word_id must exist in learning_words AND the user must have a
--     learning_user_word_progress row for it. This rejects fabricated IDs and
--     IDs the user never actually encountered through normal play.
--   * Duplicate (user_id, scenario_id, turn_index) is a no-op: the second call
--     returns the prior grant unchanged. True idempotency, not "award again".

-- 1. Ledger table.
create table public.scenario_turn_grants (
  user_id uuid not null references auth.users(id) on delete cascade,
  scenario_id text not null,
  turn_index integer not null check (turn_index >= 0),
  country_code text not null,
  used_word_ids bigint[] not null default array[]::bigint[],
  xp_awarded integer not null default 0 check (xp_awarded >= 0),
  tokens_awarded integer not null default 0 check (tokens_awarded >= 0),
  created_at timestamptz not null default now(),
  primary key (user_id, scenario_id, turn_index),
  foreign key (country_code, scenario_id)
    references public.scenario_catalog(country_code, scenario_id)
);

create index scenario_turn_grants_user_country_idx
  on public.scenario_turn_grants (user_id, country_code, scenario_id);

alter table public.scenario_turn_grants enable row level security;

create policy "Users can view their scenario turn grants"
  on public.scenario_turn_grants for select to authenticated
  using ((select auth.uid()) = user_id);

-- No insert/update/delete policies: writes flow only through the SECURITY
-- DEFINER RPC below.

-- 2. forest_edges mirror (contract 01). Server-only writes; user can read own.
--    The write path is owned by `supermemory` (T-A) via the helper at
--    `node/lib/supermemory/forest.js`, invoked after every Supermemory upsert.
create table public.forest_edges (
  user_id uuid not null references auth.users(id) on delete cascade,
  parent_id text not null,
  child_id text not null,
  kind text not null check (kind in ('root', 'superset', 'situation', 'word')),
  last_seen_at timestamptz not null default now(),
  primary key (user_id, parent_id, child_id)
);

create index forest_edges_user_kind_idx
  on public.forest_edges (user_id, kind);

alter table public.forest_edges enable row level security;

create policy "Users can view their forest edges"
  on public.forest_edges for select to authenticated
  using ((select auth.uid()) = user_id);

-- 3. The per-turn grant RPC.
--
-- Rates are server-tuned constants. Surfacing them as function locals (not
-- table-driven) keeps the contract small: the only way to change a rate is a
-- migration, which is exactly the audit boundary we want.
create or replace function public.record_scenario_turn(
  p_country_code text,
  p_scenario_id text,
  p_turn_index integer,
  p_used_word_ids bigint[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  normalized_country text := lower(trim(p_country_code));
  per_word_xp constant integer := 5;
  per_word_tokens constant integer := 1;
  dedup_word_ids bigint[];
  word_count integer;
  derived_xp integer;
  derived_tokens integer;
  existing public.scenario_turn_grants%rowtype;
  inserted_count integer;
  unknown_word_count integer;
  current_tokens bigint;
  current_xp bigint;
  current_level smallint;
  current_rank smallint;
begin
  if uid is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_turn_index is null or p_turn_index < 0 then
    raise exception 'Turn index must be a non-negative integer' using errcode = '22023';
  end if;
  if normalized_country is null or normalized_country = '' then
    raise exception 'Country code is required' using errcode = '22023';
  end if;
  if p_scenario_id is null or btrim(p_scenario_id) = '' then
    raise exception 'Scenario id is required' using errcode = '22023';
  end if;

  -- Country must exist in the catalog.
  if not exists (
    select 1 from public.game_countries where code = normalized_country
  ) then
    raise exception 'Unknown country' using errcode = '22023';
  end if;

  -- Scenario must exist in the active catalog for this country. This single
  -- check covers both the scenario existence and the (country, scenario) pair.
  if not exists (
    select 1 from public.scenario_catalog
    where country_code = normalized_country
      and scenario_id = p_scenario_id
      and is_active
  ) then
    raise exception 'Unknown scenario' using errcode = '22023';
  end if;

  -- Country must be unlocked for this user. Without this the client could
  -- earn from a country they never paid 100 tokens to enter.
  if not exists (
    select 1 from public.country_unlocks
    where user_id = uid and country_code = normalized_country
  ) then
    raise exception 'Country is not unlocked' using errcode = 'P0001';
  end if;

  -- Idempotency check first. If a grant already exists for this key, return
  -- the prior row's award unchanged — no extra credit, no error.
  select * into existing
  from public.scenario_turn_grants
  where user_id = uid
    and scenario_id = p_scenario_id
    and turn_index = p_turn_index;
  if found then
    select tokens, experience_points, level_id, rank_id
      into current_tokens, current_xp, current_level, current_rank
    from public.profiles where user_id = uid;
    return jsonb_build_object(
      'tokens', current_tokens,
      'xp', current_xp,
      'level', current_level,
      'rank', current_rank,
      'xpAwarded', existing.xp_awarded,
      'tokensAwarded', existing.tokens_awarded,
      'awarded', false
    );
  end if;

  -- Dedupe + null-strip the input. The RPC is the trust boundary; even if the
  -- caller (the evaluator route) already deduplicates, a malicious or buggy
  -- caller passing [101, 101, 101] must not inflate the award. The ledger
  -- column also stores the deduplicated array so the audit trail reflects
  -- exactly what was credited.
  select coalesce(array_agg(distinct wid), array[]::bigint[])
    into dedup_word_ids
  from unnest(coalesce(p_used_word_ids, array[]::bigint[])) as wid
  where wid is not null;

  word_count := coalesce(array_length(dedup_word_ids, 1), 0);

  -- Validate every word id: the user must have a per-user progress row for it
  -- (i.e. they actually encountered it through normal play). The
  -- learning_user_word_progress.word_id column FKs to learning_words(id), so
  -- the FK already enforces dictionary existence — no extra join needed.
  if word_count > 0 then
    select count(*) into unknown_word_count
    from unnest(dedup_word_ids) as wid
    where not exists (
      select 1 from public.learning_user_word_progress p
      where p.user_id = uid and p.word_id = wid
    );
    if unknown_word_count > 0 then
      raise exception 'Unknown or unattested word' using errcode = '22023';
    end if;
  end if;

  derived_xp := per_word_xp * word_count;
  derived_tokens := per_word_tokens * word_count;

  -- Insert the grant. on conflict do nothing handles a concurrent racing
  -- caller (defence in depth alongside the explicit select-then-insert above).
  insert into public.scenario_turn_grants
    (user_id, scenario_id, turn_index, country_code, used_word_ids,
     xp_awarded, tokens_awarded)
  values
    (uid, p_scenario_id, p_turn_index, normalized_country, dedup_word_ids,
     derived_xp, derived_tokens)
  on conflict (user_id, scenario_id, turn_index) do nothing;
  get diagnostics inserted_count = row_count;

  if inserted_count = 0 then
    -- Lost a race to a concurrent caller; behave like the idempotent branch.
    select * into existing
    from public.scenario_turn_grants
    where user_id = uid
      and scenario_id = p_scenario_id
      and turn_index = p_turn_index;
    select tokens, experience_points, level_id, rank_id
      into current_tokens, current_xp, current_level, current_rank
    from public.profiles where user_id = uid;
    return jsonb_build_object(
      'tokens', current_tokens,
      'xp', current_xp,
      'level', current_level,
      'rank', current_rank,
      'xpAwarded', existing.xp_awarded,
      'tokensAwarded', existing.tokens_awarded,
      'awarded', false
    );
  end if;

  -- Atomic credit + level/rank recompute, matching the pattern already in
  -- record_scenario_completion (pre-refit).
  update public.profiles p
  set tokens = p.tokens + derived_tokens,
      experience_points = p.experience_points + derived_xp,
      level_id = (
        select l.id from public.levels l
        where l.is_active and l.minimum_xp <= p.experience_points + derived_xp
        order by l.minimum_xp desc limit 1
      ),
      rank_id = (
        select r.id from public.ranks r
        where r.is_active and r.minimum_xp <= p.experience_points + derived_xp
        order by r.minimum_xp desc limit 1
      )
  where p.user_id = uid
  returning p.tokens, p.experience_points, p.level_id, p.rank_id
    into current_tokens, current_xp, current_level, current_rank;

  return jsonb_build_object(
    'tokens', current_tokens,
    'xp', current_xp,
    'level', current_level,
    'rank', current_rank,
    'xpAwarded', derived_xp,
    'tokensAwarded', derived_tokens,
    'awarded', true
  );
end;
$$;

revoke all on function public.record_scenario_turn(text, text, integer, bigint[]) from public;
grant execute on function public.record_scenario_turn(text, text, integer, bigint[]) to authenticated;

-- 4. Refit record_scenario_completion to summary-only. Keeps the boolean
--    return type so the existing client caller (useProfile.completeScenario)
--    is untouched. Per-turn grants now own all XP/token awards; this RPC
--    just stamps an idempotent completion marker.
create or replace function public.record_scenario_completion(
  p_country_code text,
  p_scenario_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  normalized_country text := lower(trim(p_country_code));
  inserted_count integer;
begin
  if uid is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.scenario_catalog
    where country_code = normalized_country
      and scenario_id = p_scenario_id
      and is_active
  ) then
    raise exception 'Unknown scenario' using errcode = '22023';
  end if;

  insert into public.scenario_completions (user_id, country_code, scenario_id)
  values (uid, normalized_country, p_scenario_id)
  on conflict do nothing;
  get diagnostics inserted_count = row_count;

  return inserted_count > 0;
end;
$$;

revoke all on function public.record_scenario_completion(text, text) from public;
grant execute on function public.record_scenario_completion(text, text) to authenticated;
