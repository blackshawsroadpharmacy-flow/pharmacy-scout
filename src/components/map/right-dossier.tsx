import { useEffect, useState } from "react";
import { X, MapPin, Bookmark, Navigation } from "lucide-react";
import { fetchDossier, type PremisesDossier, type PublicPremises } from "@/lib/premises-public";
import { VerificationBadge, EvidenceBadge } from "@/components/verification-badge";

export function RightDossier({
  premisesId,
  allPremises,
  onClose,
  onRequireAuth,
  authed,
}: {
  premisesId: string | null;
  allPremises: PublicPremises[];
  onClose: () => void;
  onRequireAuth: (reason: string) => void;
  authed: boolean;
}) {
  const [dossier, setDossier] = useState<PremisesDossier | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!premisesId) {
      setDossier(null);
      return;
    }
    setLoading(true);
    fetchDossier(premisesId, allPremises)
      .then(setDossier)
      .finally(() => setLoading(false));
  }, [premisesId, allPremises]);

  if (!premisesId) return null;

  return (
    <aside className="pointer-events-auto absolute right-3 top-16 bottom-3 z-[1000] flex w-[380px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-lg">
      <div className="flex items-start justify-between border-b border-border p-4">
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Pharmacy discovery record
          </div>
          <h2 className="mt-1 truncate text-base font-semibold tracking-tight">
            {dossier?.name ?? "Loading…"}
          </h2>
          {dossier && (
            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3 shrink-0" />
              {dossier.address}
              {dossier.suburb ? `, ${dossier.suburb}` : ""} {dossier.postcode ?? ""}
            </p>
          )}
        </div>
        <button onClick={onClose} className="rounded-md p-1 hover:bg-accent" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 text-sm">
        {loading && !dossier && (
          <div className="text-xs text-muted-foreground">Loading dossier…</div>
        )}
        {dossier && (
          <>
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Verification
              </h3>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <VerificationBadge
                  status={dossier.vpa_registration_status}
                  label={`VPA: ${labelForStatus(dossier.vpa_registration_status)}`}
                />
                {dossier.pbs_approvals.length ? (
                  dossier.pbs_approvals.map((a) => (
                    <VerificationBadge
                      key={a.approval_number}
                      status={a.approval_status as never}
                      label={`PBS #${a.approval_number}`}
                    />
                  ))
                ) : (
                  <EvidenceBadge kind="missing">PBS approval unknown</EvidenceBadge>
                )}
              </div>
            </section>

            <section className="mt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Source
              </h3>
              <div className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                <div>
                  <span className="text-foreground">{dossier.source_name ?? "Manual entry"}</span>
                  {dossier.source_confidence && ` · confidence: ${dossier.source_confidence}`}
                </div>
                {dossier.source_fetched_at && (
                  <div>Fetched {new Date(dossier.source_fetched_at).toLocaleDateString()}</div>
                )}
              </div>
            </section>

            <section className="mt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Nearest pharmacy discovery records
              </h3>
              <ul className="mt-2 space-y-1.5">
                {dossier.nearest.map((n) => (
                  <li key={n.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate">
                      <span className="text-foreground">{n.name}</span>
                      {n.suburb && (
                        <span className="text-muted-foreground"> · {n.suburb}</span>
                      )}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {(n.distance_m / 1000).toFixed(2)} km
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="mt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Nearby market signals
              </h3>
              <div className="mt-2 space-y-1.5 text-xs text-muted-foreground">
                <div className="rounded-md border border-dashed border-border px-2.5 py-1.5">
                  Medical centres — no source coverage for this area
                </div>
                <div className="rounded-md border border-dashed border-border px-2.5 py-1.5">
                  Supermarkets — no source coverage for this area
                </div>
                <div className="rounded-md border border-dashed border-border px-2.5 py-1.5">
                  Local population — no source coverage for this area
                </div>
              </div>
            </section>
          </>
        )}
      </div>

      <div className="border-t border-border bg-muted/40 p-3">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() =>
              authed
                ? window.location.assign("/app/acquisitions")
                : onRequireAuth("Save this pharmacy to your acquisition pipeline.")
            }
            className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:opacity-90"
          >
            <Bookmark className="h-3.5 w-3.5" /> Save target
          </button>
          <button
            onClick={() =>
              authed
                ? window.location.assign("/app/acquisitions")
                : onRequireAuth("Sign in to analyse a relocation scenario.")
            }
            className="inline-flex items-center justify-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-xs font-medium hover:bg-accent"
          >
            <Navigation className="h-3.5 w-3.5" /> Relocate
          </button>
        </div>
      </div>
    </aside>
  );
}

function labelForStatus(s: string) {
  return s === "verified"
    ? "Verified"
    : s === "matched"
      ? "Matched"
      : s === "conflict"
        ? "Conflict"
        : "Unverified";
}
