// Study-day helpers shared across stats endpoints. A "study day" is the calendar
// day shifted by the user's dayStartHour setting, so late-night reviews fall on
// the previous day (Anki-style). Extracted from routes/stats.js so the dashboard
// aggregator and the per-endpoint handlers share one definition.

import { db } from '../db/sqlite.js';
import { DAY_MS } from '../srs/fsrs_metrics.js';

export function getDayStartHour() {
  const row = db.prepare("SELECT value FROM settings WHERE key='day_start_hour'").get();
  return row ? parseInt(row.value, 10) || 0 : 0;
}

// Convert an ISO datetime to the "study day" string, shifted by dayStartHour.
// With dayStartHour=4, a review at 2025-09-01 02:00 belongs to study day 2025-08-31.
export function toStudyDay(isoDatetime, offsetHours) {
  const dt = new Date(Date.parse(isoDatetime) - offsetHours * 3600000);
  return dt.toISOString().slice(0, 10);
}

// Start timestamp (ms) of a given study day.
export function studyDayStartMs(day, offsetHours) {
  return Date.parse(`${day}T${String(offsetHours).padStart(2, '0')}:00:00.000Z`);
}

// End timestamp (ms) of a given study day = start of next study day - 1ms.
export function studyDayEndMs(day, offsetHours) {
  const nextDay = new Date(Date.parse(day) + DAY_MS);
  const nextDayStr = nextDay.toISOString().slice(0, 10);
  return studyDayStartMs(nextDayStr, offsetHours) - 1;
}
