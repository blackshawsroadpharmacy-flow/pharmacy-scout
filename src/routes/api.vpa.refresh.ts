import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import seedSnapshot from "../../data/source/vpa-register-2026-07-29-live.records.json";
import { fetchLiveVpaRegister } from "@/lib/vpa-live-fetch.server";
import { authorizeVpaAdmin, runVpaRefresh } from "@/lib/vpa-refresh.server";
import { recordsToVpaCsv, type VpaRecord } from "@/lib/vpa-refresh";

export const Route = createFileRoute("/api/vpa/refresh")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const auth = await authenticateAdminRequest(request);
        if (auth instanceof Response) return auth;

        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          async start(controller) {
            const emit = (event: Record<string, unknown>) =>
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
            try {
              const { count } = await auth.supabase
                .from("pharmacy_vpa_runs")
                .select("id", { count: "exact", head: true })
                .eq("status", "ok");
              const useSeed = (count ?? 0) === 0;
              let records: VpaRecord[];
              let postcodesQueried: number;
              let capWarnings: number;
              let errors: string[];

              if (useSeed) {
                records = seedSnapshot.records as VpaRecord[];
                postcodesQueried = 1000;
                capWarnings = Number(seedSnapshot.cap_warnings ?? 0);
                errors = [];
                emit({ phase: "parsing", premises_count: records.length, source: "seed_snapshot" });
              } else {
                const live = await fetchLiveVpaRegister(emit);
                records = live.records;
                postcodesQueried = live.postcodesQueried;
                capWarnings = live.capWarnings;
                errors = live.errors;
                emit({ phase: "parsing", premises_count: records.length, source: "live_vpa" });
              }

              const checksumTimestamp = new Date().toISOString();
              const summary = await runVpaRefresh({
                supabase: auth.supabase,
                userId: auth.userId,
                records,
                postcodesQueried,
                capWarnings,
                errors,
                checksumPayload: recordsToVpaCsv(records, checksumTimestamp),
                emit,
              });
              emit({ phase: "done", summary });
            } catch (error) {
              emit({
                phase: "error",
                error_message: error instanceof Error ? error.message : String(error),
              });
            } finally {
              controller.close();
            }
          },
        });

        return new Response(stream, {
          headers: {
            "content-type": "text/event-stream; charset=utf-8",
            "cache-control": "no-cache, no-transform",
            "x-content-type-options": "nosniff",
          },
        });
      },
    },
  },
});

export async function authenticateAdminRequest(
  request: Request,
): Promise<{ supabase: ReturnType<typeof createClient<Database>>; userId: string } | Response> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const url = import.meta.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return Response.json({ error: "Server configuration error" }, { status: 500 });

  const supabase = createClient<Database>(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getClaims(token);
  const userId = data?.claims?.sub;
  if (error || !userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await authorizeVpaAdmin(supabase, userId))) {
    return Response.json({ error: "Admin role required" }, { status: 403 });
  }
  return { supabase, userId };
}
