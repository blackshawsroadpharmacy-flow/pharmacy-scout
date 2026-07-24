import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listSourceRecords = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("source_records")
      .select(
        "id, source_name, source_kind, source_url, regulatory_purpose, licence_or_terms_status, fetched_at, valid_until, coverage_description, row_count, confidence, notes, updated_at",
      )
      .order("source_kind", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });
