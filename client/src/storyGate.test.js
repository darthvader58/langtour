import { describe, expect, it } from 'vitest'
import { hasEngagedCountry, isFreshLangtourist, shouldShowArrivalStory } from './storyGate'

describe('isFreshLangtourist', () => {
  it('is true for a brand-new account with zero unlocks and completions', () => {
    expect(isFreshLangtourist({ unlockedCountries: [], completedScenarios: [] })).toBe(true)
    expect(isFreshLangtourist()).toBe(true)
  })

  it('is false once any country is unlocked or any scenario completed', () => {
    expect(isFreshLangtourist({ unlockedCountries: ['cn'], completedScenarios: [] })).toBe(false)
    expect(isFreshLangtourist({ unlockedCountries: [], completedScenarios: ['street-market'] })).toBe(false)
  })
})

describe('hasEngagedCountry', () => {
  it('is true when a completion row matches the country code', () => {
    expect(hasEngagedCountry([{ countryCode: 'cn', scenarioId: 'greetings' }], 'cn')).toBe(true)
  })

  it('is false when no completion row matches the country code', () => {
    expect(hasEngagedCountry([{ countryCode: 'fr', scenarioId: 'greetings' }], 'cn')).toBe(false)
  })

  // Engine scenario ids are shared across every country's chain, so a
  // same-id completion in a different country must never count.
  it('does not count a same-scenario-id completion from a different country', () => {
    expect(hasEngagedCountry([{ countryCode: 'fr', scenarioId: 'greetings' }], 'cn')).toBe(false)
    expect(hasEngagedCountry([
      { countryCode: 'fr', scenarioId: 'greetings' },
      { countryCode: 'in', scenarioId: 'greetings' },
    ], 'cn')).toBe(false)
  })

  it('is false without a country code', () => {
    expect(hasEngagedCountry([{ countryCode: 'cn', scenarioId: 'greetings' }], null)).toBe(false)
    expect(hasEngagedCountry([{ countryCode: 'cn', scenarioId: 'greetings' }])).toBe(false)
  })
})

describe('shouldShowArrivalStory', () => {
  it('is false with no selected country', () => {
    expect(shouldShowArrivalStory({ country: null, countryCode: 'cn' })).toBe(false)
  })

  it('is false once already shown this session, even with no completions', () => {
    expect(shouldShowArrivalStory({
      country: 'China',
      countryCode: 'cn',
      storySeen: ['China'],
      completions: [],
    })).toBe(false)
  })

  it('is false once the server shows a completion for that country, even in a fresh session', () => {
    expect(shouldShowArrivalStory({
      country: 'China',
      countryCode: 'cn',
      storySeen: [],
      completions: [{ countryCode: 'cn', scenarioId: 'street-market' }],
    })).toBe(false)
  })

  it('is true for an unseen, uncompleted country', () => {
    expect(shouldShowArrivalStory({
      country: 'China',
      countryCode: 'cn',
      storySeen: [],
      completions: [],
    })).toBe(true)
  })

  // The bug this fix closes: completing 'greetings' in France must not
  // suppress China's arrival beat just because the scenario id matches.
  it('is true for an uncompleted country even when the same scenario id was completed elsewhere', () => {
    expect(shouldShowArrivalStory({
      country: 'China',
      countryCode: 'cn',
      storySeen: [],
      completions: [{ countryCode: 'fr', scenarioId: 'greetings' }],
    })).toBe(true)
  })
})
