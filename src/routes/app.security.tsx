import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { fetchOrganisationSecurityStatus } from "@/lib/security-status";

export const Route = createFileRoute("/app/security")({
  head: () => ({
    meta: [{ title: "Security status — Chemist Care" }, { name: "robots", content: "noindex" }],
  }),
  component: SecurityStatusPage,
});

function SecurityStatusPage() {
  const query = useQuery({
    queryKey: ["organisation-security-status"],
    queryFn: fetchOrganisationSecurityStatus,
  });
  const status = query.data;

  return (
    <AppShell currentOrgName={status?.organisation_name}>
      <div className="mx-auto max-w-3xl">
        <h1 className="text-xl font-semibold tracking-tight">Commercial security status</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Administrator-only summary. It contains no document contents, credentials or signed URLs.
        </p>
        {query.isLoading && (
          <p className="mt-6 text-sm text-muted-foreground">Checking controls…</p>
        )}
        {query.isError && (
          <div className="mt-6 rounded-lg border border-destructive/40 p-4 text-sm text-destructive">
            {query.error.message}
          </div>
        )}
        {status && (
          <dl className="mt-6 grid gap-4 rounded-xl border border-border bg-card p-5 sm:grid-cols-2">
            <StatusFact label="Current organisation" value={status.organisation_name} />
            <StatusFact label="Members" value={String(status.member_count)} />
            <StatusFact
              label="Private storage"
              value={status.private_bucket_public ? "Configuration error: public" : "Private"}
            />
            <StatusFact label="Storage bucket" value={status.private_bucket} />
            <StatusFact
              label="Last audit event"
              value={
                status.last_audit_event
                  ? new Date(status.last_audit_event).toLocaleString("en-AU")
                  : "No audit events yet"
              }
            />
            <StatusFact
              label="Orphaned demo records"
              value={`${status.orphaned_demo_records} require assignment or archival review`}
            />
          </dl>
        )}
      </div>
    </AppShell>
  );
}

function StatusFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-medium">{value}</dd>
    </div>
  );
}
