const SUPABASE_ORIGIN = "https://gvrwrqcftlaavxarmgfk.supabase.co";

export const MAP_TILE_ORIGINS = [
  "https://tile.openstreetmap.org",
  "https://*.tile.openstreetmap.org",
  "https://*.basemaps.cartocdn.com",
] as const;

export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  `img-src 'self' data: blob: ${MAP_TILE_ORIGINS.join(" ")} https://unpkg.com https://storage.googleapis.com ${SUPABASE_ORIGIN}`,
  `connect-src 'self' ${SUPABASE_ORIGIN} ${MAP_TILE_ORIGINS.join(" ")}`,
  "worker-src 'self' blob:",
].join("; ");

export const SECURITY_HEADERS: Record<string, string> = {
  "content-security-policy": CONTENT_SECURITY_POLICY,
  "x-frame-options": "DENY",
  "permissions-policy": "camera=(), microphone=(), geolocation=(self), payment=()",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
};
