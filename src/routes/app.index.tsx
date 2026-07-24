import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { getMyProfile, listMyOrgs, createOrg, setCurrentOrg } from "@/lib/orgs.functions";
import { AppShell } from "@/components/app-shell";
import { OpportunityMap } from "@/components/opportunity-map";
import { listPremises } from "@/lib/premises.functions";

export const Route = createFileRoute("/app/")({
  head: () => ({
    meta: [
      { title: "Opportunity Map — Chemist Care" },
      {
        name: "description",
        content:
          "Verified pharmacy discovery points across the Camberwell demonstration region with source and verification badges.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Opportunity Map — Chemist Care" },
      { property: "og:description", content: "Verified pharmacy discovery points across Victoria." },
    ],
  }),
  component: MapPage,
});

function MapPage() {
  const router = useRouter();
  const navigate = useNavigate();
  const profileFn = useServerFn(getMyProfile);
  const orgsFn = useServerFn(listMyOrgs);
  const createOrgFn = useServerFn(createOrg);
  const setCurrentOrgFn = useServerFn(setCurrentOrg);
  const premisesFn = useServerFn(listPremises);

  const profileQ = useQuery({ queryKey: ["profile"], queryFn: () => profileFn() });
  const orgsQ = useQuery({ queryKey: ["orgs"], queryFn: () => orgsFn() });
  const premisesQ = useQuery({ queryKey: ["premises"], queryFn: () => premisesFn() });

  const [newOrgName, setNewOrgName] = useState("");
  const [creating, setCreating] = useState(false);

  const hasOrg = !!profileQ.data?.current_organisation_id;
  const availableOrgs = orgsQ.data ?? [];
  const currentOrgName =
    availableOrgs.find((o) => o.id === profileQ.data?.current_organisation_id)?.name ?? null;

  useEffect(() => {
    // If profile has no current org but user is a member of an org, adopt the first
    if (profileQ.data && !profileQ.data.current_organisation_id && availableOrgs[0]) {
      setCurrentOrgFn({ data: { organisation_id: availableOrgs[0].id } }).then(() =>
        router.invalidate(),
      );
    }
  }, [profileQ.data, availableOrgs, setCurrentOrgFn, router]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newOrgName.trim()) return;
    setCreating(true);
    try {
      await createOrgFn({ data: { name: newOrgName.trim() } });
      toast.success("Organisation created");
      setNewOrgName("");
      await router.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create organisation");
    } finally {
      setCreating(false);
    }
  }

  if (profileQ.isLoading || orgsQ.isLoading) {
    return (
      <AppShell>
        <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
          Loading…
        </div>
      </AppShell>
    );
  }

  if (!hasOrg && availableOrgs.length === 0) {
    return (
      <AppShell>
        <div className="mx-auto max-w-lg py-16">
          <h1 className="text-2xl font-semibold tracking-tight">Create your organisation</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Opportunities, notes and financials are private to your organisation.
          </p>
          <form onSubmit={onCreate} className="mt-6 flex flex-col gap-3">
            <label className="text-sm">
              Organisation name
              <input
                autoFocus
                value={newOrgName}
                onChange={(e) => setNewOrgName(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <button
              type="submit"
              disabled={creating}
              className="mt-2 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {creating ? "Creating…" : "Create organisation"}
            </button>
          </form>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell currentOrgName={currentOrgName} fullBleed>
      <div className="flex h-full flex-col">
        <div className="border-b border-border bg-card px-6 py-4">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Opportunity Map</h1>
              <p className="text-sm text-muted-foreground">
                Demonstration region: Camberwell, Hawthorn, Kew, Balwyn, Glen Iris and surrounding suburbs.
                You can pan across Victoria — outside this region, expect no source coverage.
              </p>
            </div>
            <button
              onClick={() => navigate({ to: "/app/acquisitions" })}
              className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent"
            >
              Open Acquisition Scout →
            </button>
          </div>
        </div>
        <div className="min-h-[560px] flex-1">
          <OpportunityMap
            premises={premisesQ.data ?? []}
            loading={premisesQ.isLoading}
            onDoorSaved={() => premisesQ.refetch()}
          />
        </div>
      </div>
    </AppShell>
  );
}
