export const VICTORIA_QUERY_LIMITS = Object.freeze({
  west: 140.9,
  south: -39.2,
  east: 150,
  north: -33.9,
});

export function normalizeViewportBounds(bounds, precision = 4) {
  const clipped = {
    west: Math.max(VICTORIA_QUERY_LIMITS.west, Number(bounds.west)),
    south: Math.max(VICTORIA_QUERY_LIMITS.south, Number(bounds.south)),
    east: Math.min(VICTORIA_QUERY_LIMITS.east, Number(bounds.east)),
    north: Math.min(VICTORIA_QUERY_LIMITS.north, Number(bounds.north)),
  };
  if (
    Object.values(clipped).some((value) => !Number.isFinite(value)) ||
    clipped.west >= clipped.east ||
    clipped.south >= clipped.north
  ) {
    return null;
  }
  return Object.fromEntries(
    Object.entries(clipped).map(([key, value]) => [key, Number(value.toFixed(precision))]),
  );
}

export function viewportRequestKey(resource, bounds, filters = {}) {
  const normalized = normalizeViewportBounds(bounds);
  if (!normalized) return null;
  const stableFilters = Object.fromEntries(
    Object.entries(filters).sort(([left], [right]) => left.localeCompare(right)),
  );
  return JSON.stringify([resource, normalized, stableFilters]);
}

export function isCurrentViewportResult(expectedKey, result) {
  return result != null && result.requestKey === expectedKey;
}

export class ViewportRequestCoordinator {
  #inflight = new Map();
  #latestKey = null;

  request(key, executor, externalSignal) {
    const duplicate = this.#inflight.get(key);
    if (duplicate) return duplicate.promise;

    for (const [otherKey, request] of this.#inflight) {
      if (otherKey !== key) request.controller.abort();
    }

    const controller = new AbortController();
    const signal = externalSignal
      ? AbortSignal.any([controller.signal, externalSignal])
      : controller.signal;
    this.#latestKey = key;

    const promise = Promise.resolve()
      .then(() => executor(signal))
      .then((value) => {
        if (this.#latestKey !== key) {
          throw new DOMException("Stale viewport response", "AbortError");
        }
        return value;
      })
      .finally(() => {
        if (this.#inflight.get(key)?.promise === promise) this.#inflight.delete(key);
      });

    this.#inflight.set(key, { controller, promise });
    return promise;
  }
}
