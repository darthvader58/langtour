// Typed error the provider chain throws when every configured model provider
// has failed with a quota/availability error. The route layer (owned by
// backend-graph) catches this by `instanceof` or `.code` and maps it to a
// clean player-facing response — see docs/contracts/ai-module.md.
export class ModelQuotaError extends Error {
  constructor(message, { attempted = [] } = {}) {
    super(message);
    this.name = 'ModelQuotaError';
    this.code = 'model_quota_exhausted';
    // Names of providers that were tried and hit a quota/availability error,
    // in chain order — useful for logs, never shown to the player.
    this.attempted = attempted;
  }
}
