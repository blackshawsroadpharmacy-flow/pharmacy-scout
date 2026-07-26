import { useEffect, useMemo, useRef, useState } from "react";
import { CircleMarker, MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import type { PublicPremises } from "@/lib/premises-public";
import type { ExternalCategory, ExternalMapPoint, ViewportBounds } from "@/lib/external-locations";

// Ensure default marker icons resolve under bundlers (used only as fallback).
import iconRetina from "leaflet/dist/images/marker-icon-2x.png";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";
L.Icon.Default.mergeOptions({ iconRetinaUrl: iconRetina, iconUrl, shadowUrl });

const VIC_CENTRE: [number, number] = [-37.05, 144.8];
const VIC_ZOOM = 7;

type Kind = "discovery" | "verified" | "partial" | "saved";

function isApproximate(p: PublicPremises) {
  return p.source_confidence === "approximate" || p.geocode_method === "suburb_centroid";
}

function clusterIcon(cluster: { getChildCount: () => number }) {
  return L.divIcon({
    html: `<div><span>${cluster.getChildCount()}</span></div>`,
    className: "marker-cluster-navy",
    iconSize: L.point(40, 40, true),
  });
}

function kindFor(p: PublicPremises, savedIds: Set<string>): Kind {
  if (savedIds.has(p.id)) return "saved";
  if (p.vpa_registration_status === "verified") return "verified";
  if (p.vpa_registration_status === "matched" || p.vpa_registration_status === "conflict")
    return "partial";
  return "discovery";
}

function FlyTo({ target }: { target: { lat: number; lng: number; zoom?: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lng], target.zoom ?? 15, { duration: 0.8 });
  }, [target, map]);
  return null;
}

function TileFallback() {
  const [failed, setFailed] = useState(false);
  return (
    <TileLayer
      key={failed ? "carto" : "osm"}
      attribution={
        failed
          ? '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors, &copy; CARTO'
          : '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }
      url={
        failed
          ? "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{y}/{x}{r}.png"
          : "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      }
      subdomains={failed ? ["a", "b", "c", "d"] : ["a", "b", "c"]}
      eventHandlers={{ tileerror: () => !failed && setFailed(true) }}
    />
  );
}

function ClickHandler({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onClick(e.latlng.lat, e.latlng.lng) });
  return null;
}

function ViewportReporter({ onChange }: { onChange: (bounds: ViewportBounds) => void }) {
  const map = useMapEvents({
    moveend: report,
    zoomend: report,
  });
  const timer = useRef<number | null>(null);
  function report() {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const bounds = map.getBounds();
      onChange({
        west: bounds.getWest(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        north: bounds.getNorth(),
      });
    }, 250);
  }
  useEffect(() => {
    report();
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);
  return null;
}

function externalIcon(point: ExternalMapPoint, selected: boolean) {
  const supermarket = point.category === "supermarkets";
  return L.divIcon({
    className: "",
    html: `<span class="external-pin ${supermarket ? "supermarket" : "medical-centre"}${selected ? " selected" : ""}" aria-hidden="true">${supermarket ? "S" : "M"}</span>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

export function MapView({
  premises,
  selectedId,
  onSelect,
  savedIds,
  flyTo,
  onMapClick,
  externalPoints = [],
  selectedExternal = null,
  onSelectExternal,
  onViewportChange,
  candidatePoint = null,
}: {
  premises: PublicPremises[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  savedIds: Set<string>;
  flyTo: { lat: number; lng: number; zoom?: number } | null;
  onMapClick?: (lat: number, lng: number) => void;
  externalPoints?: ExternalMapPoint[];
  selectedExternal?: { category: ExternalCategory; id: string } | null;
  onSelectExternal?: (point: ExternalMapPoint) => void;
  onViewportChange?: (bounds: ViewportBounds) => void;
  candidatePoint?: { lat: number; lng: number } | null;
}) {
  const iconCache = useRef(new Map<string, L.DivIcon>());
  const markers = useMemo(
    () =>
      premises.map((p) => {
        const kind = kindFor(p, savedIds);
        const selected = p.id === selectedId;
        const approximate = isApproximate(p);
        const key = `${kind}-${selected ? 1 : 0}-${approximate ? 1 : 0}`;
        let icon = iconCache.current.get(key);
        if (!icon) {
          const classes = [
            "pharmacy-pin",
            kind,
            approximate ? "approximate" : "",
            selected ? "selected" : "",
          ]
            .filter(Boolean)
            .join(" ");
          icon = L.divIcon({
            className: "",
            html: `<div class="${classes}"></div>`,
            iconSize: [30, 30],
            iconAnchor: [15, 15],
          });
          iconCache.current.set(key, icon);
        }
        return { p, icon };
      }),
    [premises, selectedId, savedIds],
  );

  return (
    <MapContainer
      center={VIC_CENTRE}
      zoom={VIC_ZOOM}
      minZoom={5}
      maxZoom={18}
      preferCanvas
      scrollWheelZoom
      className="absolute inset-0 h-full w-full"
      zoomControl={false}
    >
      <TileFallback />
      <FlyTo target={flyTo} />
      {onMapClick && <ClickHandler onClick={onMapClick} />}
      {onViewportChange && <ViewportReporter onChange={onViewportChange} />}
      {candidatePoint && (
        <CircleMarker
          center={[candidatePoint.lat, candidatePoint.lng]}
          radius={11}
          pathOptions={{
            color: "#7c3aed",
            fillColor: "#8b5cf6",
            fillOpacity: 0.35,
            weight: 3,
          }}
        />
      )}

      <MarkerClusterGroup
        chunkedLoading
        maxClusterRadius={60}
        disableClusteringAtZoom={13}
        iconCreateFunction={clusterIcon}
        showCoverageOnHover={false}
      >
        {markers.map(({ p, icon }) => (
          <Marker
            key={p.id}
            position={[p.lat, p.lng]}
            icon={icon}
            eventHandlers={{ click: () => onSelect(p.id) }}
          />
        ))}
      </MarkerClusterGroup>
      <MarkerClusterGroup
        chunkedLoading
        maxClusterRadius={50}
        disableClusteringAtZoom={14}
        showCoverageOnHover={false}
      >
        {externalPoints.map((point) => (
          <Marker
            key={`${point.category}:${point.id}`}
            position={[point.lat, point.lng]}
            icon={externalIcon(
              point,
              selectedExternal?.category === point.category && selectedExternal.id === point.id,
            )}
            eventHandlers={{ click: () => onSelectExternal?.(point) }}
            title={`${point.name} — ${point.category === "supermarkets" ? "Supermarket" : "Medical centre"}`}
          />
        ))}
      </MarkerClusterGroup>
    </MapContainer>
  );
}
