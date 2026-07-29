export interface ViewportBoundsLike {
  west: number;
  south: number;
  east: number;
  north: number;
}

export const VICTORIA_QUERY_LIMITS: Readonly<ViewportBoundsLike>;
export function normalizeViewportBounds(
  bounds: ViewportBoundsLike,
  precision?: number,
): ViewportBoundsLike | null;
export function viewportRequestKey(
  resource: string,
  bounds: ViewportBoundsLike,
  filters?: object,
): string | null;
export function isCurrentViewportResult(
  expectedKey: string | null,
  result: { requestKey: string } | null | undefined,
): boolean;

export class ViewportRequestCoordinator<T = unknown> {
  request(
    key: string,
    executor: (signal: AbortSignal) => Promise<T>,
    externalSignal?: AbortSignal,
  ): Promise<T>;
}
