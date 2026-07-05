import { describe, expect, it } from 'vitest'
import { wordKey, wordMeaning, wordReading, wordText } from './wordDisplay'

describe('wordDisplay', () => {
  it('reads the current API shape', () => {
    const word = { id: 1, expression: '你好', reading: 'nǐ hǎo', meaning: 'hello' }
    expect(wordText(word)).toBe('你好')
    expect(wordReading(word)).toBe('nǐ hǎo')
    expect(wordMeaning(word)).toBe('hello')
  })

  it('falls back to the legacy zh/pinyin/en aliases', () => {
    const word = { zh: '市场', pinyin: 'shìchǎng', en: 'market' }
    expect(wordText(word)).toBe('市场')
    expect(wordReading(word)).toBe('shìchǎng')
    expect(wordMeaning(word)).toBe('market')
  })

  it('produces a stable, unique key per word', () => {
    expect(wordKey({ id: 7, expression: 'a' }, 0)).toBe('7-0')
    expect(wordKey({ expression: 'a' }, 2)).toBe('a-2')
  })
})
