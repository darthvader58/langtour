-- Persist gameplay progression and derive levels/ranks from earned XP.

insert into public.levels (code, name, minimum_xp, display_order)
values
  ('level-1', 'Level 1', 0, 1),
  ('level-2', 'Level 2', 200, 2),
  ('level-3', 'Level 3', 400, 3),
  ('level-4', 'Level 4', 600, 4),
  ('level-5', 'Level 5', 800, 5)
on conflict (code) do update set
  name = excluded.name,
  minimum_xp = excluded.minimum_xp,
  display_order = excluded.display_order;

insert into public.ranks (code, name, minimum_xp, display_order)
values
  ('rookie', 'Rookie', 0, 1),
  ('explorer', 'Explorer', 300, 2),
  ('navigator', 'Navigator', 600, 3),
  ('polyglot', 'Polyglot', 800, 4)
on conflict (code) do update set
  name = excluded.name,
  minimum_xp = excluded.minimum_xp,
  display_order = excluded.display_order;

create table public.scenario_catalog (
  country_code text not null,
  scenario_id text not null,
  experience_reward bigint not null default 100 check (experience_reward >= 0),
  is_active boolean not null default true,
  primary key (country_code, scenario_id)
);

insert into public.scenario_catalog (country_code, scenario_id)
values
  ('china', 'street-market'),
  ('china', 'restaurant'),
  ('china', 'train-station'),
  ('china', 'taxi-ride'),
  ('china', 'hotel-checkin'),
  ('china', 'newspaper-reading'),
  ('china', 'business-meeting'),
  ('china', 'politician-speech')
on conflict (country_code, scenario_id) do nothing;

create table public.scenario_completions (
  user_id uuid not null references auth.users(id) on delete cascade,
  country_code text not null,
  scenario_id text not null,
  completed_at timestamptz not null default now(),
  primary key (user_id, country_code, scenario_id),
  foreign key (country_code, scenario_id)
    references public.scenario_catalog(country_code, scenario_id)
);

create table public.country_rewards (
  country_code text primary key,
  required_scenarios smallint not null check (required_scenarios > 0),
  token_reward bigint not null check (token_reward >= 0)
);

insert into public.country_rewards (country_code, required_scenarios, token_reward)
values ('china', 8, 150)
on conflict (country_code) do update set
  required_scenarios = excluded.required_scenarios,
  token_reward = excluded.token_reward;

create table public.country_reward_claims (
  user_id uuid not null references auth.users(id) on delete cascade,
  country_code text not null references public.country_rewards(country_code),
  claimed_at timestamptz not null default now(),
  primary key (user_id, country_code)
);

alter table public.scenario_catalog enable row level security;
alter table public.scenario_completions enable row level security;
alter table public.country_rewards enable row level security;
alter table public.country_reward_claims enable row level security;

create policy "Authenticated users can view scenario catalog"
  on public.scenario_catalog for select to authenticated using (is_active);
create policy "Users can view their scenario completions"
  on public.scenario_completions for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Authenticated users can view country rewards"
  on public.country_rewards for select to authenticated using (true);
create policy "Users can view their country reward claims"
  on public.country_reward_claims for select to authenticated
  using ((select auth.uid()) = user_id);

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
  reward bigint;
  inserted_count integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select experience_reward into reward
  from public.scenario_catalog
  where country_code = lower(p_country_code)
    and scenario_id = p_scenario_id
    and is_active;

  if reward is null then
    raise exception 'Unknown scenario' using errcode = '22023';
  end if;

  insert into public.scenario_completions (user_id, country_code, scenario_id)
  values ((select auth.uid()), lower(p_country_code), p_scenario_id)
  on conflict do nothing;
  get diagnostics inserted_count = row_count;

  if inserted_count = 0 then
    return false;
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
  where p.user_id = (select auth.uid());

  return true;
end;
$$;

create or replace function public.claim_country_reward(p_country_code text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  reward public.country_rewards%rowtype;
  completed_count bigint;
  inserted_count integer;
  new_balance bigint;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select * into reward from public.country_rewards
  where country_code = lower(p_country_code);
  if not found then
    raise exception 'Unknown country reward' using errcode = '22023';
  end if;

  select count(*) into completed_count
  from public.scenario_completions
  where user_id = (select auth.uid())
    and country_code = lower(p_country_code);
  if completed_count < reward.required_scenarios then
    raise exception 'Country is not complete' using errcode = 'P0001';
  end if;

  insert into public.country_reward_claims (user_id, country_code)
  values ((select auth.uid()), lower(p_country_code))
  on conflict do nothing;
  get diagnostics inserted_count = row_count;

  if inserted_count > 0 then
    update public.profiles
    set tokens = tokens + reward.token_reward
    where user_id = (select auth.uid());
  end if;

  select tokens into new_balance from public.profiles
  where user_id = (select auth.uid());
  return new_balance;
end;
$$;

revoke all on function public.record_scenario_completion(text, text) from public;
revoke all on function public.claim_country_reward(text) from public;
grant execute on function public.record_scenario_completion(text, text) to authenticated;
grant execute on function public.claim_country_reward(text) to authenticated;

update public.profiles p
set level_id = coalesce(p.level_id, (select id from public.levels where code = 'level-1')),
    rank_id = coalesce(p.rank_id, (select id from public.ranks where code = 'rookie'));

-- Ensure accounts created after this migration start at Level 1 / Rookie.
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
