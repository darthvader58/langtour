import test from 'node:test';
import assert from 'node:assert/strict';
import { shapeProfileHistory } from '../lib/profile/history.js';

test('shapeProfileHistory joins identity, progression, characters and timestamped history', () => {
  const result = shapeProfileHistory({
    authUser: { id: 'user-1', email: 'spy@example.com', created_at: '2026-01-01', user_metadata: { full_name: 'Lin', avatar_url: 'avatar.png' } },
    profile: { user_id: 'user-1', tokens: 125, experience_points: 300, level_id: 2, rank_id: 1, created_at: '2026-01-02' },
    levels: [{ id: 2, code: 'level-2', name: 'Level 2', minimum_xp: 200 }],
    ranks: [{ id: 1, code: 'rookie', name: 'Rookie', minimum_xp: 0 }],
    unlocks: [{ country_code: 'china', unlocked_at: '2026-02-01' }],
    countryCatalog: [{ code: 'china', name: 'China', flag: 'flag', character_type: 'Spy', character_icon: 'spy', character_story: 'story', character_gradient: 'gradient' }],
    completions: [{ country_code: 'china', scenario_id: 'market', completed_at: '2026-03-01' }],
    scenarioCatalog: [{ id: 'market', title: 'Street Market', icon: 'market', description: 'Shop', is_special: false }],
    rewardClaims: [{ country_code: 'china', claimed_at: '2026-04-01' }],
  });
  assert.equal(result.profile.name, 'Lin');
  assert.equal(result.profile.tokens, 125);
  assert.equal(result.profile.level.code, 'level-2');
  assert.equal(result.countryUnlocks[0].character.type, 'Spy');
  assert.equal(result.scenarioCompletions[0].title, 'Street Market');
  assert.equal(result.countryRewardClaims[0].claimedAt, '2026-04-01');
});
