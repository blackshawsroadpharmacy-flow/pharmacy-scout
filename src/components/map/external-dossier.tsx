import { useQuery } from "@tanstack/react-query";
import { Building2, MapPin, ShoppingBasket, X } from "lucide-react";
import { fetchExternalDossier, type ExternalCategory } from "@/lib/external-locations";

export function ExternalDossier({
  category,
  id,
  onClose,
}: {
  category: ExternalCategory;
  id: string;
  onClose: () => void;
}) {
  const query = useQuery({
    queryKey: ["external-dossier", category, id],
    queryFn: () => fetchExternalDossier(category, id),
    staleTime: 10 * 60 * 1000,
  });
  const dossier = query.data;
  const supermarket = category === "supermarkets";

  return (
    <aside className="pointer-events-auto absolute right-3 top-16 bottom-3 z-[1000] flex w-[420px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-lg">
      <div className="flex items-start justify-between border-b border-border p-4">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {supermarket ? (
              <ShoppingBasket className="h-3.5 w-3.5" />
            ) : (
              <Building2 className="h-3.5 w-3.5" />
            )}
            {supermarket ? "Supermarket discovery record" : "Medical centre discovery record"}
          </div>
          <h2 className="mt-1 truncate text-base font-semibold">{dossier?.name ?? "Loading…"}</h2>
          {dossier?.address && (
            <p className="mt-1 flex items-start gap-1 text-xs text-muted-foreground">
              <MapPin className="mt-0.5 h-3 w-3 shrink-0" /> {dossier.address}
            </p>
          )}
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 hover:bg-accent"
          aria-label="Close dossier"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 text-sm">
        {query.isLoading && <p className="text-xs text-muted-foreground">Loading dossier…</p>}
        {query.isError && <p className="text-xs text-destructive">Dossier could not be loaded.</p>}
        {dossier && (
          <div className="space-y-5">
            <FactSection title="Verification">
              <Fact label="Status" value={dossier.verification_status} />
              <Fact
                label="Coordinate confidence"
                value={`${Math.round(Number(dossier.coordinate_confidence) * 100)}%`}
              />
              <Fact label="Coordinate method" value={dossier.coordinate_method} />
            </FactSection>
            <FactSection title={supermarket ? "Supermarket details" : "Medical centre details"}>
              {supermarket ? (
                <>
                  <Fact label="Brand" value={dossier.brand} />
                  <Fact label="Opening hours" value={dossier.opening_hours} />
                  <Fact
                    label="Floor area"
                    value={
                      dossier.floor_area_sqm == null
                        ? "Not published by this source"
                        : `${dossier.floor_area_sqm} m²`
                    }
                  />
                </>
              ) : (
                <>
                  <Fact label="Services" value={dossier.services?.join(", ")} />
                  <Fact label="Opening hours" value={dossier.opening_hours} />
                  <Fact
                    label="Known practitioners"
                    value={
                      dossier.known_practitioners == null
                        ? "Not published by this source"
                        : String(dossier.known_practitioners.length)
                    }
                  />
                </>
              )}
            </FactSection>
            <FactSection title="Source and coverage">
              <Fact label="Source" value={dossier.source_name} />
              <Fact label="Licence" value={dossier.licence_name} />
              <Fact label="Coverage" value={dossier.geographic_coverage} />
              <Fact label="Last imported" value={new Date(dossier.fetched_at).toLocaleString()} />
              {dossier.source_url && (
                <a
                  className="text-xs text-teal underline"
                  href={dossier.source_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  View source record
                </a>
              )}
            </FactSection>
            <div className="rounded-md border border-amber/40 bg-amber/5 p-3 text-xs leading-relaxed text-muted-foreground">
              {supermarket
                ? "Nearby discovery does not establish a Pharmacy Location Rule floor-area threshold. Professional evidence remains required."
                : "A nearby clinic does not establish prescriber capacity or satisfy a legal requirement. Practitioner evidence remains unverified."}
            </div>
            {dossier.conflicts.length > 0 && (
              <div className="rounded-md border border-destructive/40 p-3 text-xs">
                {dossier.conflicts.length} unresolved sourced-field conflict(s).
              </div>
            )}
          </div>
        )}
      </div>
      <div className="border-t border-border px-4 py-2 text-[10px] text-muted-foreground">
        {dossier?.attribution_text ?? "Source attribution unavailable"}
      </div>
    </aside>
  );
}

function FactSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <dl className="mt-2 space-y-1.5">{children}</dl>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-2 text-xs">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value == null || value === "" ? "Unknown" : String(value)}</dd>
    </div>
  );
}
