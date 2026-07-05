// Normalizes word shapes across the transition: the new scenario API returns
// { id, expression, reading, meaning }; /api/scenario/discovery still mirrors
// the legacy { zh, pinyin, en } aliases alongside them (route comment: "Legacy
// client field names preserved during the transition"). These helpers read
// either without the UI needing to know which endpoint a word came from.
export function wordText(word) {
  return word?.expression ?? word?.zh ?? ''
}

export function wordReading(word) {
  return word?.reading ?? word?.pinyin ?? ''
}

export function wordMeaning(word) {
  return word?.meaning ?? word?.en ?? ''
}

export function wordKey(word, index) {
  return `${word?.id ?? wordText(word) ?? index}-${index}`
}
