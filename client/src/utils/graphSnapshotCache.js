const DB_NAME = 'maizu-graph'
const STORE = 'snapshots'
const VERSION = 3
const LATEST_KEY = 'latest'
const SNAPSHOT_VERSION = 1
const METRIC_KEYS = ['retrievability', 'stability', 'difficulty', 'connectivity', 'density', 'hubness']

let _dbPromise = null
function openDB() {
  if (_dbPromise) return _dbPromise
  _dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('no indexedDB')); return }
    const req = indexedDB.open(DB_NAME, VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('history')) db.createObjectStore('history')
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  }).catch((e) => { _dbPromise = null; throw e })
  return _dbPromise
}

export function graphPayloadToSnapshot(data, edgesData, snapshotKey, options = {}) {
  const nodes = data?.nodes || []
  const n = nodes.length
  const k = nodes.reduce((max, node) => Math.max(max, node.pcScores?.length || 0), 0)
  const pc = new Float32Array(n * k)
  const coords = new Float32Array(n * 3)
  const metrics = {}
  for (const key of METRIC_KEYS) {
    const arr = new Float32Array(n)
    arr.fill(NaN)
    metrics[key] = arr
  }

  const nodeMeta = nodes.map((node, i) => {
    const scores = node.pcScores || []
    for (let j = 0; j < Math.min(k, scores.length); j++) pc[i * k + j] = Number(scores[j]) || 0
    coords[i * 3] = Number(node.umapX) || 0
    coords[i * 3 + 1] = Number(node.umapY) || 0
    coords[i * 3 + 2] = Number(node.umapZ) || 0
    for (const key of METRIC_KEYS) {
      const v = node[key]
      if (Number.isFinite(v)) metrics[key][i] = v
    }
    return {
      id: node.id,
      expression: node.expression,
      reading: node.reading,
      meaning: node.meaning,
      lapses: node.lapses,
      reps: node.reps,
      state: node.state,
      state_label: node.state_label,
      last_review_at: node.last_review_at,
      review_count_7d: node.review_count_7d,
      review_count_30d: node.review_count_30d,
      mean_rating: node.mean_rating,
      due_at: node.due_at,
    }
  })

  const edges = edgesData?.edges || []
  const edgePairs = new Uint32Array(edges.length * 2)
  const edgeSims = new Float32Array(edges.length)
  for (let i = 0; i < edges.length; i++) {
    edgePairs[i * 2] = Number(edges[i].source) || 0
    edgePairs[i * 2 + 1] = Number(edges[i].target) || 0
    edgeSims[i] = Number(edges[i].sim) || 0
  }

  return {
    version: SNAPSHOT_VERSION,
    snapshotKey,
    savedAt: Date.now(),
    maxNodes: options.maxNodes ?? null,
    totalWords: data?.totalWords ?? n,
    sampled: Boolean(data?.sampled),
    dimInfo: data?.dimInfo ?? null,
    pcaInfo: { eigenvalues: data?.pcaInfo?.eigenvalues || [] },
    n,
    k,
    edgeCount: edges.length,
    nodeMeta,
    pc,
    coords,
    metrics,
    edgePairs,
    edgeSims,
  }
}

export function snapshotToGraphState(snapshot) {
  if (!snapshot || snapshot.version !== SNAPSHOT_VERSION || !snapshot.nodeMeta) return null
  const nodes = snapshot.nodeMeta.map((meta, i) => {
    const pcStart = i * snapshot.k
    const node = {
      ...meta,
      pcScores: Array.from(snapshot.pc.subarray(pcStart, pcStart + snapshot.k)),
      umapX: snapshot.coords[i * 3],
      umapY: snapshot.coords[i * 3 + 1],
      umapZ: snapshot.coords[i * 3 + 2],
    }
    for (const key of METRIC_KEYS) node[key] = snapshot.metrics?.[key]?.[i]
    return node
  })
  const edges = new Array(snapshot.edgeCount || 0)
  for (let i = 0; i < edges.length; i++) {
    edges[i] = {
      source: snapshot.edgePairs[i * 2],
      target: snapshot.edgePairs[i * 2 + 1],
      sim: snapshot.edgeSims[i],
    }
  }
  return {
    data: {
      nodes,
      totalWords: snapshot.totalWords,
      sampled: snapshot.sampled,
      dimInfo: snapshot.dimInfo,
      pcaInfo: snapshot.pcaInfo,
      snapshotKey: snapshot.snapshotKey,
      fromBrowserCache: true,
    },
    edgesData: { edges },
  }
}

export async function getCachedGraphSnapshot({ maxNodes } = {}) {
  try {
    const db = await openDB()
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(LATEST_KEY)
      req.onsuccess = () => {
        const snapshot = req.result
        if (!snapshot || snapshot.version !== SNAPSHOT_VERSION) { resolve(null); return }
        if (maxNodes != null && snapshot.maxNodes != null && snapshot.maxNodes !== maxNodes) { resolve(null); return }
        resolve(snapshot)
      }
      req.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

export async function putCachedGraphSnapshot(snapshot) {
  try {
    const db = await openDB()
    await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      store.put(snapshot, LATEST_KEY)
      if (snapshot?.snapshotKey) store.put(snapshot, snapshot.snapshotKey)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
      tx.onabort = () => resolve()
    })
  } catch {
    // Browser cache is only a performance layer.
  }
}
