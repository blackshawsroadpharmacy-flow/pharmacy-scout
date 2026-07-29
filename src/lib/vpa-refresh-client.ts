import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useVpaLastSynced() {
  return useQuery({
    queryKey: ["vpa-public-register-last-synced"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("source_records")
        .select("fetched_at")
        .eq("source_key", "vpa_public_register")
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data?.fetched_at as string | null | undefined) ?? null;
    },
    staleTime: 60_000,
  });
}

export function useIsVpaAdmin() {
  return useQuery({
    queryKey: ["current-user-is-vpa-admin"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getSession();
      if (!auth.session?.user) return false;
      const { data, error } = await supabase
        .from("user_roles")
        .select("id")
        .eq("user_id", auth.session.user.id)
        .eq("role", "admin")
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return Boolean(data);
    },
    staleTime: 5 * 60_000,
  });
}
