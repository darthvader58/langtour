// IndexedDB-backed cache for per-date historical metric snapshots. Float32Arrays
// round-trip natively through IndexedDB's structured-clone storage, so there's no
// (de)serialization — we hand it the same object we build in GraphView and pull
// the same object back on reload.
//
// Key: ISO date string (YYYY-MM-DD).
// Value: { retrievability: Float32Array, stability: Float32Array, difficulty: Float32Array,
//          n: number // length sentinel used to detect deck mismatch on retrieval }

const DB_NAME = 'maizu-graph'
const STORE = 'history'
const VERSION = 3

let _dbPromise = null
function openDB() {
  if (_dbPromise) return _dbPromise
  _dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('no indexedDB')); return }
    const req = indexedDB.open(DB_NAME, VERSION)
    req.onupgradeneeded = (e) => {
      const db = req.result
      if (e.oldVersion < 2) {
        if (db.objectStoreNames.contains(STORE)) db.deleteObjectStore(STORE)
      }
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
      if (!db.objectStoreNames.contains('snapshots')) db.createObjectStore('snapshots')
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  }).catch((e) => { _dbPromise = null; throw e })
  return _dbPromise
}

export async function getCachedHistory(date, expectedN) {
  try {
    const db = await openDB()
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(date)
      req.onsuccess = () => {
        const v = req.result
        // Invalidate silently if the deck has changed size since the cache was
        // written (indices wouldn't align) or if the cached entry predates the
        // `existed` visibility bitmap (added later — forces a re-fetch to populate it).
        if (!v || v.n !== expectedN || !v.existed) { resolve(null); return }
        resolve(v)
      }
      req.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

export async function putCachedHistory(date, metrics) {
  try {
    const db = await openDB()
    await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(metrics, date)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
      tx.onabort = () => resolve()
    })
  } catch {
    // IndexedDB write failures are not fatal — cache is purely an optimization.
  }
}
