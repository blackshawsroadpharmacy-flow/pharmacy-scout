import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";

// Read the active model from the database rather than hard-coding it. A literal
// here went stale when GDP v1.1 was activated, so the one endpoint whose job is
// to report what is deployed was reporting the wrong model.
async function activeDispensingModel(): Promise<string> {
  try {
    const { data, error } = await supabase
      .from("dispensing_potential_methods")
      .select("version")
      .eq("active", true)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data?.version) return "unknown";
    return data.version;
  } catch {
    return "unknown";
  }
}

export const Route = createFileRoute("/build.json")({
  server: {
    handlers: {
      GET: async () =>
        Response.json(
          {
            commit: import.meta.env.VITE_BUILD_COMMIT_SHA || "unknown",
            built_at: import.meta.env.VITE_BUILD_DATE || "unknown",
            environment: import.meta.env.VITE_BUILD_ENVIRONMENT || "unknown",
            supabase_project: import.meta.env.VITE_SUPABASE_PROJECT_ID || "unknown",
            dispensing_potential_model: await activeDispensingModel(),
          },
          {
            headers: {
              "Cache-Control": "no-store",
              "X-Content-Type-Options": "nosniff",
            },
          },
        ),
    },
  },
});
