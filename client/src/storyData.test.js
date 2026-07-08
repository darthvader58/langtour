import { describe, expect, it } from 'vitest'
import { CHARACTERS } from './gameData'
import { PERSONA_CANON } from '../../shared/personaCanon.js'
import { FRAMING_NARRATIVE, getArrivalStory, getSidekick, listCountryStories, resolveCharacterId, SIDEKICKS } from './storyData'

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

  it('resolves a characterId or a catalog country name to the same characterId', () => {
    expect(resolveCharacterId('shanghai-spy')).toBe('shanghai-spy')
    expect(resolveCharacterId('China')).toBe('shanghai-spy')
    expect(resolveCharacterId('Atlantis')).toBeNull()
    expect(resolveCharacterId(undefined)).toBeNull()
  })

  it('builds an arrival story shaped exactly per docs/contracts/story-narration.md: beats, sidekick, cover', () => {
    const arrival = getArrivalStory('China')
    expect(Object.keys(arrival).sort()).toEqual(['beats', 'characterId', 'cover', 'sidekick'])
    expect(arrival.cover.type).toBe('Spy')
    expect(arrival.sidekick).toEqual({ name: 'Wren', role: 'handler on the radio', catchphrase: SIDEKICKS['shanghai-spy'].tagline })
    expect(arrival.beats).toEqual(PERSONA_CANON['shanghai-spy'].beats)
    expect(arrival.beats.length).toBeGreaterThanOrEqual(3)
  })

  it('accepts a characterId directly, not just a country name', () => {
    expect(getArrivalStory('louvre-thief')).toEqual(getArrivalStory('France'))
  })

  it('returns null for a country/characterId with no canon entry', () => {
    expect(getArrivalStory('Atlantis')).toBeNull()
  })

  it('never lets the popup/codex text drift from the shared canon', () => {
    for (const [characterId, canon] of Object.entries(PERSONA_CANON)) {
      const story = getArrivalStory(characterId)
      expect(story.beats).toBe(canon.beats) // same array reference — rendered, not re-authored
      expect(story.sidekick.catchphrase).toBe(canon.voice.catchphrase)
    }
  })

  it('lists every catalog country once, keyed by country name', () => {
    const stories = listCountryStories()
    expect(stories.map((s) => s.country).sort()).toEqual(Object.keys(CHARACTERS).sort())
    expect(stories.every((s) => Array.isArray(s.beats) && s.beats.length > 0)).toBe(true)
  })

  it('has a non-empty framing narrative for the first-launch intro', () => {
    expect(FRAMING_NARRATIVE.beats.length).toBeGreaterThan(0)
    expect(FRAMING_NARRATIVE.title).toBeTruthy()
  })
})
