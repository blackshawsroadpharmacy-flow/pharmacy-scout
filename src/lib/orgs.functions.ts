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

export const createOrg = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ name: z.string().min(2).max(120) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: org, error } = await context.supabase
      .from("organisations")
      .insert({ name: data.name, created_by: context.userId })
      .select("id, name")
      .single();
    if (error) throw new Error(error.message);
    const { error: memberErr } = await context.supabase
      .from("organisation_members")
      .insert({ organisation_id: org.id, user_id: context.userId, role: "owner" });
    if (memberErr) throw new Error(memberErr.message);
    await context.supabase
      .from("profiles")
      .update({ current_organisation_id: org.id })
      .eq("id", context.userId);
    return org;
  });

export const setCurrentOrg = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ organisation_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({ current_organisation_id: data.organisation_id })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
