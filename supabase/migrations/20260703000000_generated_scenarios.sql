-- Forward-chaining scenarios: a country's scenarios are no longer a static
-- catalog list but a per-user chain the engine generates as vocab is mastered.
-- This migration adds the per-user chain table, the forest mirror table, and
-- reworks completion/claim to be authorized against the generated chain instead
-- of public.scenario_catalog. Economy stays server-authoritative: every mutation
-- is a SECURITY DEFINER RPC (auth check -> catalog/chain validation -> atomic
-- update -> return server truth), with no negative balances and idempotent writes.

-- Per-user generated scenario chain. Rows are written ONLY by the backend
-- (service role, which bypasses RLS); the browser may read its own rows but can
-- never insert, update, or delete them. scenario_id is unique per (user,
-- country), not global, so two users can hold different chains for one country.
create table public.user_generated_scenarios (
  user_id uuid not null references auth.users(id) on delete cascade,
  country_code text not null references public.game_countries(code) on delete cascade,
  scenario_id text not null,
  superset text not null,
  position smallint not null,
  chain_complete boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, country_code, scenario_id)
);

-- Forest structure mirror for /api/profile/word-graph. Written in the same
-- server codepath that writes the Supermemory memory so the graph endpoint never
-- blocks on Supermemory. FSRS scheduling math stays in
-- learning_user_word_progress; this table only carries display placement.
create table public.learning_user_word_forest (
  user_id uuid not null references auth.users(id) on delete cascade,
  word_id bigint not null references public.learning_words(id) on delete cascade,
  superset text not null,
  mastery_tier smallint not null default 0,
  last_used_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, word_id)
);

alter table public.user_generated_scenarios enable row level security;
alter table public.learning_user_word_forest enable row level security;

-- Read-own-rows only. No insert/update/delete policy exists, so RLS denies every
-- browser write; the service role (backend) bypasses RLS and is the sole writer.
create policy "Users can view their generated scenarios"
  on public.user_generated_scenarios for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can view their word forest"
  on public.learning_user_word_forest for select to authenticated
  using ((select auth.uid()) = user_id);

-- scenario_completions was FK-bound to public.scenario_catalog(country_code,
-- scenario_id). Generated scenario ids are per-user and never live in that static
-- catalog, so the constraint would reject every forward-chained completion.
-- Drop it (by discovered name, no guessing) and rely on the RPC below to
-- authorize each completion against the user's own generated chain instead.
do $$
declare
  constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'public.scenario_completions'::regclass
    and confrelid = 'public.scenario_catalog'::regclass
    and contype = 'f'
  limit 1;

  if constraint_name is not null then
    execute format(
      'alter table public.scenario_completions drop constraint %I',
      constraint_name
    );
  end if;
end $$;

-- Completion is server-decided and per-user authorized. The route calls this only
-- after an evaluator-confirmed pass; here we additionally require that the
-- scenario id is one the engine actually generated for THIS user and country.
-- Idempotent insert, fixed server-side XP (generated scenarios carry no catalog
-- reward row), and the original level/rank recompute are all preserved.
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
  reward bigint := 100;  -- server-authoritative XP; matches the former catalog default
  inserted_count integer;
begin
  if uid is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  -- Authorize against the user's own generated chain, not any static list.
  if not exists (
    select 1 from public.user_generated_scenarios ugs
    where ugs.user_id = uid
      and ugs.country_code = normalized_country
      and ugs.scenario_id = p_scenario_id
  ) then
    raise exception 'Unknown scenario' using errcode = '22023';
  end if;

  insert into public.scenario_completions (user_id, country_code, scenario_id)
  values (uid, normalized_country, p_scenario_id)
  on conflict do nothing;
  get diagnostics inserted_count = row_count;

  if inserted_count = 0 then
    return false;  -- replay: already completed, no second XP award
  end if;

  update public.profiles p
  set experience_points = p.experience_points + reward,
      level_id = (
        select l.id from public.levels l
        where l.is_active and l.minimum_xp <= p.experience_points + reward
        order by l.minimum_xp desc limit 1
      ),
      rank_id = (
        select r.id from public.ranks r
        where r.is_active and r.minimum_xp <= p.experience_points + reward
        order by r.minimum_xp desc limit 1
      )
  where p.user_id = uid;

  return true;
end;
$$;

-- A country's reward is claimable only when the engine has marked the chain
-- complete (coverage target reached -> a chain_complete row) AND every generated
-- scenario in that chain is completed. Reward value stays the server-side
-- token_reward; never client-sent. Claim is idempotent.
create or replace function public.claim_country_reward(p_country_code text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  normalized_country text := lower(trim(p_country_code));
  reward public.country_rewards%rowtype;
  chain_done boolean;
  generated_count bigint;
  pending_count bigint;
  inserted_count integer;
  new_balance bigint;
begin
  if uid is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select * into reward from public.country_rewards
  where country_code = normalized_country;
  if not found then
    raise exception 'Unknown country reward' using errcode = '22023';
  end if;

  -- The engine must have closed the chain for this user+country.
  select exists (
    select 1 from public.user_generated_scenarios
    where user_id = uid
      and country_code = normalized_country
      and chain_complete
  ) into chain_done;
  if not chain_done then
    raise exception 'Country is not complete' using errcode = 'P0001';
  end if;

  select count(*) into generated_count
  from public.user_generated_scenarios
  where user_id = uid and country_code = normalized_country;

  -- Any generated scenario without a matching completion blocks the claim.
  select count(*) into pending_count
  from public.user_generated_scenarios ugs
  left join public.scenario_completions sc
    on sc.user_id = ugs.user_id
   and sc.country_code = ugs.country_code
   and sc.scenario_id = ugs.scenario_id
  where ugs.user_id = uid
    and ugs.country_code = normalized_country
    and sc.user_id is null;

  if generated_count = 0 or pending_count > 0 then
    raise exception 'Country is not complete' using errcode = 'P0001';
  end if;

  insert into public.country_reward_claims (user_id, country_code)
  values (uid, normalized_country)
  on conflict do nothing;
  get diagnostics inserted_count = row_count;

  if inserted_count > 0 then
    update public.profiles
    set tokens = tokens + reward.token_reward
    where user_id = uid;
  end if;

  select tokens into new_balance from public.profiles
  where user_id = uid;
  return new_balance;
end;
$$;

-- Keep the browser off the definer functions' default PUBLIC grant; only
-- authenticated callers may invoke them (create-or-replace preserves prior
-- grants, but re-issue for explicitness).
revoke all on function public.record_scenario_completion(text, text) from public;
revoke all on function public.claim_country_reward(text) from public;
grant execute on function public.record_scenario_completion(text, text) to authenticated;
grant execute on function public.claim_country_reward(text) to authenticated;
