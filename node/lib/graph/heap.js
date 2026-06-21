// Simple binary max-heap for greedy selection.
// Items are compared by `score` descending, then `count` descending.

export class MaxHeap {
  constructor() {
    this.data = [];
  }

  get size() {
    return this.data.length;
  }

  push(item) {
    const heap = this.data;
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (_greaterOrEqual(heap[parent], heap[i])) break;
      [heap[parent], heap[i]] = [heap[i], heap[parent]];
      i = parent;
    }
  }

  pop() {
    const heap = this.data;
    if (heap.length === 0) return undefined;
    const max = heap[0];
    const last = heap.pop();
    if (heap.length === 0) return max;
    heap[0] = last;
    let i = 0;
    const n = heap.length;
    while (true) {
      const left = i * 2 + 1;
      const right = i * 2 + 2;
      let largest = i;
      if (left < n && _greater(heap[left], heap[largest])) largest = left;
      if (right < n && _greater(heap[right], heap[largest])) largest = right;
      if (largest === i) break;
      [heap[i], heap[largest]] = [heap[largest], heap[i]];
      i = largest;
    }
    return max;
  }
}

function _greater(a, b) {
  if (a.score !== b.score) return a.score > b.score;
  if (a.count !== b.count) return a.count > b.count;
  return false;
}

function _greaterOrEqual(a, b) {
  if (a.score !== b.score) return a.score > b.score;
  if (a.count !== b.count) return a.count > b.count;
  return true;
}
