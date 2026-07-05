import { describe, expect, it } from 'vitest'
import { CHARACTERS } from './gameData'
import { FRAMING_NARRATIVE, getArrivalStory, getSidekick, SIDEKICKS } from './storyData'

describe('storyData', () => {
  it('gives every catalog character a characterId that resolves to a sidekick', () => {
    for (const [country, character] of Object.entries(CHARACTERS)) {
      expect(character.characterId, `${country} missing characterId`).toBeTruthy()
      expect(getSidekick(character.characterId), `${country} sidekick missing`).toBeTruthy()
    }
  })

  it('keeps the Brazil story softened to art-smuggling, not a cartel', () => {
    expect(CHARACTERS.Brazil.story).not.toMatch(/cartel/i)
    expect(CHARACTERS.Brazil.story).toMatch(/smuggling ring/i)
  })

  it('builds an arrival story with the country disguise and its sidekick tagline', () => {
    const arrival = getArrivalStory('China')
    expect(arrival.character.type).toBe('Spy')
    expect(arrival.sidekick.name).toBe('Wren')
    expect(arrival.beats.some((beat) => beat.includes('Wren'))).toBe(true)
    expect(arrival.beats.some((beat) => beat.includes(SIDEKICKS['shanghai-spy'].tagline))).toBe(true)
  })

  it('returns null for a country with no catalog entry', () => {
    expect(getArrivalStory('Atlantis')).toBeNull()
  })

  it('has a non-empty framing narrative for the first-launch intro', () => {
    expect(FRAMING_NARRATIVE.beats.length).toBeGreaterThan(0)
    expect(FRAMING_NARRATIVE.title).toBeTruthy()
  })
})
