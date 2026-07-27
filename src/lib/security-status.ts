import { supabase } from "@/integrations/supabase/client";

export interface OrganisationSecurityStatus {
  organisation_id: string;
  organisation_name: string;
  member_count: number;
  private_bucket: string;
  private_bucket_public: boolean;
  last_audit_event: string | null;
  orphaned_demo_records: number;
}

export async function fetchOrganisationSecurityStatus(): Promise<OrganisationSecurityStatus> {
  const { data, error } = await supabase.rpc("organisation_security_status");
  if (error) throw new Error(error.message);
  return data as unknown as OrganisationSecurityStatus;
}
