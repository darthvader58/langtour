-- Reset must also forget forward-chaining state. Without this, a stale
-- chain_complete = true row in user_generated_scenarios survives a reset and
-- would let a re-completed chain claim its country reward without the engine
-- regenerating (and re-closing) the chain. Extend reset_user_progress to delete
-- the caller's generated-scenario chain and word-forest mirror rows; everything
-- else is preserved verbatim from the current definition (20260628: reset lands
-- at 100 tokens, no country unlocked).

create or replace function public.reset_user_progress()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  delete from public.scenario_completions where user_id = uid;
  delete from public.country_reward_claims where user_id = uid;
  delete from public.country_unlocks where user_id = uid;
  delete from public.learning_user_word_progress where user_id = uid;
  delete from public.learning_review_logs where user_id = uid;
  delete from public.user_generated_scenarios where user_id = uid;
  delete from public.learning_user_word_forest where user_id = uid;

  update public.profiles
  set tokens = 100,
      experience_points = 0,
      level_id = (select id from public.levels where code = 'level-1'),
      rank_id = (select id from public.ranks where code = 'rookie')
  where user_id = uid;
end;
$$;

revoke all on function public.reset_user_progress() from public;
grant execute on function public.reset_user_progress() to authenticated;
