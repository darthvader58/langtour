-- Per-user FSRS state. The learning_words rows remain the shared dictionary;
-- per-user memory state lives in learning_user_word_progress so a reset only
-- forgets that user's progress, leaving the catalog and embeddings intact.

create table public.learning_user_word_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  word_id bigint not null references public.learning_words(id) on delete cascade,
  state integer not null default 0 check (state between 0 and 3),
  stability double precision not null default 0,
  difficulty double precision not null default 0,
  lapses integer not null default 0,
  reps integer not null default 0,
  last_review_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, word_id)
);

alter table public.learning_user_word_progress enable row level security;

create policy "Users can view their word progress"
  on public.learning_user_word_progress for select to authenticated
  using ((select auth.uid()) = user_id);

-- Add user scoping to review logs (nullable for the existing rows, but written
-- as the current uid on every new insert).
alter table public.learning_review_logs
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

create index if not exists learning_review_logs_user_word_idx
  on public.learning_review_logs (user_id, word_id, review_datetime desc);

alter table public.learning_review_logs enable row level security;

create policy "Users can view their review logs"
  on public.learning_review_logs for select to authenticated
  using ((select auth.uid()) = user_id);

-- Extend the existing reset RPC so it also wipes vocabulary memory for the user.
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

  insert into public.country_unlocks (user_id, country_code)
  values (uid, 'china')
  on conflict do nothing;
end;
$$;
