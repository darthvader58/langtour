import { COUNTRIES, SCENARIOS_BY_COUNTRY, SPECIAL_SCENARIO_BY_COUNTRY } from '../../gameData'

const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback

export function normalizeCountryCode(value) {
  const candidate = String(value ?? '').trim().toLowerCase()
  return COUNTRIES.find((country) => country.code === candidate || country.name.toLowerCase() === candidate)?.code ?? candidate
}

export function displayIdentity(user) {
  const metadata = user?.user_metadata ?? {}
  const name = metadata.full_name || metadata.name || metadata.display_name || user?.email?.split('@')[0] || 'Agent'
  return {
    name,
    email: user?.email || '',
    avatarUrl: metadata.avatar_url || metadata.picture || '',
    initials: name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'A',
  }
}

export function formatAccountAge(createdAt, now = Date.now()) {
  if (!createdAt) return 'New recruit'
  const started = new Date(createdAt).getTime()
  if (!Number.isFinite(started)) return 'New recruit'
  const days = Math.max(0, Math.floor((now - started) / 86_400_000))
  if (days < 1) return 'Joined today'
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} in the field`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} in the field`
  const years = Math.floor(months / 12)
  return `${years} year${years === 1 ? '' : 's'} in the field`
}

export function normalizeMetrics(payload = {}) {
  const metrics = payload.metrics ?? payload.summary ?? payload
  return {
    recallable: number(metrics.recallable ?? metrics.recallableWords),
    encountered: number(metrics.encountered ?? metrics.encounteredWords ?? metrics.wordsEncountered),
    mastered: number(metrics.mastered ?? metrics.masteredWords),
    due: number(metrics.due ?? metrics.dueWords),
    reviews: number(metrics.reviews ?? metrics.totalReviews),
    accuracy: number(metrics.accuracy ?? metrics.reviewAccuracy ?? metrics.recentAccuracy),
    streak: number(metrics.streak ?? metrics.currentStreak),
  }
}

function scenarioRecordsFor(payload, countryCode) {
  const source = payload.scenarios ?? payload.scenarioHistory ?? payload.scenarioCompletions ?? payload.completedScenarios ?? []
  if (Array.isArray(source)) return source.filter((item) => {
    const itemCountry = item?.countryCode ?? item?.country_code
    return !itemCountry || normalizeCountryCode(itemCountry) === countryCode
  })
  return source[countryCode] ?? []
}

export function normalizeProgress(payload = {}, fallback = {}) {
  const gameHistory = payload.gameHistory ?? {}
  const unlocks = payload.countryUnlocks ?? gameHistory.countryUnlocks ?? payload.unlockedCountries ?? payload.countries ?? []
  const unlockByCode = new Map((Array.isArray(unlocks) ? unlocks : []).map((item) => {
    const code = normalizeCountryCode(typeof item === 'string' ? item : item.countryCode ?? item.country_code ?? item.code)
    return [code, typeof item === 'string' ? {} : item]
  }))
  const fallbackUnlocks = new Set((fallback.unlockedCountries ?? []).map(normalizeCountryCode))
  const completionSource = payload.scenarioCompletions ?? gameHistory.scenarioCompletions ?? payload.completedScenarios ?? []
  const completionRows = Array.isArray(completionSource) ? completionSource : []
  const fallbackCompleted = new Set(fallback.completedScenarios ?? [])

  const countries = COUNTRIES.map((country) => {
    const apiCountry = (Array.isArray(payload.countries) ? payload.countries : []).find((item) =>
      normalizeCountryCode(item.countryCode ?? item.country_code ?? item.code) === country.code)
    const unlockRow = unlockByCode.get(country.code)
    const scenarioRows = scenarioRecordsFor({ ...payload, scenarioCompletions: completionSource }, country.code)
    const rowById = new Map([...completionRows, ...scenarioRows].map((row) => [
      typeof row === 'string' ? row : row.scenarioId ?? row.scenario_id ?? row.id,
      typeof row === 'string' ? {} : row,
    ]))
    const catalog = [...(SCENARIOS_BY_COUNTRY[country.name] ?? [])]
    const special = SPECIAL_SCENARIO_BY_COUNTRY[country.name]
    if (special) catalog.push(special)
    return {
      ...country,
      unlocked: Boolean(apiCountry?.unlocked ?? unlockByCode.has(country.code) ?? fallbackUnlocks.has(country.code)) || fallbackUnlocks.has(country.code),
      unlockedAt: apiCountry?.unlockedAt ?? apiCountry?.unlocked_at ?? unlockRow?.unlockedAt ?? unlockRow?.unlocked_at ?? null,
      character: apiCountry?.character ?? unlockRow?.character ?? payload.characters?.[country.code] ?? null,
      scenarios: catalog.map((scenario) => {
        const row = rowById.get(scenario.id)
        return {
          id: scenario.id,
          title: scenario.title,
          description: scenario.description,
          completed: Boolean(row || fallbackCompleted.has(scenario.id)),
          completedAt: row?.completedAt ?? row?.completed_at ?? null,
        }
      }),
    }
  })

  return {
    metrics: normalizeMetrics(payload),
    countries,
    profile: payload.profile ?? fallback.profile ?? {},
    history: payload.history ?? payload.activity ?? [],
  }
}

export function normalizeGraph(payload = {}) {
  const rawNodes = payload.nodes ?? payload.words ?? []
  const nodes = rawNodes.map((node, index) => {
    const position = node.position ?? node.coordinates ?? node.pca ?? []
    return {
      ...node,
      id: String(node.id ?? node.wordId ?? node.word_id ?? index),
      expression: node.expression ?? node.word ?? node.term ?? '',
      translation: node.translation ?? node.english ?? node.meaning ?? '',
      x: number(node.x ?? position[0]),
      y: number(node.y ?? position[1]),
      z: number(node.z ?? position[2]),
      retrievability: number(node.retrievability, 0),
      stability: number(node.stability, 0),
      mastered: Boolean(node.mastered),
    }
  })
  const idSet = new Set(nodes.map((node) => node.id))
  const edges = (payload.edges ?? []).map((edge) => ({
    source: String(edge.source ?? edge.sourceId ?? edge.from),
    target: String(edge.target ?? edge.targetId ?? edge.to),
    similarity: number(edge.similarity ?? edge.sim, 0),
  })).filter((edge) => idSet.has(edge.source) && idSet.has(edge.target))
  return { nodes, edges }
}
