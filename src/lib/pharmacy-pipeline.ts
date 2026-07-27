import { supabase as typedSupabase } from "@/integrations/supabase/client";

const supabase = typedSupabase as unknown as {
  // The migration is generated into project types by the protected DB gate.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc: (name: string, args: Record<string, unknown>) => Promise<any>;
};

export type PipelineStage =
  "watchlist" | "contacting" | "im_received" | "due_diligence" | "offer" | "passed" | "acquired";

export interface PharmacyPipelineStatus {
  business_id: string;
  opportunity_id: string;
  pipeline_stage: PipelineStage;
  listing_status: "active" | "withdrawn" | "sold" | "unknown";
}

export async function fetchPharmacyPipelineStatus(
  premisesId: string,
): Promise<PharmacyPipelineStatus | null> {
  const { data, error } = await supabase.rpc("pharmacy_pipeline_status", {
    p_premises_id: premisesId,
  });
  if (error) throw new Error(error.message);
  return (data?.[0] as PharmacyPipelineStatus | undefined) ?? null;
}

export async function addPharmacyToPipeline(premisesId: string) {
  const { data, error } = await supabase.rpc("add_pharmacy_to_pipeline", {
    p_premises_id: premisesId,
    p_stage: "watchlist",
  });
  if (error) throw new Error(error.message);
  return data?.[0] as { business_id: string; opportunity_id: string; created: boolean } | undefined;
}
