import { createFileRoute, Link } from "@tanstack/react-router";
import { Map, Briefcase, ShieldCheck, ArrowRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { DisclaimerFooter } from "@/components/disclaimer-footer";
import { fetchPublicDataFreshness } from "@/lib/statewide-search";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About — Chemist Care Pharmacy Scout" },
      {
        name: "description",
        content:
          "About the Chemist Care Pharmacy Opportunity Scout — a map-first decision-support tool for Victorian pharmacist owners and prospective buyers.",
      },
      { property: "og:title", content: "About — Chemist Care Pharmacy Scout" },
      {
        property: "og:description",
        content:
          "Map-first decision support for Victorian pharmacy acquisition, greenfield and relocation opportunities.",
      },
    ],
  }),
  component: About,
});

function About() {
  const freshnessQ = useQuery({
    queryKey: ["public-data-freshness"],
    queryFn: fetchPublicDataFreshness,
    staleTime: 5 * 60 * 1000,
  });
  const freshness = freshnessQ.data;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-md bg-navy text-navy-foreground text-xs font-semibold">
              CC
            </div>
            <div>
              <div className="text-sm font-semibold">Chemist Care</div>
              <div className="text-xs text-muted-foreground">Pharmacy Opportunity Scout</div>
            </div>
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Open map <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-4xl px-6 py-12">
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
            Map-first pharmacy intelligence for Victoria.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
            The Chemist Care Pharmacy Opportunity Scout starts with a live map of Victorian pharmacy
            discovery records. You can pan, search and inspect records anonymously. Sign in only
            when you want to save an acquisition target, place a candidate greenfield site, analyse
            a relocation, add private financial notes, or upload documents.
          </p>

          <div className="mt-10 grid gap-6 md:grid-cols-3">
            <Feature icon={Map} title="Explore">
              A full-screen map of pharmacy discovery points, clustered at low zoom and revealed
              individually as you zoom in. Verification, source and confidence stay visible on every
              record.
            </Feature>
            <Feature icon={Briefcase} title="Acquisition">
              Save pharmacies to a private pipeline. Track watchlist through offer and outcome.
              Financial analysis appears only when you enter private commercial data.
            </Feature>
            <Feature icon={ShieldCheck} title="Verified sources">
              Every dataset shows its regulatory purpose, licence status, coverage and last refresh.
              VPA and PBS status only appear once an admin imports a snapshot from the authoritative
              register.
            </Feature>
          </div>

          <div className="mt-12 rounded-xl border border-border bg-card p-6">
            <h2 className="text-lg font-semibold tracking-tight">What Phase 1 does not do</h2>
            <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
              <li>· No automated Pharmacy Location Rules evaluation.</li>
              <li>· No routing-distance measurement — straight-line only.</li>
              <li>· No planning or foot-traffic data.</li>
              <li>· No financial modelling on public data.</li>
              <li>· No automatic classification of a pharmacy as underperforming.</li>
            </ul>
          </div>

          <section className="mt-8 rounded-xl border border-border bg-card p-6">
            <h2 className="text-lg font-semibold tracking-tight">Build information</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Safe deployment identity and public-source freshness. No credentials are displayed.
            </p>
            <dl className="mt-4 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
              <BuildFact
                label="Git commit"
                value={shortCommit(import.meta.env.VITE_BUILD_COMMIT_SHA)}
              />
              <BuildFact label="Build date" value={formatDate(import.meta.env.VITE_BUILD_DATE)} />
              <BuildFact
                label="Environment"
                value={import.meta.env.VITE_BUILD_ENVIRONMENT || "unknown"}
              />
              <BuildFact
                label="Supabase project"
                value={import.meta.env.VITE_SUPABASE_PROJECT_ID || "unknown"}
              />
              <BuildFact
                label="Latest pharmacy import"
                value={formatDate(freshness?.latest_pharmacy_import)}
              />
              <BuildFact
                label="Latest supermarket import"
                value={formatDate(freshness?.latest_supermarket_import)}
              />
              <BuildFact
                label="Latest medical-centre import"
                value={formatDate(freshness?.latest_medical_centre_import)}
              />
              <BuildFact
                label="ABS reference period"
                value={freshness?.abs_reference_period ?? loadingValue(freshnessQ.isLoading)}
              />
              <BuildFact
                label="Schema version"
                value={freshness?.schema_version ?? loadingValue(freshnessQ.isLoading)}
              />
            </dl>
            {freshnessQ.isError && (
              <p className="mt-3 text-xs text-destructive">
                Public data-freshness metadata is temporarily unavailable.
              </p>
            )}
          </section>
        </section>
      </main>

      <DisclaimerFooter />
    </div>
  );
}

function BuildFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-all font-mono text-xs text-foreground">{value}</dd>
    </div>
  );
}

function shortCommit(value: string | undefined) {
  if (!value || value === "unknown") return "unknown";
  return value.slice(0, 12);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "No source coverage";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "Unknown";
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Australia/Melbourne",
  }).format(date);
}

function loadingValue(loading: boolean) {
  return loading ? "Loading…" : "No source coverage";
}

function Feature({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Map;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <Icon className="h-6 w-6 text-teal" />
      <h3 className="mt-3 text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}
