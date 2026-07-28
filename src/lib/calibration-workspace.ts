/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from "zod";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { getCurrentOrganisationId } from "@/lib/pharmacy-profiles.public";

const supabase = typedSupabase as any;

export const CALIBRATION_COLUMNS = [
  "pharmacy_id",
  "observed_scripts_per_day",
  "evidence_period_start",
  "evidence_period_end",
  "trading_days_per_week",
  "includes_private_prescriptions",
  "includes_under_copayment",
  "includes_daa_volume",
  "includes_institutional_supply",
  "source_type",
  "source",
  "source_document_or_note",
  "confidence",
  "inclusion_notes",
  "exclusion_notes",
] as const;

const nullableBoolean = z.string().transform((value, context) => {
  const normalized = value.trim().toLowerCase();
  if (["true", "yes", "1"].includes(normalized)) return true;
  if (["false", "no", "0"].includes(normalized)) return false;
  if (["", "unknown", "null"].includes(normalized)) return null;
  context.addIssue({ code: "custom", message: `Invalid boolean "${value}"` });
  return z.NEVER;
});

const csvRowSchema = z.object({
  pharmacy_id: z.string().uuid(),
  observed_scripts_per_day: z.coerce.number().positive(),
  evidence_period_start: z.string().date(),
  evidence_period_end: z.string().date(),
  trading_days_per_week: z.coerce.number().positive().max(7),
  includes_private_prescriptions: nullableBoolean,
  includes_under_copayment: nullableBoolean,
  includes_daa_volume: nullableBoolean,
  includes_institutional_supply: nullableBoolean,
  source_type: z.string().trim().min(1).max(120),
  source: z.string().trim().min(1).max(500),
  source_document_or_note: z.string().trim().max(2000),
  confidence: z.enum(["low", "medium", "high"]),
  inclusion_notes: z.string().trim().max(2000),
  exclusion_notes: z.string().trim().max(2000),
});

export type CalibrationCsvRow = z.infer<typeof csvRowSchema>;

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += character;
  }
  row.push(field);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  if (quoted) throw new Error("CSV contains an unterminated quoted field.");
  return rows;
}

export function calibrationCsvTemplate() {
  return `${CALIBRATION_COLUMNS.join(",")}\n`;
}

export function validateCalibrationCsv(text: string) {
  const rows = parseCsv(text);
  if (rows.length === 0) return { valid: [] as CalibrationCsvRow[], quarantined: [] };
  const header = rows[0].map((value) => value.trim().replace(/^\uFEFF/, ""));
  const missing = CALIBRATION_COLUMNS.filter((column) => !header.includes(column));
  if (missing.length) throw new Error(`CSV is missing required columns: ${missing.join(", ")}`);
  const valid: CalibrationCsvRow[] = [];
  const quarantined: Array<{ row: number; reason: string }> = [];
  rows.slice(1).forEach((values, rowIndex) => {
    const raw = Object.fromEntries(header.map((column, index) => [column, values[index] ?? ""]));
    const parsed = csvRowSchema.safeParse(raw);
    if (!parsed.success) {
      quarantined.push({
        row: rowIndex + 2,
        reason: parsed.error.issues.map((issue) => issue.message).join("; "),
      });
      return;
    }
    if (parsed.data.evidence_period_end < parsed.data.evidence_period_start) {
      quarantined.push({ row: rowIndex + 2, reason: "Evidence period end precedes start." });
      return;
    }
    valid.push(parsed.data);
  });
  return { valid, quarantined };
}

export async function listCalibrationWorkspace() {
  const organisationId = await getCurrentOrganisationId();
  const [observations, batches, warnings, pharmacies] = await Promise.all([
    supabase
      .from("dispensing_calibration_observations")
      .select("*, pharmacy_premises(name,suburb,address)")
      .eq("organisation_id", organisationId)
      .order("entered_at", { ascending: false }),
    supabase
      .from("dispensing_calibration_import_batches")
      .select("*")
      .eq("organisation_id", organisationId)
      .order("imported_at", { ascending: false }),
    supabase.rpc("calibration_observation_warnings", {
      target_organisation_id: organisationId,
    }),
    supabase.from("pharmacy_premises").select("id,name,suburb,address").order("name").limit(1000),
  ]);
  for (const result of [observations, batches, warnings, pharmacies]) {
    if (result.error) throw new Error(result.error.message);
  }
  return {
    organisationId,
    observations: observations.data ?? [],
    batches: batches.data ?? [],
    warnings: warnings.data ?? [],
    pharmacies: pharmacies.data ?? [],
  };
}

export async function createCalibrationObservation(input: CalibrationCsvRow) {
  const organisationId = await getCurrentOrganisationId();
  const user = (await typedSupabase.auth.getUser()).data.user;
  if (!user) throw new Error("Sign in to add genuine calibration evidence.");
  const { error } = await supabase.from("dispensing_calibration_observations").insert({
    ...input,
    source_document_or_note: input.source_document_or_note || null,
    inclusion_notes: input.inclusion_notes || null,
    exclusion_notes: input.exclusion_notes || null,
    organisation_id: organisationId,
    entered_by: user.id,
  });
  if (error) throw new Error(error.message);
}

export async function importCalibrationCsv(fileName: string, text: string, sourceNote: string) {
  const organisationId = await getCurrentOrganisationId();
  const user = (await typedSupabase.auth.getUser()).data.user;
  if (!user) throw new Error("Sign in to import genuine calibration evidence.");
  const parsed = validateCalibrationCsv(text);
  const { data: batch, error: batchError } = await supabase
    .from("dispensing_calibration_import_batches")
    .insert({
      organisation_id: organisationId,
      file_name: fileName,
      source_note: sourceNote || null,
      rows_received: parsed.valid.length + parsed.quarantined.length,
      rows_imported: 0,
      rows_quarantined: parsed.valid.length + parsed.quarantined.length,
      quarantine_summary: parsed.quarantined,
      imported_by: user.id,
    })
    .select("id")
    .single();
  if (batchError) throw new Error(batchError.message);

  let imported = 0;
  const quarantined = [...parsed.quarantined];
  for (let index = 0; index < parsed.valid.length; index += 1) {
    const row = parsed.valid[index];
    const { error } = await supabase.from("dispensing_calibration_observations").insert({
      ...row,
      source_document_or_note: row.source_document_or_note || null,
      inclusion_notes: row.inclusion_notes || null,
      exclusion_notes: row.exclusion_notes || null,
      organisation_id: organisationId,
      entered_by: user.id,
      import_batch_id: batch.id,
    });
    if (error) quarantined.push({ row: index + 2, reason: error.message });
    else imported += 1;
  }
  const received = parsed.valid.length + parsed.quarantined.length;
  const { error: updateError } = await supabase
    .from("dispensing_calibration_import_batches")
    .update({
      rows_imported: imported,
      rows_quarantined: received - imported,
      quarantine_summary: quarantined,
    })
    .eq("id", batch.id);
  if (updateError) throw new Error(updateError.message);
  return { imported, quarantined, received };
}

export async function updateCalibrationReview(
  observationId: string,
  status: "unreviewed" | "in_review" | "verified" | "rejected",
  notes: string,
) {
  const organisationId = await getCurrentOrganisationId();
  const user = (await typedSupabase.auth.getUser()).data.user;
  if (!user) throw new Error("Sign in to review calibration evidence.");
  const decided = status === "verified" || status === "rejected";
  const { error } = await supabase
    .from("dispensing_calibration_observations")
    .update({
      review_status: status,
      review_notes: notes || null,
      reviewed_by: decided ? user.id : null,
      reviewed_at: decided ? new Date().toISOString() : null,
    })
    .eq("organisation_id", organisationId)
    .eq("id", observationId);
  if (error) throw new Error(error.message);
}
