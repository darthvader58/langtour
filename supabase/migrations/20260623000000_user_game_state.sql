-- Per-user gameplay state. Replaces the global backend_user_state singleton and the
-- shared game_scenarios.status column with profile-scoped tables and RPCs.

create table public.country_unlocks (
  user_id uuid not null references auth.users(id) on delete cascade,
  country_code text not null,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, country_code)
);

alter table public.country_unlocks enable row level security;

create policy "Users can view their country unlocks"
  on public.country_unlocks for select to authenticated
  using ((select auth.uid()) = user_id);

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
begin
  if uid is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_cost < 0 then
    raise exception 'Cost cannot be negative' using errcode = '22023';
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

create or replace function public.award_tokens(p_amount bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  new_balance bigint;
begin
  if uid is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_amount <= 0 then
    raise exception 'Amount must be greater than zero' using errcode = '22023';
  end if;

  update public.profiles
  set tokens = tokens + p_amount
  where user_id = uid
  returning tokens into new_balance;

  return new_balance;
end;
$$;

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

  update public.profiles
  set tokens = 100,
      experience_points = 0,
      level_id = (select id from public.levels where code = 'level-1'),
      rank_id = (select id from public.ranks where code = 'rookie')
  where user_id = uid;

  insert into public.country_unlocks (user_id, country_code)
  values (uid, 'china')
  on conflict do nothing;
end;
$$;

revoke all on function public.unlock_country_for_user(text, bigint) from public;
revoke all on function public.award_tokens(bigint) from public;
revoke all on function public.reset_user_progress() from public;
grant execute on function public.unlock_country_for_user(text, bigint) to authenticated;
grant execute on function public.award_tokens(bigint) to authenticated;
grant execute on function public.reset_user_progress() to authenticated;

-- Auto-grant the starter country on profile creation.
create or replace function public.handle_auth_user_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.profiles (user_id, level_id, rank_id)
    values (
      new.id,
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

-- Backfill: every existing profile gets the starter country.
insert into public.country_unlocks (user_id, country_code)
select user_id, 'china' from public.profiles
on conflict do nothing;
