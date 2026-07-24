import { createFileRoute } from "@tanstack/react-router";
import { MapScreen } from "@/components/map/map-screen";

export const Route = createFileRoute("/pharmacy/$id")({
  component: PharmacyRoute,
});

function PharmacyRoute() {
  const { id } = Route.useParams();
  return <MapScreen selectedPremisesId={id} />;
}
