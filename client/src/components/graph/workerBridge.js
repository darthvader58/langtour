// Thin Promise wrapper around the SGD worker. Lazy-initializes one singleton worker on
// first call, multiplexes calls via requestId, forwards `progress` messages to an
// optional per-call onProgress callback.

let worker = null
let nextRequestId = 1
const pending = new Map() // requestId → { resolve, reject, onProgress }

function ensureWorker() {
  if (worker) return worker
  // Vite transforms this into a bundled worker URL at build time.
  worker = new Worker(new URL('./optimizers.worker.js', import.meta.url), { type: 'module' })
  worker.onmessage = (e) => {
    const msg = e.data
    const cb = pending.get(msg.requestId)
    if (!cb) return
    if (msg.type === 'progress') {
      cb.onProgress?.({
        iter: msg.iter,
        loss: msg.loss,
        V0: msg.V0 ? new Float32Array(msg.V0) : null,
        V1: msg.V1 ? new Float32Array(msg.V1) : null,
        V2: msg.V2 ? new Float32Array(msg.V2) : null,
      })
    } else if (msg.type === 'done') {
      pending.delete(msg.requestId)
      // Generic resolve — caller decodes msg fields into typed arrays as needed. The
      // SGD caller (runSGD) does its own decoding below.
      cb.resolve(msg)
    } else if (msg.type === 'error') {
      pending.delete(msg.requestId)
      cb.reject(new Error(msg.error || 'worker error'))
    }
  }
  worker.onerror = (e) => {
    for (const [, cb] of pending) cb.reject(new Error(e.message || 'worker crashed'))
    pending.clear()
  }
  return worker
}

// Run SGD stress minimization in the worker. `params` mirrors the worker message
// shape (see optimizers.worker.js). `sub` is expected as Float32Array of length m·K,
// `dTarget` as Float32Array of length m·m, `V0`/`V1`/`V2` as Float32Array of length K.
// When `V2` is provided the SGD runs in 3D mode. `onProgress({ iter, loss })` is
// called periodically during iteration.
//
// Returns Promise<{ V0: Float32Array, V1: Float32Array, V2?: Float32Array, lossHistory: number[] }>.
export async function runSGD(params, onProgress) {
  const w = ensureWorker()
  const requestId = nextRequestId++
  const msg = await new Promise((resolve, reject) => {
    pending.set(requestId, { resolve, reject, onProgress })
    const transferables = [
      params.sub.buffer, params.dTarget.buffer,
      params.V0.buffer, params.V1.buffer,
    ]
    const message = {
      type: 'sgd', requestId, ...params,
      sub: params.sub.buffer, dTarget: params.dTarget.buffer,
      V0: params.V0.buffer, V1: params.V1.buffer,
    }
    if (params.V2) {
      message.V2 = params.V2.buffer
      transferables.push(params.V2.buffer)
    }
    w.postMessage(message, transferables)
  })
  const result = {
    V0: new Float32Array(msg.V0),
    V1: new Float32Array(msg.V1),
    lossHistory: Array.from(new Float32Array(msg.lossHistory)),
  }
  if (msg.V2) result.V2 = new Float32Array(msg.V2)
  return result
}

// Small helper for non-SGD one-shot messages. Worker replies with type:'done' and an
// arbitrary payload which we pass straight to resolve(). Used by init/focusSim/
// isolateFocus — none of them stream progress.
function postRequest(message, transferables = []) {
  const w = ensureWorker()
  const requestId = nextRequestId++
  return new Promise((resolve, reject) => {
    pending.set(requestId, { resolve, reject })
    w.postMessage({ ...message, requestId }, transferables)
  })
}

// Module-level Promise that resolves once the worker has received the packed
// pcScores. Every other bridge method awaits this so callers don't need to track
// readiness themselves.
let initPromise = null

// Initialize the worker with packed pcScores. Call once per data load. The worker
// keeps the buffer for subsequent calls, so focus/sim/neighbor messages only send
// { focusIdx } rather than re-transferring megabytes of pcScores.
export function initGraphWorker(packedPc, N, K) {
  const copy = packedPc.slice()
  initPromise = postRequest({ type: 'init', pc: copy.buffer, N, K }, [copy.buffer])
  return initPromise
}

async function whenReady() {
  if (!initPromise) throw new Error('graph worker not initialized — call initGraphWorker first')
  await initPromise
}

// Compute sim[i] = −‖pc_i − pc_focus‖ in the worker. Returns Promise<Float32Array>
// of length N in the same order as data.nodes.
export async function runFocusSim(focusIdx) {
  await whenReady()
  const msg = await postRequest({ type: 'focusSim', focusIdx })
  return new Float32Array(msg.sims)
}

// Compute { v0, v1 } for "isolate focus" projection in the worker. v0 is the OLS
// regression direction of similarity-to-focus; v1 is the highest-variance PC
// direction orthogonal to v0. Returns Promise<{ v0: Float32Array, v1: Float32Array }>.
export async function runIsolateFocus(focusIdx) {
  await whenReady()
  const msg = await postRequest({ type: 'isolateFocus', focusIdx })
  return { v0: new Float32Array(msg.v0), v1: new Float32Array(msg.v1) }
}

// Build an RGB color buffer in the worker. `values` is Float32Array(N) of per-node
// metric values; the worker emits Float32Array(N*3) of RGB for direct upload to the
// WebGL point-sprite attribute. Replaces the main-thread 10k-point colorForNode +
// parseColor loop. `diverging=true` selects the residual red/grey/blue palette and
// expects values pre-normalized to [-1, 1]; otherwise sequential viridis + (lo, hi).
export async function runColorize(values, { lo = 0, hi = 1, diverging = false } = {}) {
  await whenReady()
  const copy = values.slice()
  const msg = await postRequest(
    { type: 'colorize', values: copy.buffer, lo, hi, diverging },
    [copy.buffer],
  )
  return new Float32Array(msg.colors)
}

// Cosine similarity of pc_focus against every other node, pre-sorted descending.
// Returns { sortedIdx: Uint32Array(N), sortedSims: Float32Array(N) }. Used by
// ExploreTask to avoid the O(N·K) cosine + O(N log N) sort that was running on the
// main thread on every focus change.
export async function runCosineSims(focusIdx) {
  await whenReady()
  const msg = await postRequest({ type: 'cosineSims', focusIdx })
  return {
    sortedIdx: new Uint32Array(msg.sortedIdx),
    sortedSims: new Float32Array(msg.sortedSims),
  }
}
