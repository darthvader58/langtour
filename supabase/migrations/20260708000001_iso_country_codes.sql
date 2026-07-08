-- Normalize country codes to the catalog's ISO-2 convention (gameData.js `code`).
--
-- The runtime seeder (node/lib/db/db.js initializeDatabase) wrote
-- game_countries.code as lowercased English names ('france'), and the legacy
-- client flows (unlock/claim) sent the same. The forward-chaining engine
-- validates and writes catalog ISO-2 codes ('fr'), so its
-- user_generated_scenarios insert broke on the game_countries FK in production.
-- One convention must win: ISO-2, the catalog key the route layer validates
-- against. The seeder and client call sites are fixed in the same change; this
-- migration remaps existing data 1:1 (bijective, reversible by the inverse map).
-- Idempotent: rows already in ISO form match no old_code and no-op.

alter table public.game_scenarios drop constraint game_scenarios_country_code_fkey;
alter table public.user_generated_scenarios drop constraint user_generated_scenarios_country_code_fkey;
alter table public.country_reward_claims drop constraint country_reward_claims_country_code_fkey;

do $$
declare
  t text;
begin
  foreach t in array array[
    'game_scenarios', 'scenario_catalog', 'country_rewards', 'country_unlocks',
    'country_reward_claims', 'scenario_completions', 'user_generated_scenarios'
  ] loop
    execute format($f$
      update public.%I s set country_code = m.new_code
      from (values ('china','cn'),('india','in'),('france','fr'),
                   ('mexico','mx'),('egypt','eg'),('brazil','br')) m(old_code, new_code)
      where s.country_code = m.old_code
    $f$, t);
  end loop;
end $$;

update public.game_countries g set code = m.new_code
from (values ('china','cn'),('india','in'),('france','fr'),
             ('mexico','mx'),('egypt','eg'),('brazil','br')) m(old_code, new_code)
where g.code = m.old_code;

alter table public.game_scenarios
  add constraint game_scenarios_country_code_fkey
  foreign key (country_code) references public.game_countries(code) on delete cascade;
alter table public.user_generated_scenarios
  add constraint user_generated_scenarios_country_code_fkey
  foreign key (country_code) references public.game_countries(code) on delete cascade;
alter table public.country_reward_claims
  add constraint country_reward_claims_country_code_fkey
  foreign key (country_code) references public.country_rewards(country_code);
