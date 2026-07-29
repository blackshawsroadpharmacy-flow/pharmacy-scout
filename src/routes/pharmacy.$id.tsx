import { createFileRoute } from "@tanstack/react-router";
import { MapScreen } from "@/components/map/map-screen";
import { supabase } from "@/integrations/supabase/client";

const SITE_ORIGIN = "https://pharmacymapper.lovable.app";

type PharmacyHead = {
  name: string;
  suburb: string | null;
  address: string | null;
};

// Loaded so each dossier gets its own title, description and canonical.
// Previously all 922 pages served identical generic metadata.
export const Route = createFileRoute("/pharmacy/$id")({
  loader: async ({ params }): Promise<PharmacyHead | null> => {
    const { data, error } = await supabase
      .from("pharmacy_premises_geo")
      .select("name, suburb, address")
      .eq("id", params.id)
      .maybeSingle();
    if (error || !data?.name) return null;
    return { name: data.name, suburb: data.suburb, address: data.address };
  },
  head: ({ loaderData, params }) => {
    const pharmacy = (loaderData as PharmacyHead | null) ?? null;
    const where = pharmacy?.suburb ? `${pharmacy.suburb}, Victoria` : "Victoria";
    const title = pharmacy
      ? `${pharmacy.name} — ${where} | Victorian Pharmacy Mapper`
      : "Victorian Pharmacy Mapper";
    const description = pharmacy
      ? `Location, sourcing provenance and geographic dispensing context for ${pharmacy.name}${
          pharmacy.address ? ` at ${pharmacy.address}` : ""
        }. Indicative screening only — not a regulatory register.`
      : "Victorian Pharmacy Mapper";
    const canonical = `${SITE_ORIGIN}/pharmacy/${params.id}`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: canonical },
      ],
      links: [{ rel: "canonical", href: canonical }],
    };
  },
  component: PharmacyRoute,
});

function PharmacyRoute() {
  const { id } = Route.useParams();
  return <MapScreen selectedPremisesId={id} />;
}
