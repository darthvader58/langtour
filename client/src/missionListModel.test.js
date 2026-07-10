import { describe, expect, it } from 'vitest'
import { buildMissionListViewModel, shouldShowCompletion, toMissionViewModel } from './missionListModel'
import { DEFAULT_SCENARIO_ICON, iconForSuperset } from './components/supersetIcons'

describe('toMissionViewModel', () => {
  it('maps a completed mission to a full progress bar regardless of word counts', () => {
    const vm = toMissionViewModel({
      scenarioId: 'street-market', title: 'Street Market', superset: 'food & stuff',
      position: 1, completed: true, targetSize: 8, usedCount: 3, chainClosing: false,
    })
    expect(vm).toMatchObject({
      id: 'street-market', title: 'Street Market', superset: 'food & stuff',
      completed: true, progress: 100, targetSize: 8, usedCount: 3,
    })
    expect(vm.icon).toBe(iconForSuperset('food & stuff'))
  })

  it('derives in-progress percentage from usedCount/targetSize, capped below 100', () => {
    const vm = toMissionViewModel({
      scenarioId: 'restaurant', title: 'Restaurant', superset: 'food & stuff',
      position: 2, completed: false, targetSize: 4, usedCount: 4, chainClosing: false,
    })
    // 4/4 = 100% used, but an unconfirmed mission never shows a full bar.
    expect(vm.progress).toBe(99)
  })

  it('is 0% for a mission with no target size yet', () => {
    const vm = toMissionViewModel({
      scenarioId: 'greetings', title: 'Greetings', superset: 'meeting people',
      position: 0, completed: false, targetSize: 0, usedCount: 0, chainClosing: false,
    })
    expect(vm.progress).toBe(0)
  })

  it('falls back to the default icon and scenarioId title for missing fields', () => {
    const vm = toMissionViewModel({ scenarioId: 'mystery-stop' })
    expect(vm.title).toBe('mystery-stop')
    expect(vm.icon).toBe(DEFAULT_SCENARIO_ICON)
    expect(vm.completed).toBe(false)
  })
})

describe('buildMissionListViewModel', () => {
  const response = {
    scenarios: [
      { scenarioId: 'greetings', title: 'Greetings', superset: 'meeting people', position: 0, completed: true, targetSize: 6, usedCount: 6, chainClosing: false },
      { scenarioId: 'street-market', title: 'Street Market', superset: 'food & stuff', position: 1, completed: false, targetSize: 8, usedCount: 2, chainClosing: false },
    ],
    nextAvailable: true,
    totalSituations: 15,
    countryComplete: false,
  }

  it('maps scenarios and counts completions', () => {
    const vm = buildMissionListViewModel(response)
    expect(vm.missions).toHaveLength(2)
    expect(vm.completedCount).toBe(1)
    expect(vm.totalCount).toBe(2)
    expect(vm.nextAvailable).toBe(true)
    expect(vm.totalSituations).toBe(15)
    expect(vm.countryComplete).toBe(false)
  })

  it('handles a missing/empty response without throwing', () => {
    expect(buildMissionListViewModel(null)).toMatchObject({
      missions: [], completedCount: 0, totalCount: 0, nextAvailable: false, countryComplete: false,
    })
    expect(buildMissionListViewModel({})).toMatchObject({ missions: [], totalSituations: 0 })
  })
})

describe('shouldShowCompletion', () => {
  it('is true only when the server reports countryComplete: true', () => {
    expect(shouldShowCompletion({ countryComplete: true })).toBe(true)
  })

  it('is false for countryComplete: false, missing, or a forged truthy non-boolean is still coerced safely', () => {
    expect(shouldShowCompletion({ countryComplete: false })).toBe(false)
    expect(shouldShowCompletion({})).toBe(false)
    expect(shouldShowCompletion(null)).toBe(false)
    expect(shouldShowCompletion(undefined)).toBe(false)
  })
})
