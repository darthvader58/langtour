// Barrel export for node/lib/supermemory.
// See client.js / containerTag.js / forest.js for the documented surface.

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
