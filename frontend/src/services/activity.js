import api from './api'

// Aggregate action counts only: no search phrases, customer identifiers or session IDs.
export function recordActivity(kind, product) {
  api.post('/shopping-activity/', { kind, ...(product ? { product } : {}) }).catch(() => {})
}
