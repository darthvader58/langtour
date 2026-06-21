-- Keep the starter economy consistent in databases that previously used the
-- "China is prepaid" rule (0 tokens + China already unlocked).

alter table public.profiles alter column tokens set default 100;

-- Only repair untouched accounts. Accounts with scenario progress, claimed
-- rewards, or another unlocked country retain their existing economy state.
delete from public.country_unlocks as unlock
where unlock.country_code = 'china'
  and exists (
    select 1 from public.profiles profile
    where profile.user_id = unlock.user_id and profile.tokens = 0
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

-- Reassert the current signup trigger in case the older migration was the last
-- one applied to the hosted database.
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
