import { API } from '../api'
import { invalidate, invalidatePrefix } from './apiCache'
import { noteGrammarReview, noteReview } from './fsrsStore'

// Tiny fetcher around POST /api/cards/mark. Fire-and-forget: the UI advances immediately
// after a grade click; we never block rendering on the server's acknowledgement, and any
// network error is swallowed (server persists the rating whenever it eventually arrives).
//
// Also fires a local FSRS store event so every SegmentedText instance (and any
// other subscriber) can update its R display the moment the grade lands — no
// need to re-fetch segment payloads or reload the page.
export function markFsrs(word_id, rating, lesson_id = null) {
  try {
    fetch(`${API}/api/cards/mark`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ word_id, rating, lesson_id }),
    }).then(() => {
      invalidate('/api/stats/recallable')
      invalidatePrefix('/api/dashboard')
    }).catch(() => {})
  } catch {}
  noteReview(word_id)
}

export function markCapsuleFsrs(word_id, rating, lesson_id, capsule_id) {
  try {
    fetch(`${API}/api/cards/flashcard/grade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ word_id, rating, lesson_id, capsule_id }),
    }).then(() => {
      invalidate('/api/stats/recallable')
      invalidatePrefix('/api/dashboard')
    }).catch(() => {})
  } catch {}
  noteReview(word_id)
}

export function markGrammarFsrs(structure_id, rating, context = {}) {
  if (!structure_id || !rating) return
  try {
    fetch(`${API}/api/cards/grammar/mark`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        structure_id,
        rating,
        article_id: context.article_id || null,
        context_text: context.context_text || null,
        span: context.span || null,
      }),
    }).then(() => {
      invalidatePrefix('/api/grammar')
    }).catch(() => {})
  } catch { /* fire-and-forget */ }
  noteGrammarReview(structure_id)
}
