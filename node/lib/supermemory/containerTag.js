// Single source of truth for the per-user Supermemory container tag scheme.
// Contract: /Users/shashwatraj/langtour-memory/contracts/01-supermemory-forest.md
//   containerTag = `user_<uuid>` where <uuid> is the Supabase auth.users.id.
// Container isolation is an anti-cheat invariant: never derive a tag from
// anything other than a validated user id, and never accept a pre-built tag
// string from the client.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Builds the Supermemory containerTag for a given Supabase user id.
 * @param {string} userId - Supabase auth.users.id (UUID).
 * @returns {string} `user_<uuid>`
 * @throws {Error} if userId is not a well-formed UUID.
 */
export function userTag(userId) {
  if (typeof userId !== 'string' || !UUID_RE.test(userId)) {
    throw new Error(`userTag: expected a UUID, got ${JSON.stringify(userId)}`);
  }
  return `user_${userId}`;
}

/**
 * True if the given string is a well-formed `user_<uuid>` container tag.
 * @param {string} tag
 * @returns {boolean}
 */
export function isUserTag(tag) {
  if (typeof tag !== 'string' || !tag.startsWith('user_')) return false;
  return UUID_RE.test(tag.slice('user_'.length));
}
