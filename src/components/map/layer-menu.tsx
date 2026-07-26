import { X } from "lucide-react";

export interface LayerState {
  pharmacies: boolean;
  verifiedPbs: boolean;
  verifiedVpa: boolean;
  saved: boolean;
  candidates: boolean;
  supermarkets: boolean;
  medicalCentres: boolean;
}

export const DEFAULT_LAYERS: LayerState = {
  pharmacies: true,
  verifiedPbs: true,
  verifiedVpa: true,
  saved: true,
  candidates: true,
  supermarkets: false,
  medicalCentres: false,
};

const ACTIVE: Array<{ key: keyof LayerState; label: string }> = [
  { key: "pharmacies", label: "All pharmacies" },
  { key: "verifiedPbs", label: "Verified PBS approvals" },
  { key: "verifiedVpa", label: "Verified VPA premises" },
  { key: "saved", label: "Saved acquisition targets" },
  { key: "candidates", label: "Candidate greenfield sites" },
  { key: "supermarkets", label: "Supermarkets" },
  { key: "medicalCentres", label: "Medical centres" },
];

const PLACEHOLDERS = [
  "Hospitals",
  "Shopping centres",
  "Population density",
  "Residents aged 65+",
  "Population growth",
  "Parking",
  "Planning & development activity",
];

export function LayerMenu({
  open,
  onClose,
  layers,
  onLayers,
}: {
  open: boolean;
  onClose: () => void;
  layers: LayerState;
  onLayers: (l: LayerState) => void;
}) {
  if (!open) return null;
  return (
    <div className="pointer-events-auto absolute right-3 top-16 z-[1200] w-72 rounded-xl border border-border bg-card p-3 shadow-lg">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Layers
        </div>
        <button onClick={onClose} className="rounded p-1 hover:bg-accent" aria-label="Close">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="mt-2 space-y-1">
        {ACTIVE.map((l) => (
          <label
            key={l.key}
            className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-accent/60"
          >
            <input
              type="checkbox"
              checked={layers[l.key]}
              onChange={(e) => onLayers({ ...layers, [l.key]: e.target.checked })}
              className="h-3.5 w-3.5 accent-navy"
            />
            <span>{l.label}</span>
          </label>
        ))}
      </div>
      <div className="mt-3 border-t border-border pt-2">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          No source coverage yet
        </div>
        <ul className="space-y-0.5 text-[11px] text-muted-foreground">
          {PLACEHOLDERS.map((p) => (
            <li key={p} className="flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
              {p}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
          These layers appear once a data provider is connected. Missing data is never interpreted
          as zero.
        </p>
      </div>
    </div>
  );
}
