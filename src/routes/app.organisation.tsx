import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { z } from "zod";
import { AppShell } from "@/components/app-shell";
import {
  acceptOrgInvitation,
  createOrg,
  getMyProfile,
  inviteToOrg,
  listMyOrgs,
  listOrgInvitations,
  setCurrentOrg,
} from "@/lib/orgs.functions";

export const Route = createFileRoute("/app/organisation")({
  head: () => ({
    meta: [{ title: "Organisation — Chemist Care" }, { name: "robots", content: "noindex" }],
  }),
  validateSearch: (search: Record<string, unknown>) =>
    z.object({ invite: z.string().optional() }).parse(search),
  component: OrganisationPage,
});

function OrganisationPage() {
  const { invite } = Route.useSearch();
  const qc = useQueryClient();
  const profileFn = useServerFn(getMyProfile);
  const orgsFn = useServerFn(listMyOrgs);
  const createFn = useServerFn(createOrg);
  const switchFn = useServerFn(setCurrentOrg);
  const inviteFn = useServerFn(inviteToOrg);
  const acceptFn = useServerFn(acceptOrgInvitation);
  const invitationsFn = useServerFn(listOrgInvitations);

  const profile = useQuery({ queryKey: ["profile"], queryFn: () => profileFn() });
  const orgs = useQuery({ queryKey: ["orgs"], queryFn: () => orgsFn() });
  const invitations = useQuery({
    queryKey: ["org-invitations", profile.data?.current_organisation_id],
    queryFn: () => invitationsFn(),
    enabled: !!profile.data?.current_organisation_id,
  });

  const [name, setName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"member" | "admin" | "owner">("member");
  const [busy, setBusy] = useState(false);
  const [acceptedToken, setAcceptedToken] = useState<string | null>(null);

  const currentOrgId = profile.data?.current_organisation_id ?? null;
  const orgList = orgs.data ?? [];
  const currentOrgName = orgList.find((o) => o.id === currentOrgId)?.name ?? null;
  const isAdmin = orgList.some(
    (o) => o.id === currentOrgId && (o.role === "owner" || o.role === "admin"),
  );

  async function refreshAll() {
    await qc.invalidateQueries();
  }

  // An invite link lands here as ?invite=<token>. Accept once, then clear it.
  useEffect(() => {
    if (!invite || acceptedToken === invite) return;
    setAcceptedToken(invite);
    (async () => {
      try {
        const result = await acceptFn({ data: { token: invite } });
        toast.success(`Joined ${result.organisation_name}`);
        await refreshAll();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Invitation could not be accepted");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invite, acceptedToken]);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const org = await createFn({ data: { name } });
      toast.success(`Created ${org.name}`);
      setName("");
      await refreshAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Organisation could not be created");
    } finally {
      setBusy(false);
    }
  }

  async function handleSwitch(organisationId: string) {
    setBusy(true);
    try {
      await switchFn({ data: { organisation_id: organisationId } });
      await refreshAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not switch organisation");
    } finally {
      setBusy(false);
    }
  }

  async function handleInvite(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const created = await inviteFn({ data: { email: inviteEmail, role: inviteRole } });
      const link = `${window.location.origin}/app/organisation?invite=${created.token}`;
      await navigator.clipboard.writeText(link).catch(() => undefined);
      toast.success(`Invitation created for ${created.email} — link copied to clipboard`);
      setInviteEmail("");
      await refreshAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Invitation could not be created");
    } finally {
      setBusy(false);
    }
  }

  const loading = profile.isLoading || orgs.isLoading;

  return (
    <AppShell currentOrgName={currentOrgName}>
      <main className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-semibold">Organisation</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Private commercial records — pipeline, notes, information memorandums, saved scenarios and
          calibration evidence — all belong to an organisation. Create one to get started, or accept
          an invitation from a colleague.
        </p>

        {!loading && !currentOrgId && (
          <div className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <b>No organisation selected.</b> Until you create or join one, the acquisition pipeline,
            private notes, saved scenarios and Opportunity Radar stay unavailable.
          </div>
        )}

        <section className="mt-5 rounded-xl border bg-card p-4">
          <h2 className="font-semibold">Your organisations</h2>
          {loading ? (
            <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
          ) : orgList.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              You are not a member of any organisation yet.
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {orgList.map((org) => (
                <li
                  key={org.id}
                  className="flex items-center justify-between rounded border p-3 text-sm"
                >
                  <span>
                    <b>{org.name}</b>
                    <span className="ml-2 text-xs uppercase text-muted-foreground">{org.role}</span>
                  </span>
                  {org.id === currentOrgId ? (
                    <span className="text-xs font-medium text-teal">Current</span>
                  ) : (
                    <button
                      className="text-xs underline disabled:opacity-50"
                      disabled={busy}
                      onClick={() => handleSwitch(org.id)}
                    >
                      Switch to this
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-5 rounded-xl border bg-card p-4">
          <h2 className="font-semibold">Create an organisation</h2>
          <form onSubmit={handleCreate} className="mt-3 flex flex-wrap items-end gap-2">
            <label className="flex flex-1 flex-col gap-1 text-sm">
              Name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                minLength={2}
                maxLength={120}
                placeholder="Blackshaws Road Pharmacy Group"
                className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <button
              type="submit"
              disabled={busy || name.trim().length < 2}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              Create
            </button>
          </form>
        </section>

        {currentOrgId && isAdmin && (
          <section className="mt-5 rounded-xl border bg-card p-4">
            <h2 className="font-semibold">Invite a colleague</h2>
            <p className="text-xs text-muted-foreground">
              The invitation is tied to this email address and expires in 14 days. The link is
              copied to your clipboard — send it to them yourself.
            </p>
            <form onSubmit={handleInvite} className="mt-3 flex flex-wrap items-end gap-2">
              <label className="flex flex-1 flex-col gap-1 text-sm">
                Email
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Role
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as typeof inviteRole)}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                  <option value="owner">Owner</option>
                </select>
              </label>
              <button
                type="submit"
                disabled={busy}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
              >
                Create invitation
              </button>
            </form>

            {(invitations.data ?? []).length > 0 && (
              <ul className="mt-4 flex flex-col gap-2 text-sm">
                {(invitations.data ?? []).map((row) => (
                  <li key={row.id} className="flex justify-between rounded border p-2">
                    <span>
                      {row.email}{" "}
                      <span className="text-xs uppercase text-muted-foreground">{row.role}</span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      expires {new Date(row.expires_at).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </main>
    </AppShell>
  );
}
