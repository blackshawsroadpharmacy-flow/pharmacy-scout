import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function requireCurrentOrg(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("profiles")
    .select("current_organisation_id")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const org = data?.current_organisation_id as string | null | undefined;
  if (!org) throw new Error("No organisation selected. Create or select an organisation first.");
  return org;
}

async function ensureProfile(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  orgId: string,
  premisesId: string,
  userId: string,
) {
  const { data: existing, error: existingError } = await supabase
    .from("pharmacy_profiles")
    .select("id")
    .eq("organisation_id", orgId)
    .eq("premises_id", premisesId)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (existing?.id) return existing.id as string;

  const { data: created, error: createError } = await supabase
    .from("pharmacy_profiles")
    .insert({
      organisation_id: orgId,
      premises_id: premisesId,
      created_by: userId,
    })
    .select("id")
    .single();
  if (createError) throw new Error(createError.message);
  return created.id as string;
}

const premisesIdSchema = z.object({ premises_id: z.string().uuid() });

export const getPharmacyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => premisesIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const orgId = await requireCurrentOrg(context.supabase, context.userId);

    const { data: profile, error: profileError } = await context.supabase
      .from("pharmacy_profiles")
      .select(
        "id, premises_id, status, asking_price, revenue, script_volume, owner_licensee, notes, notes_updated_at, updated_at",
      )
      .eq("organisation_id", orgId)
      .eq("premises_id", data.premises_id)
      .maybeSingle();
    if (profileError) throw new Error(profileError.message);

    const profileId = profile?.id as string | undefined;
    const [notesRes, attachmentsRes] = await Promise.all([
      profileId
        ? context.supabase
            .from("pharmacy_note_entries")
            .select("id, note_text, created_at")
            .eq("pharmacy_profile_id", profileId)
            .order("created_at", { ascending: false })
            .limit(10)
        : Promise.resolve({ data: [], error: null }),
      profileId
        ? context.supabase
            .from("pharmacy_im_attachments")
            .select("id, storage_path, file_name, mime_type, size_bytes, created_at")
            .eq("pharmacy_profile_id", profileId)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (notesRes.error) throw new Error(notesRes.error.message);
    if (attachmentsRes.error) throw new Error(attachmentsRes.error.message);

    return {
      profile: profile ?? {
        id: null,
        premises_id: data.premises_id,
        status: "active",
        asking_price: null,
        revenue: null,
        script_volume: null,
        owner_licensee: null,
        notes: "",
        notes_updated_at: null,
        updated_at: null,
      },
      notesHistory: notesRes.data ?? [],
      attachments: attachmentsRes.data ?? [],
      organisationId: orgId,
    };
  });

export const upsertPharmacyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        premises_id: z.string().uuid(),
        status: z.enum(["active", "underperforming", "target", "under_offer"]),
        asking_price: z.number().nullable(),
        revenue: z.number().nullable(),
        script_volume: z.number().int().nullable(),
        owner_licensee: z.string().max(300).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const orgId = await requireCurrentOrg(context.supabase, context.userId);
    const profileId = await ensureProfile(
      context.supabase,
      orgId,
      data.premises_id,
      context.userId,
    );
    const { error } = await context.supabase
      .from("pharmacy_profiles")
      .update({
        status: data.status,
        asking_price: data.asking_price,
        revenue: data.revenue,
        script_volume: data.script_volume,
        owner_licensee: data.owner_licensee,
      })
      .eq("id", profileId);
    if (error) throw new Error(error.message);
    return { ok: true, profileId };
  });

export const savePharmacyNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        premises_id: z.string().uuid(),
        notes: z.string().max(20000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const orgId = await requireCurrentOrg(context.supabase, context.userId);
    const profileId = await ensureProfile(
      context.supabase,
      orgId,
      data.premises_id,
      context.userId,
    );

    const { data: existing, error: existingError } = await context.supabase
      .from("pharmacy_profiles")
      .select("notes")
      .eq("id", profileId)
      .single();
    if (existingError) throw new Error(existingError.message);

    if ((existing.notes ?? "") === data.notes) {
      return { ok: true, profileId, changed: false };
    }

    const { error: updateError } = await context.supabase
      .from("pharmacy_profiles")
      .update({
        notes: data.notes,
        notes_updated_at: new Date().toISOString(),
        notes_updated_by: context.userId,
      })
      .eq("id", profileId);
    if (updateError) throw new Error(updateError.message);

    const { error: noteError } = await context.supabase.from("pharmacy_note_entries").insert({
      pharmacy_profile_id: profileId,
      organisation_id: orgId,
      premises_id: data.premises_id,
      note_text: data.notes,
      created_by: context.userId,
    });
    if (noteError) throw new Error(noteError.message);

    return { ok: true, profileId, changed: true };
  });

export const registerImAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        premises_id: z.string().uuid(),
        storage_path: z.string().min(1).max(500),
        file_name: z.string().min(1).max(255),
        mime_type: z.string().max(200).nullable(),
        size_bytes: z.number().int().nonnegative().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const orgId = await requireCurrentOrg(context.supabase, context.userId);
    const profileId = await ensureProfile(
      context.supabase,
      orgId,
      data.premises_id,
      context.userId,
    );

    const { data: row, error } = await context.supabase
      .from("pharmacy_im_attachments")
      .insert({
        pharmacy_profile_id: profileId,
        organisation_id: orgId,
        premises_id: data.premises_id,
        storage_path: data.storage_path,
        file_name: data.file_name,
        mime_type: data.mime_type,
        size_bytes: data.size_bytes,
        uploaded_by: context.userId,
      })
      .select("id, storage_path")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteImAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        attachment_id: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("pharmacy_im_attachments")
      .delete()
      .eq("id", data.attachment_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
