import { ClientOnly, Link, useNavigate } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchPharmacyViewport } from "@/lib/premises-public";
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
import { fetchVictorianPopulation, type PopulationMetric } from "@/lib/population-intelligence";
import {
  isCurrentViewportResult,
  normalizeViewportBounds,
  viewportRequestKey,
} from "@/lib/viewport-query.mjs";

const MapView = lazy(() =>
  import("@/components/map/map-view").then((m) => ({ default: m.MapView })),
);

type MapScreenProps = {
  selectedPremisesId?: string | null;
};

export function MapScreen({ selectedPremisesId = null }: MapScreenProps) {
  const navigate = useNavigate();
  const { user } = useSession();
  const authed = !!user;

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
  const [viewport, setViewport] = useState<ViewportBounds | null>(null);
  const [candidatePoint, setCandidatePoint] = useState<{ lat: number; lng: number } | null>(null);

  const pharmacyRequestKey = viewport ? viewportRequestKey("pharmacies", viewport, filters) : null;
  const premisesQ = useQuery({
    queryKey: ["pharmacy-viewport", pharmacyRequestKey],
    queryFn: ({ signal }) => fetchPharmacyViewport(viewport!, filters, signal),
    enabled: viewport != null && layers.pharmacies,
    staleTime: 5 * 60 * 1000,
  });
  const pharmacyResult = isCurrentViewportResult(pharmacyRequestKey, premisesQ.data)
    ? premisesQ.data
    : undefined;

  const viewportKey = useMemo(
    () =>
      viewport ? [viewport.west, viewport.south, viewport.east, viewport.north] : ["unavailable"],
    [viewport],
  );
  const supermarketQ = useQuery({
    queryKey: ["external-viewport", "supermarkets", ...viewportKey],
    queryFn: ({ signal }) => fetchExternalViewport("supermarkets", viewport!, signal),
    enabled: viewport != null && layers.supermarkets,
    staleTime: 5 * 60 * 1000,
  });
  const medicalCentresQ = useQuery({
    queryKey: ["external-viewport", "medical_centres", ...viewportKey],
    queryFn: ({ signal }) => fetchExternalViewport("medical_centres", viewport!, signal),
    enabled: viewport != null && layers.medicalCentres,
    staleTime: 5 * 60 * 1000,
  });
  const candidateSummaryQ = useQuery({
    queryKey: ["candidate-external-summary", candidatePoint?.lat, candidatePoint?.lng],
    queryFn: () => fetchCandidateExternalSummary(candidatePoint!.lat, candidatePoint!.lng),
    enabled: mode === "greenfield" && candidatePoint != null,
    staleTime: 5 * 60 * 1000,
  });
  const populationMetric: PopulationMetric | null = layers.populationGrowth
    ? "growth"
    : layers.populationDensity
      ? "density"
      : null;
  const populationQ = useQuery({
    queryKey: ["abs-population", "sa2", "2024"],
    queryFn: ({ signal }) => fetchVictorianPopulation(signal),
    enabled: populationMetric != null,
    staleTime: 24 * 60 * 60 * 1000,
  });

  const all = useMemo(() => pharmacyResult?.items ?? [], [pharmacyResult]);

  useEffect(() => {
    setSelectedId(selectedPremisesId);
  }, [selectedPremisesId]);

  const filtered = all;
  const externalPoints = useMemo(
    () => [
      ...(layers.supermarkets ? (supermarketQ.data?.items ?? []) : []),
      ...(layers.medicalCentres ? (medicalCentresQ.data?.items ?? []) : []),
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
    const normalized = normalizeViewportBounds(next);
    if (!normalized) return;
    setViewport((current) =>
      current &&
      current.west === normalized.west &&
      current.south === normalized.south &&
      current.east === normalized.east &&
      current.north === normalized.north
        ? current
        : normalized,
    );
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
            population={populationQ.data ?? null}
            populationMetric={populationMetric}
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
        resultCount={pharmacyResult?.totalCount ?? 0}
      />

      <LeftPanel
        open={leftOpen}
        onToggle={() => setLeftOpen((v) => !v)}
        mode={mode}
        filters={filters}
        onFilters={setFilters}
        premises={all}
        filtered={filtered}
        loading={premisesQ.isLoading}
        fetching={premisesQ.isFetching}
        error={premisesQ.isError ? "Pharmacy records could not be loaded for this area." : null}
        coverageNote={pharmacyResult?.coverageNote ?? null}
        totalCount={pharmacyResult?.totalCount ?? 0}
        metrics={pharmacyResult?.metrics ?? null}
        onSelect={(id) => {
          const hit = all.find((premises) => premises.id === id);
          openPremises(id, hit?.lat, hit?.lng);
        }}
      />

      <LayerMenu
        open={layersOpen}
        onClose={() => setLayersOpen(false)}
        layers={layers}
        onLayers={(next) => {
          if (next.populationDensity && !layers.populationDensity) next.populationGrowth = false;
          if (next.populationGrowth && !layers.populationGrowth) next.populationDensity = false;
          setLayers(next);
        }}
      />

      <RightDossier
        premisesId={selectedId}
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

      {premisesQ.isFetching && (
        <div className="pointer-events-none absolute left-1/2 top-20 z-[1050] -translate-x-1/2 rounded-md bg-card px-3 py-1.5 text-xs text-muted-foreground shadow">
          Updating visible pharmacy records…
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
      {populationMetric && (
        <PopulationLegend metric={populationMetric} loading={populationQ.isFetching} />
      )}
      {layers.supermarkets && supermarketQ.isSuccess && supermarketQ.data.items.length === 0 && (
        <ViewportNotice topClass="top-28">
          No supermarket records in this view · {supermarketQ.data.coverageNote}
        </ViewportNotice>
      )}
      {layers.medicalCentres &&
        medicalCentresQ.isSuccess &&
        medicalCentresQ.data.items.length === 0 && (
          <ViewportNotice topClass="top-36">
            No medical-centre records in this view · {medicalCentresQ.data.coverageNote}
          </ViewportNotice>
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

function ViewportNotice({ children, topClass }: { children: React.ReactNode; topClass: string }) {
  return (
    <div
      className={`pointer-events-none absolute left-1/2 z-[1040] max-w-[min(560px,calc(100vw-24px))] -translate-x-1/2 rounded-md border border-border bg-card/95 px-3 py-1.5 text-center text-[11px] text-muted-foreground shadow ${topClass}`}
    >
      {children}
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

function PopulationLegend({ metric, loading }: { metric: PopulationMetric; loading: boolean }) {
  const rows =
    metric === "density"
      ? [
          ["< 10", "#eff6ff"],
          ["10–99", "#bfdbfe"],
          ["100–499", "#60a5fa"],
          ["500–1,999", "#2563eb"],
          ["2,000–4,999", "#1d4ed8"],
          ["5,000+", "#172554"],
        ]
      : [
          ["< -1%", "#991b1b"],
          ["-1–0%", "#ef4444"],
          ["0–1%", "#fde68a"],
          ["1–2%", "#86efac"],
          ["2–4%", "#22c55e"],
          ["4%+", "#166534"],
        ];
  return (
    <aside className="pointer-events-auto absolute bottom-8 right-3 z-[950] w-52 rounded-lg border border-border bg-card/95 p-3 text-[10px] shadow backdrop-blur">
      <div className="font-semibold text-foreground">
        {metric === "density" ? "Population density" : "Population growth"}
      </div>
      <div className="text-muted-foreground">
        {metric === "density" ? "people per km², 2024" : "change, 2023–24"}
        {loading ? " · loading…" : ""}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
        {rows.map(([label, colour]) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: colour }} />
            <span>{label}</span>
          </div>
        ))}
      </div>
      <a
        href="https://www.abs.gov.au/statistics/people/population/regional-population"
        target="_blank"
        rel="noreferrer"
        className="mt-2 block text-teal underline"
      >
        Source: ABS Regional Population
      </a>
    </aside>
  );
}
