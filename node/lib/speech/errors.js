// Shared error classes for the speech-scoring adapter layer (contract 05).
// Kept in a separate module to avoid circular imports between dispatch.js and adapters.

// Thrown by an adapter when the vendor returns a transient 5xx/rate-limit error
// that warrants falling through to the next engine. The dispatcher catches this
// and routes to the GOPT fallback before returning the sentinel score.
export class Engine5xxError extends Error {
  constructor(message) {
    super(message);
    this.name = 'Engine5xxError';
  }
}

// Thrown by adapter stubs (Speechace, GOPT) to signal the engine is not yet wired.
// The dispatcher treats this the same as any non-5xx failure: propagate rather than
// silently swallow, so misconfiguration is loud.
export class NotImplementedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NotImplementedError';
  }
}
