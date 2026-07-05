-- Security hardening (adversarial pass 2026-07, finding S3).
--
-- record_scenario_completion(text, text) derived the caller from auth.uid() and
-- was GRANTed to `authenticated`, so the browser could call it directly and mark
-- any scenario in its own generated chain complete WITHOUT ever speaking to the
-- evaluator — bypassing the core invariant that only a server-confirmed pass may
-- drive a completion. The RPC's only guard ("the scenario is in this user's
-- chain") is satisfiable by calling POST /api/scenario/generate, so grantng it to
-- `authenticated` cannot be safe: its integrity depends on "the backend called me
-- after an evaluator pass", which the DB cannot see.
--
-- Fix: completion moves off the user-JWT path onto a service-role-only RPC that
-- takes an explicit, server-supplied user id (auth.uid() is null under the
-- service role). The route calls it with the server-verified req.userId only
-- after evaluateResponse returns pass:true and the turn goal is met (or via the
-- admin-only skip, which is itself gated on ADMIN_EMAIL server-side). The old
-- 2-arg overload is dropped, which also drops its `authenticated` grant, so the
-- browser 2-arg call now fails with `function does not exist` / permission denied.
--
-- Economy invariants preserved: chain validation against user_generated_scenarios,
-- idempotent insert (no double XP on replay), fixed server-side XP (100), and the
-- level/rank recompute — all keyed on p_user_id instead of auth.uid().
--
-- Subtractive on the client surface; the only legitimate caller (the backend) is
-- migrated in the same change. Touches the economy surface: owner review before
-- `supabase db push`.

-- Drop the authenticated-callable 2-arg version (also revokes its grants).
drop function if exists public.record_scenario_completion(text, text);

-- Service-role-only completion. Same body as the former 2-arg version, keyed on
-- an explicit p_user_id supplied by the trusted backend rather than auth.uid().
create or replace function public.record_scenario_completion(
  p_user_id uuid,
  p_country_code text,
  p_scenario_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_country text := lower(trim(p_country_code));
  reward bigint := 100;  -- server-authoritative XP; matches the former catalog default
  inserted_count integer;
begin
  if p_user_id is null then
    raise exception 'User id required' using errcode = '22023';
  end if;

  -- Authorize against the user's own generated chain, not any static list.
  if not exists (
    select 1 from public.user_generated_scenarios ugs
    where ugs.user_id = p_user_id
      and ugs.country_code = normalized_country
      and ugs.scenario_id = p_scenario_id
  ) then
    raise exception 'Unknown scenario' using errcode = '22023';
  end if;

  insert into public.scenario_completions (user_id, country_code, scenario_id)
  values (p_user_id, normalized_country, p_scenario_id)
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
  where p.user_id = p_user_id;

  return true;
end;
$$;

-- Backend-only. Revoke the default PUBLIC execute (authenticated is a member of
-- PUBLIC) and grant execute solely to the service role. The browser can no longer
-- reach completion by any grant.
revoke all on function public.record_scenario_completion(uuid, text, text) from public;
grant execute on function public.record_scenario_completion(uuid, text, text) to service_role;

-- claim_country_reward is intentionally left unchanged. Its guards hold against a
-- hostile direct `authenticated` call: it derives uid := auth.uid() (no user-id
-- parameter to spoof), requires a service-role-written chain_complete = true row
-- (browser has no insert/update policy on user_generated_scenarios), requires
-- zero uncompleted generated scenarios, credits only the server-side token_reward,
-- and is idempotent via the country_reward_claims PK. With completion now
-- service-role-only, a direct claim still cannot succeed without genuine
-- evaluator-earned completions, so no change is needed here.
