import { createFileRoute } from "@tanstack/react-router";
import { MapScreen } from "@/components/map/map-screen";

export const Route = createFileRoute("/")({
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
  return <MapScreen />;
}
