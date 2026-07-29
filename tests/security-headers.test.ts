import { describe, expect, it } from "vitest";
import { CONTENT_SECURITY_POLICY, MAP_TILE_ORIGINS } from "../src/lib/security-headers";

describe("map tile content security policy", () => {
  it("allows the exact primary OpenStreetMap origin and the configured CARTO fallback", () => {
    expect(MAP_TILE_ORIGINS).toContain("https://tile.openstreetmap.org");
    expect(MAP_TILE_ORIGINS).toContain("https://*.basemaps.cartocdn.com");

    const imgSource = CONTENT_SECURITY_POLICY.split("; ").find((directive) =>
      directive.startsWith("img-src "),
    );
    expect(imgSource).toContain("https://tile.openstreetmap.org");
    expect(imgSource).toContain("https://*.basemaps.cartocdn.com");
  });

  it("retains clickjacking protection", () => {
    expect(CONTENT_SECURITY_POLICY).toContain("frame-ancestors 'none'");
  });
});
