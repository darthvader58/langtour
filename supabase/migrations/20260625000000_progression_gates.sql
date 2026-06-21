-- Progression rules: start at 0 tokens (the starter country is "paid for" on signup),
-- and gate every subsequent country unlock on having claimed the reward for every
-- already-unlocked country.

-- New users start at 0 tokens. The starter country is granted by the same trigger
-- so the user effectively "spent" their initial budget on China.
create or replace function public.handle_auth_user_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.profiles (user_id, tokens, level_id, rank_id)
    values (
      new.id,
      0,
      (select id from public.levels where code = 'level-1'),
      (select id from public.ranks where code = 'rookie')
    )
    on conflict (user_id) do nothing;

    insert into public.country_unlocks (user_id, country_code)
    values (new.id, 'china')
    on conflict do nothing;

    if new.last_sign_in_at is not null then
      insert into public.login_history (user_id, logged_in_at, auth_provider)
      values (new.id, new.last_sign_in_at, new.raw_app_meta_data ->> 'provider');
    end if;
  elsif new.last_sign_in_at is distinct from old.last_sign_in_at
    and new.last_sign_in_at is not null then
    insert into public.login_history (user_id, logged_in_at, auth_provider)
    values (new.id, new.last_sign_in_at, new.raw_app_meta_data ->> 'provider');
  end if;

  return new;
end;
$$;

-- Reset also lands the user at 0 tokens with only the starter country unlocked.
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

  update public.profiles
  set tokens = 0,
      experience_points = 0,
      level_id = (select id from public.levels where code = 'level-1'),
      rank_id = (select id from public.ranks where code = 'rookie')
  where user_id = uid;

  insert into public.country_unlocks (user_id, country_code)
  values (uid, 'china')
  on conflict do nothing;
end;
$$;

-- A country can only be unlocked after every previously unlocked country has had
-- its reward claimed — i.e. all scenarios (regular + special) completed and the
-- reward acknowledged. This blocks skipping forward by simply earning tokens
-- elsewhere.
create or replace function public.unlock_country_for_user(p_country_code text, p_cost bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  new_balance bigint;
  unlocked text[];
  unclaimed_count integer;
begin
  if uid is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_cost < 0 then
    raise exception 'Cost cannot be negative' using errcode = '22023';
  end if;

  -- Every currently unlocked country must already have a reward claim recorded.
  select count(*) into unclaimed_count
  from public.country_unlocks cu
  left join public.country_reward_claims crc
    on crc.user_id = cu.user_id and crc.country_code = cu.country_code
  where cu.user_id = uid and crc.user_id is null;
  if unclaimed_count > 0 then
    raise exception 'Finish your current country before unlocking a new one' using errcode = 'P0001';
  end if;

  update public.profiles
  set tokens = tokens - p_cost
  where user_id = uid and tokens >= p_cost
  returning tokens into new_balance;

  if new_balance is null then
    raise exception 'Insufficient tokens' using errcode = 'P0001';
  end if;

  insert into public.country_unlocks (user_id, country_code)
  values (uid, lower(p_country_code))
  on conflict do nothing;

  select coalesce(array_agg(country_code order by unlocked_at), array[]::text[]) into unlocked
  from public.country_unlocks
  where user_id = uid;

  return jsonb_build_object('tokens', new_balance, 'unlockedCountries', unlocked);
end;
$$;
