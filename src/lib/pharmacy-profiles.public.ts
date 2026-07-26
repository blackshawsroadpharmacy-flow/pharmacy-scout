import { supabase as typedSupabase } from "@/integrations/supabase/client";
// External Supabase project types don't include profile tables; cast to any at runtime.
const supabase = typedSupabase as unknown as {
  from: (table: string) => any;
};

export type PharmacyStatus = "active" | "underperforming" | "target" | "under_offer";

export interface PharmacyProfileRecord {
  id: string | null;
  premises_id: string;
  status: PharmacyStatus;
  asking_price: number | null;
  revenue: number | null;
  script_volume: number | null;
  owner_licensee: string | null;
  notes: string;
  notes_updated_at: string | null;
  updated_at: string | null;
}

export interface PharmacyNoteEntry {
  id: string;
  note_text: string;
  created_at: string;
}

export interface PharmacyAttachment {
  id: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
}

export interface PharmacyProfileBundle {
  profile: PharmacyProfileRecord;
  notesHistory: PharmacyNoteEntry[];
  attachments: PharmacyAttachment[];
}

async function ensurePharmacyProfile(
  premisesId: string,
): Promise<PharmacyProfileRecord & { id: string }> {
  const { data: existing, error: existingError } = await supabase
    .from("pharmacy_profiles")
    .select(
      "id, premises_id, status, asking_price, revenue, script_volume, owner_licensee, notes, notes_updated_at, updated_at",
    )
    .eq("premises_id", premisesId)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (existing?.id) return existing as PharmacyProfileRecord & { id: string };

  const { data: created, error: createError } = await supabase
    .from("pharmacy_profiles")
    .insert({ premises_id: premisesId })
    .select(
      "id, premises_id, status, asking_price, revenue, script_volume, owner_licensee, notes, notes_updated_at, updated_at",
    )
    .single();
  if (createError) throw new Error(createError.message);
  if (!created?.id) throw new Error("Supabase returned a pharmacy profile without an id.");
  return created as PharmacyProfileRecord & { id: string };
}

export async function fetchPharmacyProfileBundle(
  premisesId: string,
): Promise<PharmacyProfileBundle> {
  const { data: profile, error: profileError } = await supabase
    .from("pharmacy_profiles")
    .select(
      "id, premises_id, status, asking_price, revenue, script_volume, owner_licensee, notes, notes_updated_at, updated_at",
    )
    .eq("premises_id", premisesId)
    .maybeSingle();
  if (profileError) throw new Error(profileError.message);

  const profileId = profile?.id as string | undefined;
  const [notesRes, attachmentsRes] = await Promise.all([
    profileId
      ? supabase
          .from("pharmacy_note_entries")
          .select("id, note_text, created_at")
          .eq("pharmacy_profile_id", profileId)
          .order("created_at", { ascending: false })
          .limit(10)
      : Promise.resolve({ data: [], error: null } as const),
    profileId
      ? supabase
          .from("pharmacy_im_attachments")
          .select("id, storage_path, file_name, mime_type, size_bytes, created_at")
          .eq("pharmacy_profile_id", profileId)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null } as const),
  ]);
  if (notesRes.error) throw new Error(notesRes.error.message);
  if (attachmentsRes.error) throw new Error(attachmentsRes.error.message);

  return {
    profile: (profile as PharmacyProfileRecord | null) ?? {
      id: null,
      premises_id: premisesId,
      status: "active",
      asking_price: null,
      revenue: null,
      script_volume: null,
      owner_licensee: null,
      notes: "",
      notes_updated_at: null,
      updated_at: null,
    },
    notesHistory: (notesRes.data ?? []) as PharmacyNoteEntry[],
    attachments: (attachmentsRes.data ?? []) as PharmacyAttachment[],
  };
}

export async function upsertPharmacyProfile(input: {
  premises_id: string;
  status: PharmacyStatus;
  asking_price: number | null;
  revenue: number | null;
  script_volume: number | null;
  owner_licensee: string | null;
}) {
  const profile = await ensurePharmacyProfile(input.premises_id);
  const { data, error } = await supabase
    .from("pharmacy_profiles")
    .update({
      status: input.status,
      asking_price: input.asking_price,
      revenue: input.revenue,
      script_volume: input.script_volume,
      owner_licensee: input.owner_licensee,
    })
    .eq("id", profile.id)
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function savePharmacyNotes(input: { premises_id: string; notes: string }) {
  const profile = await ensurePharmacyProfile(input.premises_id);

  const { error: updateError } = await supabase
    .from("pharmacy_profiles")
    .update({
      notes: input.notes,
      notes_updated_at: new Date().toISOString(),
    })
    .eq("id", profile.id);
  if (updateError) throw new Error(updateError.message);

  if ((profile.notes ?? "") !== input.notes) {
    const { error: noteError } = await supabase.from("pharmacy_note_entries").insert({
      pharmacy_profile_id: profile.id,
      premises_id: input.premises_id,
      note_text: input.notes,
    });
    if (noteError) throw new Error(noteError.message);
  }

  return profile.id;
}

export async function registerImAttachment(input: {
  premises_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
}) {
  const profile = await ensurePharmacyProfile(input.premises_id);

  const { data, error } = await supabase
    .from("pharmacy_im_attachments")
    .insert({
      pharmacy_profile_id: profile.id,
      premises_id: input.premises_id,
      storage_path: input.storage_path,
      file_name: input.file_name,
      mime_type: input.mime_type,
      size_bytes: input.size_bytes,
    })
    .select("id, storage_path")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteImAttachment(attachmentId: string) {
  const { error } = await supabase.from("pharmacy_im_attachments").delete().eq("id", attachmentId);
  if (error) throw new Error(error.message);
}
