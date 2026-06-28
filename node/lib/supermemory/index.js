// Barrel export for node/lib/supermemory.
// See client.js / containerTag.js / forest.js / resurface.js / forestMirror.js
// for the documented surface.

export { userTag, isUserTag } from './containerTag.js';
export {
  supermemoryClient,
  memoryTools,
  createSupermemoryInfiniteChat,
} from './client.js';
export {
  getForestProfile,
  appendForestNode,
  appendForestNodes,
  forestTools,
} from './forest.js';
export { getDueForResurfacing } from './resurface.js';
export { syncForestEdgesForUser } from './forestMirror.js';
