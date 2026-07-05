-- Security hardening (adversarial pass 2026-07, finding S1).
--
-- award_tokens(p_amount) credits the caller's balance by a CLIENT-SENT amount,
-- guarded only by `p_amount > 0`, and is GRANTed to `authenticated`. Because the
-- browser holds an anon/publishable key plus the user's JWT, any signed-in user
-- can call `supabase.rpc('award_tokens', { p_amount: 999999999 })` straight from
-- the devtools console and mint unlimited LangCoins — a total break of the
-- server-authoritative economy. No server route and no client code path actually
-- invokes it (the `awardTokens` helper in client/src/hooks/useProfile.js is
-- exported but never called), so revoking client access changes zero legitimate
-- behaviour. The service role (backend) retains access but has no reason to use
-- it; if a legitimate server-authorized credit is ever needed it must be a NEW
-- definer RPC whose amount is re-derived server-side, never client-sent.
--
-- Subtractive, reversible, and touches no money rule for any real flow. Still,
-- because it alters the economy surface, the owner should review before
-- `supabase db push`.

revoke execute on function public.award_tokens(bigint) from authenticated;

-- spend_tokens(bigint) is a pure debit (cannot mint, cannot go negative) and is
-- likewise unused by any current flow. It is left callable — it is not a hole —
-- but flagged here so a future audit knows it is dead code, not load-bearing.
