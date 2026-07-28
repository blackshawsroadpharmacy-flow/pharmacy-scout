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
import { CandidateAnalysisPanel } from "@/components/map/candidate-analysis-panel";
import { useSession } from "@/hooks/use-session";
import {
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
import {
  fetchCandidateAnalysis,
  fetchPopulationContext,
  searchVictorianAddress,
  type CandidatePoint,
} from "@/lib/candidate-analysis";
import type { StatewideSearchResult } from "@/lib/statewide-search";
import { fetchPharmacyPipelineStatuses, type PipelineStage } from "@/lib/pharmacy-pipeline";
import {
  fetchMapDispensingPotentials,
  type MapDispensingPotential,
} from "@/lib/dispensing-potential";

const MapView = lazy(() =>
  import("@/components/map/map-view").then((m) => ({ default: m.MapView })),
);
const EMPTY_PIPELINE_STATUSES = new Map<
  string,
  import("@/lib/pharmacy-pipeline").PharmacyPipelineStatus
>();
const EMPTY_DISPENSING_POTENTIALS = new Map<string, MapDispensingPotential>();

type MapScreenProps = {
  selectedPremisesId?: string | null;
  publicMapState?: {
    lat?: number;
    lng?: number;
    zoom?: number;
    layers?: string;
    potential?: "all" | "strong" | "high-confidence";
  };
};

export function MapScreen({ selectedPremisesId = null, publicMapState }: MapScreenProps) {
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
  const [layers, setLayers] = useState<LayerState>(() => ({
    ...DEFAULT_LAYERS,
    supermarkets: publicMapState?.layers?.includes("supermarkets") ?? false,
    medicalCentres: publicMapState?.layers?.includes("medical") ?? false,
    populationDensity: publicMapState?.layers?.includes("density") ?? false,
    populationGrowth: publicMapState?.layers?.includes("growth") ?? false,
    dispensingPotential: publicMapState?.layers?.includes("potential") ?? false,
  }));
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number; zoom?: number } | null>(() =>
    publicMapState?.lat != null && publicMapState.lng != null
      ? { lat: publicMapState.lat, lng: publicMapState.lng, zoom: publicMapState.zoom }
      : null,
  );
  const [authOpen, setAuthOpen] = useState(false);
  const [authReason, setAuthReason] = useState("");
  const [viewport, setViewport] = useState<ViewportBounds | null>(null);
  const [candidatePoint, setCandidatePoint] = useState<CandidatePoint | null>(null);
  const [candidateRadiusM, setCandidateRadiusM] = useState(1500);
  const [addressSearchStatus, setAddressSearchStatus] = useState<string | null>(null);
  const [pipelineStageFilter, setPipelineStageFilter] = useState<PipelineStage | "all">("all");
  const [potentialFilter, setPotentialFilter] = useState<"all" | "strong" | "high-confidence">(
    publicMapState?.potential ?? "all",
  );
  const candidateMode = mode === "greenfield" || mode === "relocation";

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
  const candidateAnalysisQ = useQuery({
    queryKey: [
      "candidate-site-analysis",
      candidatePoint?.lat,
      candidatePoint?.lng,
      candidateRadiusM,
    ],
    queryFn: ({ signal }) => fetchCandidateAnalysis(candidatePoint!, candidateRadiusM, signal),
    enabled: candidateMode && candidatePoint != null,
    staleTime: 5 * 60 * 1000,
  });
  const candidatePopulationQ = useQuery({
    queryKey: ["candidate-population-context", candidatePoint?.lat, candidatePoint?.lng],
    queryFn: ({ signal }) => fetchPopulationContext(candidatePoint!, signal),
    enabled: candidateMode && candidatePoint != null,
    staleTime: 24 * 60 * 60 * 1000,
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
  const visiblePremisesIds = useMemo(() => all.map((point) => point.id), [all]);
  const pipelineQ = useQuery({
    queryKey: ["private-pipeline-map-statuses", visiblePremisesIds],
    queryFn: () => fetchPharmacyPipelineStatuses(visiblePremisesIds),
    enabled: authed && visiblePremisesIds.length > 0,
    staleTime: 60 * 1000,
  });
  const pipelineStatuses = authed
    ? (pipelineQ.data ?? EMPTY_PIPELINE_STATUSES)
    : EMPTY_PIPELINE_STATUSES;
  const dispensingPotentialQ = useQuery({
    queryKey: ["map-dispensing-potential", visiblePremisesIds],
    queryFn: () => fetchMapDispensingPotentials(visiblePremisesIds),
    enabled: layers.dispensingPotential && visiblePremisesIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });
  const dispensingPotentials = layers.dispensingPotential
    ? (dispensingPotentialQ.data ?? EMPTY_DISPENSING_POTENTIALS)
    : EMPTY_DISPENSING_POTENTIALS;

  useEffect(() => {
    setSelectedId(selectedPremisesId);
  }, [selectedPremisesId]);

  const pipelineFiltered =
    pipelineStageFilter === "all"
      ? all
      : all.filter(
          (point) => pipelineStatuses.get(point.id)?.pipeline_stage === pipelineStageFilter,
        );
  const filtered =
    !layers.dispensingPotential || potentialFilter === "all"
      ? pipelineFiltered
      : pipelineFiltered.filter((point) => {
          const rating = dispensingPotentials.get(point.id);
          if (!rating) return false;
          if (potentialFilter === "high-confidence") return rating.evidence_confidence === "high";
          return (rating.victorian_percentile ?? -1) >= 75;
        });
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

  function openPremises(id: string) {
    setSelectedExternal(null);
    setSelectedId(id);
  }

  function closePremises() {
    setSelectedId(null);
  }

  function showPremisesOnMap(id: string, lat: number, lng: number) {
    openPremises(id);
    setFlyTo({ lat, lng, zoom: 15 });
  }

  function openExternal(point: ExternalMapPoint) {
    setSelectedId(null);
    setSelectedExternal({ category: point.category, id: point.id });
    setFlyTo({ lat: point.lat, lng: point.lng, zoom: 15 });
  }

  function setCandidate(point: CandidatePoint) {
    setCandidatePoint(point);
    setSelectedExternal(null);
    setSelectedId(null);
    setFlyTo({ lat: point.lat, lng: point.lng, zoom: 15 });
    setLayers((current) => ({
      ...current,
      pharmacies: true,
      supermarkets: true,
      medicalCentres: true,
    }));
  }

  async function handleSearchFallback(q: string) {
    setAddressSearchStatus(null);
    if (candidateMode) {
      setAddressSearchStatus("Searching Victorian addresses…");
      try {
        const results = await searchVictorianAddress(q);
        const address = results[0];
        if (!address) {
          setAddressSearchStatus("No sourced Victorian address result found.");
          return;
        }
        setCandidate(address);
        setAddressSearchStatus(`Candidate placed: ${address.label}`);
        return;
      } catch (error) {
        setAddressSearchStatus(
          error instanceof Error ? error.message : "Address search could not be completed.",
        );
        return;
      }
    }
  }

  function handleStatewideSearchResult(result: StatewideSearchResult) {
    if (result.result_type === "acquisition_opportunity") {
      navigate({ to: "/app/acquisitions" });
      return;
    }
    if (result.result_type === "candidate_site") {
      if (result.lat != null && result.lng != null) {
        setMode("greenfield");
        setCandidate({
          lat: result.lat,
          lng: result.lng,
          label: result.result_name,
        });
      }
      return;
    }
    if (result.lat == null || result.lng == null) return;
    if (result.result_type === "pharmacy") {
      showPremisesOnMap(result.result_id, result.lat, result.lng);
      return;
    }
    const category = result.result_type === "supermarket" ? "supermarkets" : "medical_centres";
    setSelectedId(null);
    setSelectedExternal({ category, id: result.result_id });
    setLayers((current) => ({
      ...current,
      [category === "supermarkets" ? "supermarkets" : "medicalCentres"]: true,
    }));
    setFlyTo({ lat: result.lat, lng: result.lng, zoom: 15 });
  }

  function updateViewport(next: ViewportBounds & { lat: number; lng: number; zoom: number }) {
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
    if (window.location.pathname !== "/") return;
    const search = new URLSearchParams();
    search.set("lat", next.lat.toFixed(5));
    search.set("lng", next.lng.toFixed(5));
    search.set("z", String(next.zoom));
    const publicLayers = [
      layers.supermarkets ? "supermarkets" : null,
      layers.medicalCentres ? "medical" : null,
      layers.populationDensity ? "density" : null,
      layers.populationGrowth ? "growth" : null,
      layers.dispensingPotential ? "potential" : null,
    ].filter(Boolean);
    if (publicLayers.length) search.set("layers", publicLayers.join(","));
    if (layers.dispensingPotential && potentialFilter !== "all") {
      search.set("potential", potentialFilter);
    }
    window.history.replaceState(window.history.state, "", `/?${search.toString()}`);
  }

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-muted">
      <ClientOnly fallback={<MapSkeleton />}>
        <Suspense fallback={<MapSkeleton />}>
          <MapView
            premises={filtered}
            selectedId={selectedId}
            onSelect={openPremises}
            savedIds={new Set()}
            flyTo={flyTo}
            externalPoints={externalPoints}
            selectedExternal={selectedExternal}
            onSelectExternal={openExternal}
            onViewportChange={updateViewport}
            onMapClick={
              candidateMode
                ? (lat, lng) => {
                    setCandidate({ lat, lng, label: "Map-selected candidate" });
                  }
                : undefined
            }
            candidatePoint={candidateMode ? candidatePoint : null}
            candidateRadiusM={candidateRadiusM}
            candidateNearestPoint={
              candidateAnalysisQ.data?.nearest_conservative_pharmacy
                ? {
                    lat: candidateAnalysisQ.data.nearest_conservative_pharmacy.lat,
                    lng: candidateAnalysisQ.data.nearest_conservative_pharmacy.lng,
                  }
                : null
            }
            population={populationQ.data ?? null}
            populationMetric={populationMetric}
            pipelineStatuses={pipelineStatuses}
            dispensingPotentials={dispensingPotentials}
          />
        </Suspense>
      </ClientOnly>

      <TopBar
        mode={mode}
        onMode={setMode}
        onSearchFallback={handleSearchFallback}
        onSearchResult={handleStatewideSearchResult}
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
        onSelect={openPremises}
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

      {authed && pipelineStatuses.size > 0 && (
        <div className="absolute bottom-8 right-3 z-[1000] w-56 rounded-lg border border-border bg-card/95 p-3 text-xs shadow-lg backdrop-blur-sm">
          <label className="font-semibold text-foreground" htmlFor="pipeline-stage-filter">
            Acquisition pipeline
          </label>
          <select
            id="pipeline-stage-filter"
            value={pipelineStageFilter}
            onChange={(event) =>
              setPipelineStageFilter(event.target.value as PipelineStage | "all")
            }
            className="mt-2 w-full rounded border border-input bg-background px-2 py-1.5"
          >
            <option value="all">All visible pharmacies</option>
            <option value="watchlist">Watchlist</option>
            <option value="contacting">Contacting</option>
            <option value="im_received">IM received</option>
            <option value="due_diligence">Due diligence</option>
            <option value="offer">Offer</option>
            <option value="passed">Passed</option>
            <option value="acquired">Acquired</option>
          </select>
          <div className="mt-2 flex items-center gap-2 text-muted-foreground">
            <span className="pipeline-legend-marker" aria-hidden="true">
              P
            </span>
            <span>Coloured halo = private pipeline stage</span>
          </div>
        </div>
      )}
      {layers.dispensingPotential && (
        <div className="absolute bottom-8 left-3 z-[1000] w-60 rounded-lg border border-border bg-card/95 p-3 text-xs shadow-lg backdrop-blur-sm">
          <label className="font-semibold text-foreground" htmlFor="potential-filter">
            Geographic Dispensing Potential
          </label>
          <select
            id="potential-filter"
            value={potentialFilter}
            onChange={(event) => setPotentialFilter(event.target.value as typeof potentialFilter)}
            className="mt-2 w-full rounded border border-input bg-background px-2 py-1.5"
          >
            <option value="all">All evidence confidence</option>
            <option value="strong">Strong potential (75th+ percentile)</option>
            <option value="high-confidence">High evidence confidence</option>
          </select>
          <div className="mt-2 text-muted-foreground">
            Coloured badge = relative percentile. Dashed = low confidence. Red P fill is unchanged.
          </div>
        </div>
      )}

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
      {addressSearchStatus && candidateMode && (
        <ViewportNotice topClass="top-20">{addressSearchStatus}</ViewportNotice>
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
      {candidateMode && candidatePoint && (
        <CandidateAnalysisPanel
          point={candidatePoint}
          radiusM={candidateRadiusM}
          onRadius={setCandidateRadiusM}
          analysis={candidateAnalysisQ.data ?? null}
          population={candidatePopulationQ.data ?? null}
          loading={candidateAnalysisQ.isLoading || candidatePopulationQ.isLoading}
          error={
            candidateAnalysisQ.isError
              ? candidateAnalysisQ.error.message
              : candidatePopulationQ.isError
                ? candidatePopulationQ.error.message
                : null
          }
          onClose={() => setCandidatePoint(null)}
        />
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
