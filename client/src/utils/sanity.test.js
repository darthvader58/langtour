import { describe, it, expect } from 'vitest'

// Sanity check that the vitest runner is wired up correctly. If this fails, every other
// frontend test will too — it's the canary.
describe('vitest sanity', () => {
  it('can run a basic test', () => {
    expect(2 + 2).toBe(4)
  })
})
