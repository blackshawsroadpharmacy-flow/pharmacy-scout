import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import iconRetina from "leaflet/dist/images/marker-icon-2x.png";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";
import type { PremisesRow } from "@/lib/premises.functions";
import { VerificationBadge, EvidenceBadge } from "@/components/verification-badge";
import { setPremisesDoor } from "@/lib/premises.functions";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { SCREENING_DISCLAIMER } from "@/lib/language";

// Fix Leaflet default icon paths under bundlers.
L.Icon.Default.mergeOptions({
  iconRetinaUrl: iconRetina,
  iconUrl,
  shadowUrl,
});

const CAMBERWELL_CENTRE: [number, number] = [-37.828, 145.06];
// Bounding box for the demo region (roughly)
const COVERAGE_BOUNDS: [[number, number], [number, number]] = [
  [-37.9, 144.99],
  [-37.75, 145.13],
];

function inCoverage(lat: number | null, lng: number | null) {
  if (lat == null || lng == null) return false;
  return (
    lat >= COVERAGE_BOUNDS[0][0] &&
    lat <= COVERAGE_BOUNDS[1][0] &&
    lng >= COVERAGE_BOUNDS[0][1] &&
    lng <= COVERAGE_BOUNDS[1][1]
  );
}

const VERIFICATION_COLOR: Record<string, string> = {
  unverified: "#6b7280",
  matched: "#c98908",
  verified: "#0f9d8a",
  conflict: "#b91c1c",
};

export function OpportunityMap({
  premises,
  loading,
  onDoorSaved,
}: {
  premises: PremisesRow[];
  loading?: boolean;
  onDoorSaved?: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [placingDoor, setPlacingDoor] = useState(false);
  const [viewportInCoverage, setViewportInCoverage] = useState(true);

  const setDoorFn = useServerFn(setPremisesDoor);
  const selected = useMemo(
    () => premises.find((p) => p.id === selectedId) ?? null,
    [premises, selectedId],
  );

  return (
    <div className="relative flex h-full min-h-[560px]">
      <div className="relative flex-1">
        {!viewportInCoverage && (
          <div className="absolute left-4 top-4 z-[500] max-w-sm rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground shadow-sm">
            <span className="font-semibold text-foreground">No source coverage.</span> The
            demonstration region covers Camberwell, Hawthorn, Kew, Balwyn, Glen Iris and
            surrounding suburbs. Discovery points outside this area are not available in Phase 1.
          </div>
        )}

        <MapContainer
          center={CAMBERWELL_CENTRE}
          zoom={13}
          minZoom={7}
          scrollWheelZoom
          className="h-full w-full"
        >
          <TileLayer
            attribution='&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{y}/{x}.png"
          />
          <ViewportWatcher onChange={(b) => setViewportInCoverage(b)} />

          {premises.map((p) => {
            const hasPoint = p.lat != null && p.lng != null;
            if (!hasPoint) return null;
            const color = VERIFICATION_COLOR[p.vpa_registration_status] ?? "#6b7280";
            return (
              <CircleMarker
                key={p.id}
                center={[p.lat!, p.lng!]}
                radius={7}
                pathOptions={{ color, weight: 2, fillColor: color, fillOpacity: 0.7 }}
                eventHandlers={{ click: () => setSelectedId(p.id) }}
              />
            );
          })}

          {selected && selected.door_lat != null && selected.door_lng != null && (
            <Marker position={[selected.door_lat, selected.door_lng]}>
              <Popup>Public door point ({selected.door_source ?? "unknown"})</Popup>
            </Marker>
          )}

          {placingDoor && selected && (
            <DoorPlacementLayer
              onPick={async (lat, lng) => {
                try {
                  await setDoorFn({ data: { premises_id: selected.id, lat, lng } });
                  toast.success("Door point saved");
                  setPlacingDoor(false);
                  onDoorSaved?.();
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Failed to save door point");
                }
              }}
            />
          )}
        </MapContainer>

        {loading && (
          <div className="absolute right-4 top-4 z-[500] rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground shadow-sm">
            Loading premises…
          </div>
        )}
      </div>

      <PremisesDossier
        selected={selected}
        inCoverage={selected ? inCoverage(selected.lat, selected.lng) : true}
        placingDoor={placingDoor}
        onStartPlacingDoor={() => setPlacingDoor(true)}
        onCancelPlacingDoor={() => setPlacingDoor(false)}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}

function ViewportWatcher({ onChange }: { onChange: (inCoverage: boolean) => void }) {
  const map = useMap();
  const cbRef = useRef(onChange);
  cbRef.current = onChange;
  useEffect(() => {
    function check() {
      const c = map.getCenter();
      cbRef.current(inCoverage(c.lat, c.lng));
    }
    check();
    map.on("moveend", check);
    return () => {
      map.off("moveend", check);
    };
  }, [map]);
  return null;
}

function DoorPlacementLayer({
  onPick,
}: {
  onPick: (lat: number, lng: number) => void;
}) {
  const map = useMap();
  useEffect(() => {
    function click(e: L.LeafletMouseEvent) {
      onPick(e.latlng.lat, e.latlng.lng);
    }
    map.on("click", click);
    map.getContainer().style.cursor = "crosshair";
    return () => {
      map.off("click", click);
      map.getContainer().style.cursor = "";
    };
  }, [map, onPick]);
  return null;
}

function PremisesDossier({
  selected,
  inCoverage,
  placingDoor,
  onStartPlacingDoor,
  onCancelPlacingDoor,
  onClose,
}: {
  selected: PremisesRow | null;
  inCoverage: boolean;
  placingDoor: boolean;
  onStartPlacingDoor: () => void;
  onCancelPlacingDoor: () => void;
  onClose: () => void;
}) {
  if (!selected) {
    return (
      <aside className="hidden w-96 shrink-0 border-l border-border bg-card p-6 md:block">
        <h2 className="text-base font-semibold">Premises dossier</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Click a point on the map to open its dossier. Every record shows its source, fetched
          date and verification status.
        </p>
        <div className="mt-6 space-y-3 text-xs text-muted-foreground">
          <Legend />
        </div>
      </aside>
    );
  }

  const hasPBS = selected.pbs_approvals.some((a) => a.approval_status === "verified");

  return (
    <aside className="hidden w-96 shrink-0 overflow-y-auto border-l border-border bg-card p-6 md:block">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold leading-snug">{selected.name}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{selected.address}</p>
          {selected.suburb && (
            <p className="text-xs text-muted-foreground">
              {selected.suburb} {selected.postcode ?? ""}
            </p>
          )}
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-muted-foreground hover:bg-accent"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <VerificationBadge
          status={selected.vpa_registration_status as "unverified" | "matched" | "verified" | "conflict"}
          label={
            selected.vpa_registration_status === "verified"
              ? "VPA register: verified"
              : selected.vpa_registration_status === "matched"
                ? "VPA register: matched (pending verification)"
                : "VPA register: not confirmed"
          }
        />
        <VerificationBadge
          status={hasPBS ? "verified" : "unverified"}
          label={hasPBS ? "PBS approval: verified" : "PBS approval: not confirmed"}
        />
        {!inCoverage && <EvidenceBadge kind="coverage">No source coverage</EvidenceBadge>}
      </div>

      <section className="mt-6">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Source
        </h3>
        <dl className="mt-2 space-y-1 text-sm">
          <Row k="Source" v={selected.source_name ?? "Unknown"} />
          <Row k="Kind" v={selected.premises_source} />
          <Row k="Confidence" v={selected.source_confidence ?? "Unknown"} />
          <Row
            k="Fetched"
            v={selected.source_fetched_at ? new Date(selected.source_fetched_at).toLocaleString() : "Unknown"}
          />
          {selected.source_url && (
            <div className="text-xs">
              <a
                href={selected.source_url}
                target="_blank"
                rel="noreferrer"
                className="text-teal hover:underline"
              >
                View source →
              </a>
            </div>
          )}
        </dl>
      </section>

      <section className="mt-6">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Location points
        </h3>
        <dl className="mt-2 space-y-1 text-sm">
          <Row
            k="Address centroid"
            v={
              selected.lat != null && selected.lng != null
                ? `${selected.lat.toFixed(5)}, ${selected.lng.toFixed(5)}`
                : "Unknown"
            }
          />
          <Row
            k="Public door"
            v={
              selected.door_lat != null && selected.door_lng != null
                ? `${selected.door_lat.toFixed(5)}, ${selected.door_lng.toFixed(5)} (${selected.door_source ?? "unknown"})`
                : "Not set — using address centroid as estimate"
            }
          />
          {selected.door_verified_at && (
            <Row k="Door verified" v={new Date(selected.door_verified_at).toLocaleString()} />
          )}
        </dl>
        <div className="mt-3">
          {placingDoor ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-amber">Click on the map to place the public door.</span>
              <button onClick={onCancelPlacingDoor} className="text-xs underline">
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={onStartPlacingDoor}
              className="rounded-md border border-input px-3 py-1.5 text-xs font-medium hover:bg-accent"
            >
              Correct the public door point
            </button>
          )}
        </div>
      </section>

      {selected.notes && (
        <section className="mt-6 rounded-md bg-muted p-3 text-xs leading-relaxed text-muted-foreground">
          {selected.notes}
        </section>
      )}

      <p className="mt-6 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
        {SCREENING_DISCLAIMER}
      </p>
    </aside>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="text-right text-foreground">{v}</dd>
    </div>
  );
}

function Legend() {
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-semibold text-foreground">Verification legend</div>
      {(
        [
          ["verified", "Verified from source register"],
          ["matched", "Matched, pending verification"],
          ["unverified", "Unverified discovery record"],
          ["conflict", "Source conflict"],
        ] as const
      ).map(([k, label]) => (
        <div key={k} className="flex items-center gap-2">
          <span
            className="inline-block h-3 w-3 rounded-full"
            style={{ backgroundColor: VERIFICATION_COLOR[k] }}
          />
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}
