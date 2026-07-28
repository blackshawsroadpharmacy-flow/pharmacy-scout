import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

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
            dispensing_potential_model: "gdp-v1.0.0",
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
