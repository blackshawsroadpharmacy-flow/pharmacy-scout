import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import type { PublicPremises } from "@/lib/premises-public";

// Ensure default marker icons resolve under bundlers (used only as fallback).
import iconRetina from "leaflet/dist/images/marker-icon-2x.png";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";
L.Icon.Default.mergeOptions({ iconRetinaUrl: iconRetina, iconUrl, shadowUrl });

const VIC_CENTRE: [number, number] = [-37.05, 144.8];
const VIC_ZOOM = 7;

type Kind = "discovery" | "verified" | "partial" | "saved";

function pinIcon(kind: Kind, selected: boolean) {
  const classes = ["pharmacy-pin", kind, selected ? "selected" : ""].filter(Boolean).join(" ");
  return L.divIcon({
    className: "",
    html: `<span class="${classes}"></span>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
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
      key={failed ? "osm" : "carto"}
      attribution='&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors, &copy; CARTO'
      url={
        failed
          ? "https://{s}.tile.openstreetmap.org/{z}/{y}/{x}.png"
          : "https://{s}.basemaps.cartocdn.com/rastertiles/light_all/{z}/{y}/{x}{r}.png"
      }
      eventHandlers={{ tileerror: () => !failed && setFailed(true) }}
    />
  );
}

function ClickHandler({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onClick(e.latlng.lat, e.latlng.lng) });
  return null;
}

export function MapView({
  premises,
  selectedId,
  onSelect,
  savedIds,
  flyTo,
  onMapClick,
}: {
  premises: PublicPremises[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  savedIds: Set<string>;
  flyTo: { lat: number; lng: number; zoom?: number } | null;
  onMapClick?: (lat: number, lng: number) => void;
}) {
  const iconCache = useRef(new Map<string, L.DivIcon>());
  const markers = useMemo(
    () =>
      premises.map((p) => {
        const kind = kindFor(p, savedIds);
        const selected = p.id === selectedId;
        const key = `${kind}-${selected ? 1 : 0}`;
        let icon = iconCache.current.get(key);
        if (!icon) {
          icon = pinIcon(kind, selected);
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
    </MapContainer>
  );
}
