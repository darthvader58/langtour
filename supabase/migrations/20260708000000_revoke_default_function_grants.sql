-- Security hardening follow-up to 20260704000001 (S1) and 20260704000002 (S3).
--
-- Supabase sets ALTER DEFAULT PRIVILEGES so every new function in public gets
-- EXECUTE granted DIRECTLY to anon and authenticated — not only via PUBLIC.
-- Both prior migrations revoked from PUBLIC (or from authenticated only) and
-- assumed that closed the browser path; the direct default grants survived.
-- Verified on the live project (has_function_privilege, 2026-07-08):
--   - record_scenario_completion(uuid,text,text): anon and authenticated could
--     EXECUTE. The 3-arg version trusts p_user_id (auth.uid() is null under the
--     service role), so an authenticated browser call could record completions
--     without an evaluator pass — the exact S3 bypass, reopened by the grants.
--   - award_tokens(bigint): anon retained EXECUTE (runtime-safe: the body
--     raises without auth.uid(), but the grant is dead weight).
--
-- Purely subtractive; the only legitimate caller of completion is the backend
-- via the service role, which keeps its grant.

revoke execute on function public.record_scenario_completion(uuid, text, text) from anon, authenticated;
revoke execute on function public.award_tokens(bigint) from anon;
