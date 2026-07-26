import { ClientOnly, Link, useNavigate } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPremises } from "@/lib/premises-public";
import { TopBar, type Mode } from "@/components/map/top-bar";
import { LeftPanel, DEFAULT_FILTERS, type Filters } from "@/components/map/left-panel";
import { LayerMenu, DEFAULT_LAYERS, type LayerState } from "@/components/map/layer-menu";
import { RightDossier } from "@/components/map/right-dossier";
import { ExternalDossier } from "@/components/map/external-dossier";
import { AuthSheet } from "@/components/map/auth-sheet";
import { useSession } from "@/hooks/use-session";
import {
  fetchCandidateExternalSummary,
  fetchExternalViewport,
  type ExternalCategory,
  type ExternalMapPoint,
  type ViewportBounds,
} from "@/lib/external-locations";

const MapView = lazy(() =>
  import("@/components/map/map-view").then((m) => ({ default: m.MapView })),
);

const METRO_BOUNDS = { minLat: -38.5, maxLat: -37.4, minLng: 144.5, maxLng: 145.6 };
const VIC_QUERY_BOUNDS: ViewportBounds = {
  west: 140.9,
  south: -39.2,
  east: 150,
  north: -33.9,
};

type MapScreenProps = {
  selectedPremisesId?: string | null;
};

export function MapScreen({ selectedPremisesId = null }: MapScreenProps) {
  const navigate = useNavigate();
  const { user } = useSession();
  const authed = !!user;

  const premisesQ = useQuery({
    queryKey: ["premises-public"],
    queryFn: fetchAllPremises,
    staleTime: 5 * 60 * 1000,
  });

  const [mode, setMode] = useState<Mode>("explore");
  const [selectedId, setSelectedId] = useState<string | null>(selectedPremisesId);
  const [selectedExternal, setSelectedExternal] = useState<{
    category: ExternalCategory;
    id: string;
  } | null>(null);
  const [leftOpen, setLeftOpen] = useState(true);
  const [layersOpen, setLayersOpen] = useState(false);
  const [layers, setLayers] = useState<LayerState>(DEFAULT_LAYERS);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number; zoom?: number } | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authReason, setAuthReason] = useState("");
  const [viewport, setViewport] = useState<ViewportBounds>(VIC_QUERY_BOUNDS);
  const [candidatePoint, setCandidatePoint] = useState<{ lat: number; lng: number } | null>(null);

  const viewportKey = useMemo(
    () => [
      Number(viewport.west.toFixed(3)),
      Number(viewport.south.toFixed(3)),
      Number(viewport.east.toFixed(3)),
      Number(viewport.north.toFixed(3)),
    ],
    [viewport],
  );
  const supermarketQ = useQuery({
    queryKey: ["external-viewport", "supermarkets", ...viewportKey],
    queryFn: ({ signal }) => fetchExternalViewport("supermarkets", viewport, signal),
    enabled: layers.supermarkets,
    staleTime: 5 * 60 * 1000,
  });
  const medicalCentresQ = useQuery({
    queryKey: ["external-viewport", "medical_centres", ...viewportKey],
    queryFn: ({ signal }) => fetchExternalViewport("medical_centres", viewport, signal),
    enabled: layers.medicalCentres,
    staleTime: 5 * 60 * 1000,
  });
  const candidateSummaryQ = useQuery({
    queryKey: ["candidate-external-summary", candidatePoint?.lat, candidatePoint?.lng],
    queryFn: () => fetchCandidateExternalSummary(candidatePoint!.lat, candidatePoint!.lng),
    enabled: mode === "greenfield" && candidatePoint != null,
    staleTime: 5 * 60 * 1000,
  });

  const all = useMemo(() => premisesQ.data ?? [], [premisesQ.data]);

  useEffect(() => {
    setSelectedId(selectedPremisesId);
  }, [selectedPremisesId]);

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
        ) {
          return false;
        }
      }
      if (filters.pbsKnown) return false;
      if (filters.missingData && p.vpa_registration_status !== "unverified") return false;
      return true;
    });
  }, [all, filters, layers.pharmacies]);
  const externalPoints = useMemo(
    () => [
      ...(layers.supermarkets ? (supermarketQ.data ?? []) : []),
      ...(layers.medicalCentres ? (medicalCentresQ.data ?? []) : []),
    ],
    [layers.supermarkets, layers.medicalCentres, supermarketQ.data, medicalCentresQ.data],
  );

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

  function openPremises(id: string, lat?: number, lng?: number) {
    setSelectedExternal(null);
    setSelectedId(id);
    if (lat != null && lng != null) {
      setFlyTo({ lat, lng, zoom: 15 });
    }
    navigate({
      to: "/pharmacy/$id",
      params: { id },
    });
  }

  function closePremises() {
    setSelectedId(null);
    navigate({ to: "/" });
  }

  function openExternal(point: ExternalMapPoint) {
    setSelectedId(null);
    setSelectedExternal({ category: point.category, id: point.id });
    setFlyTo({ lat: point.lat, lng: point.lng, zoom: 15 });
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
      openPremises(hit.id, hit.lat, hit.lng);
      return;
    }
    const externalHit = externalPoints.find(
      (point) =>
        point.name.toLowerCase().includes(needle) ||
        (point.address ?? "").toLowerCase().includes(needle),
    );
    if (externalHit) openExternal(externalHit);
  }

  function updateViewport(next: ViewportBounds) {
    const clipped = {
      west: Math.max(VIC_QUERY_BOUNDS.west, next.west),
      south: Math.max(VIC_QUERY_BOUNDS.south, next.south),
      east: Math.min(VIC_QUERY_BOUNDS.east, next.east),
      north: Math.min(VIC_QUERY_BOUNDS.north, next.north),
    };
    if (clipped.west < clipped.east && clipped.south < clipped.north) setViewport(clipped);
  }

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-muted">
      <ClientOnly fallback={<MapSkeleton />}>
        <Suspense fallback={<MapSkeleton />}>
          <MapView
            premises={filtered}
            selectedId={selectedId}
            onSelect={(id) => {
              const hit = all.find((premises) => premises.id === id);
              openPremises(id, hit?.lat, hit?.lng);
            }}
            savedIds={new Set()}
            flyTo={flyTo}
            externalPoints={externalPoints}
            selectedExternal={selectedExternal}
            onSelectExternal={openExternal}
            onViewportChange={updateViewport}
            onMapClick={
              mode === "greenfield"
                ? (lat, lng) => {
                    setCandidatePoint({ lat, lng });
                    setSelectedExternal(null);
                    setSelectedId(null);
                  }
                : undefined
            }
            candidatePoint={mode === "greenfield" ? candidatePoint : null}
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
          const hit = all.find((premises) => premises.id === id);
          openPremises(id, hit?.lat, hit?.lng);
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
        onClose={closePremises}
        onRequireAuth={requireAuth}
        authed={authed}
      />
      {selectedExternal && (
        <ExternalDossier
          category={selectedExternal.category}
          id={selectedExternal.id}
          onClose={() => setSelectedExternal(null)}
        />
      )}

      <AuthSheet open={authOpen} onClose={() => setAuthOpen(false)} reason={authReason} />

      <footer className="pointer-events-none absolute inset-x-0 bottom-0 z-[1000] flex justify-center px-2 pb-1">
        <div className="pointer-events-auto rounded-md bg-card/90 px-3 py-1 text-[10px] text-muted-foreground shadow-sm backdrop-blur-sm">
          Indicative eligibility for due-diligence purposes only. Not legal or financial advice.
          Verify against the current Pharmacy Location Rules and the ACPA before acting.{" "}
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
      {(supermarketQ.isFetching || medicalCentresQ.isFetching) && (
        <div className="pointer-events-none absolute left-1/2 top-28 z-[1050] -translate-x-1/2 rounded-md bg-card px-3 py-1.5 text-xs text-muted-foreground shadow">
          Loading external location layers…
        </div>
      )}
      {(supermarketQ.isError || medicalCentresQ.isError) && (
        <div className="pointer-events-none absolute left-1/2 top-28 z-[1050] -translate-x-1/2 rounded-md border border-destructive/40 bg-card px-3 py-1.5 text-xs text-destructive shadow">
          External layer unavailable for this viewport.
        </div>
      )}
      {mode === "greenfield" && candidatePoint && (
        <aside className="pointer-events-auto absolute bottom-4 left-1/2 z-[1050] w-[min(520px,calc(100vw-24px))] -translate-x-1/2 rounded-xl border border-border bg-card p-3 text-xs shadow-lg">
          <div className="font-semibold">Preliminary candidate-site signals</div>
          {candidateSummaryQ.isLoading && (
            <p className="mt-1 text-muted-foreground">Calculating nearby discovery records…</p>
          )}
          {candidateSummaryQ.data && (
            <>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div className="rounded border border-border p-2">
                  <div className="text-muted-foreground">Supermarkets within 500 m</div>
                  <div className="text-lg font-semibold">
                    {candidateSummaryQ.data.supermarkets_within_500m}
                  </div>
                </div>
                <div className="rounded border border-border p-2">
                  <div className="text-muted-foreground">Medical centres within 500 m</div>
                  <div className="text-lg font-semibold">
                    {candidateSummaryQ.data.medical_centres_within_500m}
                  </div>
                </div>
              </div>
              <p className="mt-2 font-medium">{candidateSummaryQ.data.assessment}</p>
              <p className="mt-1 text-muted-foreground">
                Discovery data only. Professional measurement and sourced regulatory evidence remain
                required.
              </p>
            </>
          )}
        </aside>
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
