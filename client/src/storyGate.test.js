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
  it('is true when any of the country scenario ids has been completed', () => {
    expect(hasEngagedCountry(['street-market'], ['street-market', 'restaurant'])).toBe(true)
  })

  it('is false when none of the country scenario ids have been completed', () => {
    expect(hasEngagedCountry(['chai-stall'], ['street-market', 'restaurant'])).toBe(false)
  })
})

describe('shouldShowArrivalStory', () => {
  it('is false with no selected country', () => {
    expect(shouldShowArrivalStory({ country: null })).toBe(false)
  })

  it('is false once already shown this session, even with no completions', () => {
    expect(shouldShowArrivalStory({
      country: 'China',
      storySeen: ['China'],
      completedScenarios: [],
      scenarioIdsForCountry: ['street-market'],
    })).toBe(false)
  })

  it('is false once the server shows a completion for that country, even in a fresh session', () => {
    expect(shouldShowArrivalStory({
      country: 'China',
      storySeen: [],
      completedScenarios: ['street-market'],
      scenarioIdsForCountry: ['street-market', 'restaurant'],
    })).toBe(false)
  })

  it('is true for an unseen, uncompleted country', () => {
    expect(shouldShowArrivalStory({
      country: 'China',
      storySeen: [],
      completedScenarios: [],
      scenarioIdsForCountry: ['street-market'],
    })).toBe(true)
  })
})
