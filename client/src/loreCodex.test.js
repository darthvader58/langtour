import { describe, expect, it } from 'vitest'
import { CHARACTERS, COUNTRIES } from './gameData'
import { buildCodexEntries } from './loreCodex'

describe('buildCodexEntries', () => {
  it('returns one entry per catalog country, all locked with no unlocks', () => {
    const entries = buildCodexEntries([])
    expect(entries).toHaveLength(Object.keys(CHARACTERS).length)
    expect(entries.every((entry) => entry.unlocked === false)).toBe(true)
  })

  it('unlocks an entry only when its country code is in the server-provided list', () => {
    const chinaCode = COUNTRIES.find((c) => c.name === 'China').code
    const entries = buildCodexEntries([chinaCode])
    const china = entries.find((entry) => entry.country === 'China')
    const france = entries.find((entry) => entry.country === 'France')
    expect(china.unlocked).toBe(true)
    expect(france.unlocked).toBe(false)
  })

  it('is unaffected by extraneous/unknown codes in the unlocked list', () => {
    const entries = buildCodexEntries(['zz', 'not-a-code'])
    expect(entries.every((entry) => entry.unlocked === false)).toBe(true)
  })

  it('carries the country code, flag, and full arrival story on every entry', () => {
    const entries = buildCodexEntries([])
    const china = entries.find((entry) => entry.country === 'China')
    expect(china.code).toBe('cn')
    expect(china.flag).toBeTruthy()
    expect(china.cover.type).toBe('Spy')
    expect(china.sidekick.name).toBe('Wren')
    expect(china.beats.length).toBeGreaterThan(0)
  })

  it('defaults to an empty unlocked list when none is passed', () => {
    expect(buildCodexEntries().every((entry) => entry.unlocked === false)).toBe(true)
  })
})
