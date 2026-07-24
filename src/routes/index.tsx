import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPremises, type PublicPremises } from "@/lib/premises-public";
import { TopBar, type Mode } from "@/components/map/top-bar";
import { LeftPanel, DEFAULT_FILTERS, type Filters } from "@/components/map/left-panel";
import { LayerMenu, DEFAULT_LAYERS, type LayerState } from "@/components/map/layer-menu";
import { RightDossier } from "@/components/map/right-dossier";
import { AuthSheet } from "@/components/map/auth-sheet";
import { useSession } from "@/hooks/use-session";

const MapView = lazy(() =>
  import("@/components/map/map-view").then((m) => ({ default: m.MapView })),
);

const METRO_BOUNDS = { minLat: -38.5, maxLat: -37.4, minLng: 144.5, maxLng: 145.6 };

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Victorian Pharmacy Mapper" },
      {
        name: "description",
        content:
          "Victorian Pharmacy Mapper",
      },
      { property: "og:title", content: "Victorian Pharmacy Mapper" },
      {
        property: "og:description",
        content:
          "Victorian Pharmacy Mapper",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  component: MapHome,
});

function MapHome() {
  const navigate = useNavigate();
  const { user } = useSession();
  const authed = !!user;

  const premisesQ = useQuery({
    queryKey: ["premises-public"],
    queryFn: fetchAllPremises,
    staleTime: 5 * 60 * 1000,
  });

  const [mode, setMode] = useState<Mode>("explore");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [leftOpen, setLeftOpen] = useState(true);
  const [layersOpen, setLayersOpen] = useState(false);
  const [layers, setLayers] = useState<LayerState>(DEFAULT_LAYERS);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number; zoom?: number } | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authReason, setAuthReason] = useState("");

  const all = premisesQ.data ?? [];

  const filtered = useMemo(() => {
    return all.filter((p) => {
      if (!layers.pharmacies) return false;
      if (filters.verified && p.vpa_registration_status !== "verified") return false;
      if (filters.metroOnly) {
        if (
          p.lat < METRO_BOUNDS.minLat ||
          p.lat > METRO_BOUNDS.maxLat ||
          p.lng < METRO_BOUNDS.minLng ||
          p.lng > METRO_BOUNDS.maxLng
        )
          return false;
      }
      if (filters.pbsKnown) return false; // no PBS approvals seeded yet
      if (filters.missingData && p.vpa_registration_status !== "unverified") return false;
      return true;
    });
  }, [all, filters, layers.pharmacies]);

  function requireAuth(reason: string) {
    setAuthReason(reason);
    setAuthOpen(true);
  }

  async function handleAccount() {
    if (authed) {
      await supabase.auth.signOut();
    } else {
      requireAuth("Sign in to access saved opportunities and private notes.");
    }
  }

  function handleSearch(q: string) {
    const needle = q.toLowerCase();
    const hit = all.find(
      (p) =>
        p.name.toLowerCase().includes(needle) ||
        p.address.toLowerCase().includes(needle) ||
        (p.suburb ?? "").toLowerCase().includes(needle) ||
        (p.postcode ?? "").includes(needle),
    );
    if (hit) {
      setFlyTo({ lat: hit.lat, lng: hit.lng, zoom: 15 });
      setSelectedId(hit.id);
    }
  }

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-muted">
      <ClientOnly fallback={<MapSkeleton />}>
        <Suspense fallback={<MapSkeleton />}>
          <MapView
            premises={filtered}
            selectedId={selectedId}
            onSelect={setSelectedId}
            savedIds={new Set()}
            flyTo={flyTo}
          />
        </Suspense>
      </ClientOnly>

      <TopBar
        mode={mode}
        onMode={setMode}
        onSearch={handleSearch}
        onToggleLayers={() => setLayersOpen((v) => !v)}
        onSaved={() =>
          authed
            ? navigate({ to: "/app/acquisitions" })
            : requireAuth("Sign in to view your saved opportunities.")
        }
        onAccount={handleAccount}
        authed={authed}
        resultCount={all.length}
      />

      <LeftPanel
        open={leftOpen}
        onToggle={() => setLeftOpen((v) => !v)}
        mode={mode}
        filters={filters}
        onFilters={setFilters}
        premises={all}
        filtered={filtered}
        onSelect={(id) => {
          setSelectedId(id);
          const hit = all.find((p) => p.id === id);
          if (hit) setFlyTo({ lat: hit.lat, lng: hit.lng, zoom: 15 });
        }}
      />

      <LayerMenu
        open={layersOpen}
        onClose={() => setLayersOpen(false)}
        layers={layers}
        onLayers={setLayers}
      />

      <RightDossier
        premisesId={selectedId}
        allPremises={all}
        onClose={() => setSelectedId(null)}
        onRequireAuth={requireAuth}
        authed={authed}
      />

      <AuthSheet open={authOpen} onClose={() => setAuthOpen(false)} reason={authReason} />

      <footer className="pointer-events-none absolute inset-x-0 bottom-0 z-[1000] flex justify-center px-2 pb-1">
        <div className="pointer-events-auto rounded-md bg-card/90 px-3 py-1 text-[10px] text-muted-foreground shadow-sm backdrop-blur-sm">
          Preliminary decision-support only — not legal, regulatory or financial advice.{" "}
          <Link to="/about" className="underline hover:text-foreground">
            About
          </Link>
        </div>
      </footer>

      {premisesQ.isLoading && (
        <div className="pointer-events-none absolute left-1/2 top-20 z-[1050] -translate-x-1/2 rounded-md bg-card px-3 py-1.5 text-xs text-muted-foreground shadow">
          Loading pharmacy records…
        </div>
      )}
    </div>
  );
}

function MapSkeleton() {
  return (
    <div className="absolute inset-0 grid place-items-center bg-muted text-xs text-muted-foreground">
      Loading map…
    </div>
  );
}
