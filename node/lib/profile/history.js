export function shapeProfileHistory({
  authUser,
  profile,
  levels = [],
  ranks = [],
  unlocks = [],
  countryCatalog = [],
  completions = [],
  scenarioCatalog = [],
  rewardClaims = [],
}) {
  const metadata = authUser?.user_metadata ?? {};
  const level = levels.find((row) => Number(row.id) === Number(profile?.level_id)) ?? null;
  const rank = ranks.find((row) => Number(row.id) === Number(profile?.rank_id)) ?? null;
  const countryByCode = new Map(countryCatalog.map((row) => [row.code, row]));
  const scenarioById = new Map(scenarioCatalog.map((row) => [row.id, row]));

  const countryUnlocks = unlocks.map((unlock) => {
    const country = countryByCode.get(unlock.country_code);
    return {
      countryCode: unlock.country_code,
      name: country?.name ?? unlock.country_code,
      flag: country?.flag ?? '',
      unlockedAt: unlock.unlocked_at,
      character: country ? {
        type: country.character_type,
        icon: country.character_icon,
        story: country.character_story,
        gradient: country.character_gradient,
      } : null,
    };
  });

  const scenarioCompletions = completions.map((completion) => {
    const scenario = scenarioById.get(completion.scenario_id);
    return {
      countryCode: completion.country_code,
      scenarioId: completion.scenario_id,
      title: scenario?.title ?? completion.scenario_id,
      icon: scenario?.icon ?? '',
      description: scenario?.description ?? '',
      isSpecial: Boolean(scenario?.is_special),
      completedAt: completion.completed_at,
    };
  });

  return {
    profile: {
      userId: authUser?.id ?? profile?.user_id ?? null,
      email: authUser?.email ?? null,
      name: metadata.full_name || metadata.name || authUser?.email?.split('@')[0] || 'Explorer',
      avatarUrl: metadata.avatar_url || metadata.picture || null,
      memberSince: profile?.created_at ?? authUser?.created_at ?? null,
      tokens: Number(profile?.tokens) || 0,
      experiencePoints: Number(profile?.experience_points) || 0,
      level: level ? { id: level.id, code: level.code, name: level.name, minimumXp: Number(level.minimum_xp) || 0 } : null,
      rank: rank ? { id: rank.id, code: rank.code, name: rank.name, minimumXp: Number(rank.minimum_xp) || 0 } : null,
    },
    countryUnlocks,
    scenarioCompletions,
    countryRewardClaims: rewardClaims.map((claim) => ({
      countryCode: claim.country_code,
      claimedAt: claim.claimed_at,
    })),
  };
}
