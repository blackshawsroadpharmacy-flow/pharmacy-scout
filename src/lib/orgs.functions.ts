import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listMyOrgs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("organisation_members")
      .select("organisation_id, role, organisations(id, name, created_at)")
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({
      id: row.organisation_id,
      role: row.role,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      name: (row.organisations as any)?.name as string,
    }));
  });

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select("id, display_name, current_organisation_id")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

// Organisation creation is a single RPC so the org, the owner membership and
// the profile pointer either all land or none do.
export const createOrg = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ name: z.string().trim().min(2).max(120) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rows, error } = await (context.supabase as any).rpc("create_organisation", {
      _name: data.name,
    });
    if (error) throw new Error(error.message);
    const org = Array.isArray(rows) ? rows[0] : rows;
    if (!org?.id) throw new Error("Organisation could not be created.");
    return org as { id: string; name: string };
  });

export const setCurrentOrg = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ organisation_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    // Verify membership before writing. A DB trigger enforces the same rule,
    // but failing here produces a usable message instead of a raw PG error.
    const { data: membership, error: membershipError } = await context.supabase
      .from("organisation_members")
      .select("organisation_id")
      .eq("organisation_id", data.organisation_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (membershipError) throw new Error(membershipError.message);
    if (!membership) throw new Error("You are not a member of that organisation.");

    const { error } = await context.supabase
      .from("profiles")
      .update({ current_organisation_id: data.organisation_id })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listOrgInvitations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("current_organisation_id")
      .eq("id", context.userId)
      .maybeSingle();
    const org = profile?.current_organisation_id;
    if (!org) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (context.supabase as any)
      .from("organisation_invitations")
      .select("id, email, role, created_at, expires_at, accepted_at")
      .eq("organisation_id", org)
      .is("accepted_at", null)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{
      id: string;
      email: string;
      role: string;
      created_at: string;
      expires_at: string;
      accepted_at: string | null;
    }>;
  });

export const inviteToOrg = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        email: z.string().trim().email().max(320),
        role: z.enum(["owner", "admin", "member"]).default("member"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("current_organisation_id")
      .eq("id", context.userId)
      .maybeSingle();
    const org = profile?.current_organisation_id;
    if (!org) throw new Error("Select an organisation before inviting members.");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: invitation, error } = await (context.supabase as any)
      .from("organisation_invitations")
      .insert({
        organisation_id: org,
        email: data.email,
        role: data.role,
        invited_by: context.userId,
      })
      .select("id, email, role, token, expires_at")
      .single();
    if (error) throw new Error(error.message);
    return invitation as {
      id: string;
      email: string;
      role: string;
      token: string;
      expires_at: string;
    };
  });

export const acceptOrgInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ token: z.string().min(16).max(200) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rows, error } = await (context.supabase as any).rpc(
      "accept_organisation_invitation",
      { _token: data.token },
    );
    if (error) throw new Error(error.message);
    const org = Array.isArray(rows) ? rows[0] : rows;
    if (!org?.organisation_id) throw new Error("Invitation could not be accepted.");
    return org as { organisation_id: string; organisation_name: string };
  });
