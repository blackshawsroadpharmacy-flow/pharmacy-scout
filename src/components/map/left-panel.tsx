import { ChevronLeft, ChevronRight } from "lucide-react";
import type { PublicPremises } from "@/lib/premises-public";
import type { Mode } from "./top-bar";

export interface Filters {
  verified: boolean;
  pbsKnown: boolean;
  missingData: boolean;
  metroOnly: boolean;
}

export const DEFAULT_FILTERS: Filters = {
  verified: false,
  pbsKnown: false,
  missingData: false,
  metroOnly: false,
};

export function LeftPanel({
  open,
  onToggle,
  mode,
  filters,
  onFilters,
  premises,
  filtered,
  onSelect,
}: {
  open: boolean;
  onToggle: () => void;
  mode: Mode;
  filters: Filters;
  onFilters: (f: Filters) => void;
  premises: PublicPremises[];
  filtered: PublicPremises[];
  onSelect: (id: string) => void;
}) {
  return (
    <aside
      className={
        "pointer-events-auto absolute left-3 top-16 bottom-3 z-[1000] flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-lg transition-[width] " +
        (open ? "w-[300px]" : "w-10")
      }
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        {open && (
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {mode === "explore" && "Explore filters"}
            {mode === "acquisition" && "Acquisition pipeline"}
            {mode === "greenfield" && "Greenfield planner"}
            {mode === "relocation" && "Relocation scenarios"}
          </div>
        )}
        <button
          onClick={onToggle}
          aria-label={open ? "Collapse panel" : "Expand panel"}
          className="rounded p-1 hover:bg-accent"
        >
          {open ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
      </div>

      {open && (
        <div className="flex-1 overflow-y-auto p-3 text-sm">
          {mode === "explore" && (
            <ExploreBody
              filters={filters}
              onFilters={onFilters}
              premises={premises}
              filtered={filtered}
              onSelect={onSelect}
            />
          )}
          {mode === "acquisition" && (
            <ModeStub
              title="Acquisition workflow"
              body="Sign in to save pharmacies as acquisition targets, track pipeline stage, and record private financial notes."
              action={{ label: "Open Acquisition Scout", href: "/app/acquisitions" }}
            />
          )}
          {mode === "greenfield" && (
            <ModeStub
              title="Greenfield candidate site"
              body="Click anywhere on the map to place a candidate greenfield location. Nearby pharmacies and preliminary distance rings appear here. Rule pathway evaluation arrives in Phase 2."
            />
          )}
          {mode === "relocation" && (
            <ModeStub
              title="Relocation scenario"
              body="Select an existing pharmacy as the origin, then click a proposed destination. Commercial signals appear alongside preliminary competing pharmacies. Legal screening remains separate."
            />
          )}
        </div>
      )}
    </aside>
  );
}

function ExploreBody({
  filters,
  onFilters,
  premises,
  filtered,
  onSelect,
}: {
  filters: Filters;
  onFilters: (f: Filters) => void;
  premises: PublicPremises[];
  filtered: PublicPremises[];
  onSelect: (id: string) => void;
}) {
  const total = premises.length;
  const approximateRows = filtered.filter(
    (p) => p.source_confidence === "approximate" || p.geocode_method === "suburb_centroid",
  );
  const approximateCount = approximateRows.length;
  const streetLevelCount = filtered.length - approximateCount;
  return (
    <>
      <div className="rounded-md border border-border bg-muted/40 p-2.5 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Shown</span>
          <span className="font-semibold tabular-nums">{filtered.length}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Total loaded</span>
          <span className="tabular-nums">{total}</span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 border-t border-border pt-2">
          <div className="rounded border border-border bg-card px-2 py-1">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Street level
            </div>
            <div className="mt-0.5 font-semibold tabular-nums">{streetLevelCount}</div>
          </div>
          <div className="rounded border border-border bg-card px-2 py-1">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Approximate
            </div>
            <div className="mt-0.5 font-semibold tabular-nums">{approximateCount}</div>
          </div>
        </div>
      </div>

      <fieldset className="mt-3 space-y-2 text-xs">
        <Toggle
          checked={filters.verified}
          onChange={(v) => onFilters({ ...filters, verified: v })}
          label="Only verified VPA registration"
        />
        <Toggle
          checked={filters.pbsKnown}
          onChange={(v) => onFilters({ ...filters, pbsKnown: v })}
          label="Only PBS approval known"
        />
        <Toggle
          checked={filters.missingData}
          onChange={(v) => onFilters({ ...filters, missingData: v })}
          label="Only records missing data"
        />
        <Toggle
          checked={filters.metroOnly}
          onChange={(v) => onFilters({ ...filters, metroOnly: v })}
          label="Metropolitan Melbourne only"
        />
      </fieldset>

      <div className="mt-3">
        <div className="mb-2 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="inline-block h-3 w-3 rounded-full bg-navy" />
          <span>Exact geocode</span>
          <span className="inline-block h-3 w-3 rounded-full border-2 border-navy bg-card" />
          <span>Approximate suburb fallback</span>
        </div>
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Results
        </div>
        <ul className="mt-1 divide-y divide-border overflow-hidden rounded-md border border-border">
          {filtered.slice(0, 40).map((p) => (
            <li key={p.id}>
              <button
                onClick={() => onSelect(p.id)}
                className="block w-full text-left px-2.5 py-1.5 text-xs hover:bg-accent"
              >
                <div className="truncate font-medium text-foreground">{p.name}</div>
                <div className="truncate text-muted-foreground">
                  {p.address}
                  {p.suburb ? `, ${p.suburb}` : ""}
                </div>
              </button>
            </li>
          ))}
          {filtered.length > 40 && (
            <li className="px-2.5 py-1.5 text-[11px] text-muted-foreground">
              +{filtered.length - 40} more — zoom or filter to narrow
            </li>
          )}
        </ul>
      </div>

      {approximateRows.length > 0 && (
        <div className="mt-3">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Geocode review queue
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            These markers are using suburb-centroid fallback coordinates and should be reviewed
            before any rule measurement or commercial decision.
          </p>
          <ul className="mt-2 divide-y divide-border overflow-hidden rounded-md border border-amber-200 bg-amber-50/50">
            {approximateRows.slice(0, 12).map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => onSelect(p.id)}
                  className="block w-full px-2.5 py-1.5 text-left text-xs hover:bg-amber-100/60"
                >
                  <div className="truncate font-medium text-foreground">{p.name}</div>
                  <div className="truncate text-muted-foreground">
                    {p.suburb}
                    {p.postcode ? ` ${p.postcode}` : ""}
                    {p.geocode_method ? ` • ${p.geocode_method.replaceAll("_", " ")}` : ""}
                  </div>
                </button>
              </li>
            ))}
            {approximateRows.length > 12 && (
              <li className="px-2.5 py-1.5 text-[11px] text-muted-foreground">
                +{approximateRows.length - 12} more approximate locations awaiting review
              </li>
            )}
          </ul>
        </div>
      )}
    </>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-accent/60">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 accent-navy"
      />
      <span>{label}</span>
    </label>
  );
}

function ModeStub({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: { label: string; href: string };
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{body}</p>
      {action && (
        <a
          href={action.href}
          className="mt-3 inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
        >
          {action.label}
        </a>
      )}
    </div>
  );
}
