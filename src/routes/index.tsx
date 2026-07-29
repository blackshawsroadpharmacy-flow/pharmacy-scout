import { createFileRoute } from "@tanstack/react-router";
import { MapScreen } from "@/components/map/map-screen";

// Every field is genuinely optional, so the keys must be optional too —
// otherwise `<Link to="/">` requires an explicit search object at each site.
export type MapSearch = {
  lat?: number;
  lng?: number;
  z?: number;
  layers?: string;
  potential?: "strong" | "high-confidence";
};

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): MapSearch => ({
    lat: finite(search.lat, -39.2, -33.98),
    lng: finite(search.lng, 140.96, 149.98),
    z: finite(search.z, 5, 18),
    layers: typeof search.layers === "string" ? search.layers : undefined,
    potential: potentialFilter(search.potential),
  }),
  head: () => ({
    meta: [
      { title: "Victorian Pharmacy Mapper" },
      {
        name: "description",
        content: "Victorian Pharmacy Mapper",
      },
      { property: "og:title", content: "Victorian Pharmacy Mapper" },
      {
        property: "og:description",
        content: "Victorian Pharmacy Mapper",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  component: MapIndexRoute,
});

function MapIndexRoute() {
  const search = Route.useSearch();
  return (
    <MapScreen
      publicMapState={{
        lat: search.lat,
        lng: search.lng,
        zoom: search.z,
        layers: search.layers,
        potential: search.potential,
      }}
    />
  );
}

function finite(value: unknown, minimum: number, maximum: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : undefined;
}

function potentialFilter(value: unknown): "strong" | "high-confidence" | undefined {
  return value === "strong" || value === "high-confidence" ? value : undefined;
}
