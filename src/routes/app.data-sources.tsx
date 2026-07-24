import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { listSourceRecords } from "@/lib/data-sources.functions";
import { getMyProfile, listMyOrgs } from "@/lib/orgs.functions";
import { EvidenceBadge } from "@/components/verification-badge";

export const Route = createFileRoute("/app/data-sources")({
  head: () => ({
    meta: [
      { title: "Data & Sources — Chemist Care" },
      {
        name: "description",
        content:
          "Registered data sources, licence status, coverage and freshness for the Opportunity Scout.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Data & Sources — Chemist Care" },
      { property: "og:description", content: "Registered data sources and freshness." },
    ],
  }),
  component: DataSourcesPage,
});

function DataSourcesPage() {
  const listFn = useServerFn(listSourceRecords);
  const q = useQuery({ queryKey: ["sources"], queryFn: () => listFn() });
  const profileFn = useServerFn(getMyProfile);
  const orgsFn = useServerFn(listMyOrgs);
  const profileQ = useQuery({ queryKey: ["profile"], queryFn: () => profileFn() });
  const orgsQ = useQuery({ queryKey: ["orgs"], queryFn: () => orgsFn() });
  const currentOrgName =
    (orgsQ.data ?? []).find((o) => o.id === profileQ.data?.current_organisation_id)?.name ?? null;

  return (
    <AppShell currentOrgName={currentOrgName}>
      <div className="mx-auto max-w-6xl">
        <div className="flex items-baseline justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Data & Sources</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Every dataset the Opportunity Scout uses, with its regulatory purpose, licence
              status, coverage and freshness. VPA and PBS records only appear once an admin
              imports a snapshot.
            </p>
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Purpose</th>
                <th className="px-4 py-3">Coverage</th>
                <th className="px-4 py-3">Fetched</th>
                <th className="px-4 py-3">Records</th>
                <th className="px-4 py-3">Licence</th>
                <th className="px-4 py-3">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {q.isLoading && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              )}
              {(q.data ?? []).map((s) => (
                <tr key={s.id} className="border-t border-border align-top">
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{s.source_name}</div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      {s.source_kind}
                    </div>
                    {s.source_url && (
                      <a
                        href={s.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-teal hover:underline"
                      >
                        {s.source_url.replace(/^https?:\/\//, "").slice(0, 40)}…
                      </a>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {s.regulatory_purpose ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {s.coverage_description ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {s.fetched_at ? new Date(s.fetched_at).toLocaleDateString() : (
                      <EvidenceBadge kind="missing">Not loaded</EvidenceBadge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">{s.row_count ?? "Unknown"}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {s.licence_or_terms_status ?? "Unknown"}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {s.confidence ?? "Unknown"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
          <h2 className="text-sm font-semibold text-foreground">Import a snapshot</h2>
          <p className="mt-2">
            VPA public register and PBS approvals must be imported by an administrator via CSV.
            Snapshot import is available in Phase 2. Phase 1 exposes the source records so
            reconciliation history and provenance are tracked from day one.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
