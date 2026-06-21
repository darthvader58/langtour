-- New-user invariant:
--   tokens = 100
--   country_unlocks rows = 0
-- Every country, including China, remains locked until the user chooses one
-- and pays the normal 100-token unlock cost.

alter table public.profiles alter column tokens set default 100;

-- Legacy cleanup only: an older trigger created untouched accounts with China
-- already unlocked. DELETE that old unlock; this does not grant China. Accounts
-- with real gameplay progress or another unlocked country remain unchanged.
delete from public.country_unlocks as unlock
where unlock.country_code = 'china'
  and exists (
    select 1 from public.profiles profile
    where profile.user_id = unlock.user_id and profile.tokens in (0, 100)
  )
  and not exists (
    select 1 from public.country_unlocks other_unlock
    where other_unlock.user_id = unlock.user_id
      and other_unlock.country_code <> 'china'
  )
  and not exists (
    select 1 from public.scenario_completions completion
    where completion.user_id = unlock.user_id
  )
  and not exists (
    select 1 from public.country_reward_claims claim
    where claim.user_id = unlock.user_id
  );

update public.profiles as profile
set tokens = 100
where profile.tokens = 0
  and not exists (
    select 1 from public.country_unlocks unlock
    where unlock.user_id = profile.user_id
  )
  and not exists (
    select 1 from public.scenario_completions completion
    where completion.user_id = profile.user_id
  )
  and not exists (
    select 1 from public.country_reward_claims claim
    where claim.user_id = profile.user_id
  );

-- Signup creates only the profile balance. It deliberately does not insert a
-- row into country_unlocks.
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
      100,
      (select id from public.levels where code = 'level-1'),
      (select id from public.ranks where code = 'rookie')
    )
    on conflict (user_id) do nothing;

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

-- Country selection always costs 100 tokens. The price is enforced here, not
-- trusted from the browser. With zero current unlocks, any catalog country is
-- eligible as the user's first choice.
create or replace function public.unlock_country_for_user(p_country_code text, p_cost bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  normalized_country text := lower(trim(p_country_code));
  new_balance bigint;
  unlocked text[];
  unclaimed_count integer;
begin
  if uid is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_cost <> 100 then
    raise exception 'Country unlocks cost 100 tokens' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.game_countries where code = normalized_country
  ) then
    raise exception 'Unknown country' using errcode = '22023';
  end if;

  select count(*) into unclaimed_count
  from public.country_unlocks current_unlock
  left join public.country_reward_claims reward_claim
    on reward_claim.user_id = current_unlock.user_id
   and reward_claim.country_code = current_unlock.country_code
  where current_unlock.user_id = uid and reward_claim.user_id is null;

  if unclaimed_count > 0 then
    raise exception 'Finish your current country before unlocking a new one' using errcode = 'P0001';
  end if;

  update public.profiles
  set tokens = tokens - 100
  where user_id = uid and tokens >= 100
  returning tokens into new_balance;

  if new_balance is null then
    raise exception 'Insufficient tokens' using errcode = 'P0001';
  end if;

  insert into public.country_unlocks (user_id, country_code)
  values (uid, normalized_country)
  on conflict do nothing;

  select coalesce(array_agg(country_code order by unlocked_at), array[]::text[])
  into unlocked
  from public.country_unlocks
  where user_id = uid;

  return jsonb_build_object('tokens', new_balance, 'unlockedCountries', unlocked);
end;
$$;

-- A reset is equivalent to a brand-new account: 100 tokens and no country
-- selected. The player can then spend the balance on any one country.
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
  set tokens = 100,
      experience_points = 0,
      level_id = (select id from public.levels where code = 'level-1'),
      rank_id = (select id from public.ranks where code = 'rookie')
  where user_id = uid;
end;
$$;
