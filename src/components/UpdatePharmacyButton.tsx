import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useIsVpaAdmin, useVpaLastSynced } from "@/lib/vpa-refresh-client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Progress = {
  phase: "fetching" | "parsing" | "upserting" | "done" | "error";
  current?: number;
  total?: number;
  premises_count?: number;
  premises_added?: number;
  premises_updated?: number;
  error_message?: string;
  summary?: {
    premises_added: number;
    premises_updated: number;
    premises_removed: number;
    licensees_upserted: number;
  };
};

export function UpdatePharmacyButton() {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const admin = useIsVpaAdmin();
  const lastSynced = useVpaLastSynced();
  const queryClient = useQueryClient();

  if (admin.isLoading || !admin.data) return null;

  async function refresh() {
    setConfirmOpen(false);
    setRunning(true);
    setProgress(null);
    const toastId = toast.loading("Starting VPA pharmacy refresh…");
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Your session has expired. Sign in again.");
      const response = await fetch("/api/vpa/refresh", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? `Refresh failed (${response.status})`);
      }
      if (!response.body) throw new Error("Refresh stream was unavailable.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const raw of events) {
          const line = raw.split("\n").find((candidate) => candidate.startsWith("data: "));
          if (!line) continue;
          const event = JSON.parse(line.slice(6)) as Progress;
          if (event.phase === "fetching" && event.current && event.total) {
            setProgress({ current: event.current, total: event.total });
            toast.loading(`Fetching VPA register… ${event.current}/${event.total} postcodes`, {
              id: toastId,
            });
          } else if (event.phase === "parsing") {
            toast.loading(`Parsed ${event.premises_count ?? 0} registered premises…`, {
              id: toastId,
            });
          } else if (event.phase === "upserting") {
            toast.loading(
              `Updating pharmacies… ${(event.premises_added ?? 0) + (event.premises_updated ?? 0)}`,
              { id: toastId },
            );
          } else if (event.phase === "error") {
            throw new Error(event.error_message ?? "VPA refresh failed");
          } else if (event.phase === "done" && event.summary) {
            toast.success(
              `VPA updated: ${event.summary.premises_added} added, ${event.summary.premises_updated} updated, ${event.summary.licensees_upserted} proprietors.`,
              { id: toastId, duration: 10_000 },
            );
          }
        }
      }
      await queryClient.invalidateQueries({ queryKey: ["vpa-public-register-last-synced"] });
      await queryClient.invalidateQueries({ queryKey: ["pharmacy"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "VPA refresh failed", {
        id: toastId,
        action: {
          label: "Run details",
          onClick: () => window.location.assign("/app/data-sources"),
        },
      });
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }

  return (
    <>
      <div className="mt-3 border-t border-sidebar-border px-2 pt-3">
        <button
          type="button"
          disabled={running}
          onClick={() => setConfirmOpen(true)}
          className="flex w-full items-center gap-2 rounded-md bg-white/10 px-3 py-2 text-sm text-sidebar-foreground hover:bg-white/15 disabled:cursor-wait disabled:opacity-70"
        >
          <RefreshCw className={`h-4 w-4 ${running ? "animate-spin" : ""}`} />
          {running
            ? progress
              ? `Updating… (${progress.current}/${progress.total})`
              : "Updating…"
            : "Update Pharmacy"}
        </button>
        <div className="mt-1 px-3 text-[11px] text-sidebar-muted">
          {lastSynced.data ? `Last synced ${relativeTime(lastSynced.data)}` : "Not synced yet"}
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Update all Victorian pharmacies?</AlertDialogTitle>
            <AlertDialogDescription>
              This will refresh all 1,600+ Victorian pharmacy records from pharmacy.vic.gov.au.
              Existing local edits to phone and website will be preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={refresh}>Update</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function relativeTime(value: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
