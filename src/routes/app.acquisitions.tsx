import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  listBusinesses,
  createBusiness,
  moveOpportunity,
  updateBusinessNotes,
  PIPELINE_STAGES,
} from "@/lib/businesses.functions";
import { getMyProfile, listMyOrgs } from "@/lib/orgs.functions";
import { AppShell } from "@/components/app-shell";
import { COMMERCIAL_LANGUAGE } from "@/lib/language";
import { Download } from "lucide-react";

const STAGE_LABEL: Record<(typeof PIPELINE_STAGES)[number], string> = {
  watchlist: "Watchlist",
  contacting: "Contacting",
  im_received: "IM received",
  due_diligence: "Due diligence",
  offer: "Offer",
  passed: "Passed",
  acquired: "Acquired",
};

export const Route = createFileRoute("/app/acquisitions")({
  head: () => ({
    meta: [
      { title: "Acquisition Scout — Chemist Care" },
      {
        name: "description",
        content:
          "Private acquisition pipeline. Track pharmacy businesses through watchlist, due diligence and offer stages.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Acquisition Scout — Chemist Care" },
      { property: "og:description", content: "Private acquisition pipeline for Victorian pharmacies." },
    ],
  }),
  component: AcquisitionsPage,
});

function AcquisitionsPage() {
  const router = useRouter();
  const listFn = useServerFn(listBusinesses);
  const createFn = useServerFn(createBusiness);
  const moveFn = useServerFn(moveOpportunity);
  const notesFn = useServerFn(updateBusinessNotes);
  const profileFn = useServerFn(getMyProfile);
  const orgsFn = useServerFn(listMyOrgs);

  const q = useQuery({ queryKey: ["businesses"], queryFn: () => listFn() });
  const profileQ = useQuery({ queryKey: ["profile"], queryFn: () => profileFn() });
  const orgsQ = useQuery({ queryKey: ["orgs"], queryFn: () => orgsFn() });
  const currentOrgName =
    (orgsQ.data ?? []).find((o) => o.id === profileQ.data?.current_organisation_id)?.name ?? null;

  const [showAdd, setShowAdd] = useState(false);
  const [openNotesFor, setOpenNotesFor] = useState<string | null>(null);

  const grouped = new Map<string, Array<{ opp: { id: string; title: string; pipeline_stage: string; business_id: string | null }; biz?: { id: string; trading_name: string; asking_price: number | null; broker_or_source: string | null; private_notes: string | null } }>>();
  for (const stage of PIPELINE_STAGES) grouped.set(stage, []);
  for (const opp of q.data?.opportunities ?? []) {
    const biz = q.data?.businesses.find((b) => b.id === opp.business_id) ?? undefined;
    grouped.get(opp.pipeline_stage)?.push({
      opp: {
        id: opp.id,
        title: opp.title,
        pipeline_stage: opp.pipeline_stage,
        business_id: opp.business_id ?? null,
      },
      biz: biz
        ? {
            id: biz.id,
            trading_name: biz.trading_name,
            asking_price: biz.asking_price,
            broker_or_source: biz.broker_or_source,
            private_notes: biz.private_notes,
          }
        : undefined,
    });
  }

  async function onMove(oppId: string, direction: -1 | 1) {
    const opp = q.data?.opportunities.find((o) => o.id === oppId);
    if (!opp) return;
    const idx = PIPELINE_STAGES.indexOf(opp.pipeline_stage as (typeof PIPELINE_STAGES)[number]);
    const next = PIPELINE_STAGES[idx + direction];
    if (!next) return;
    try {
      await moveFn({ data: { opportunity_id: oppId, pipeline_stage: next } });
      await router.invalidate();
      q.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to move opportunity");
    }
  }

  return (
    <AppShell currentOrgName={currentOrgName}>
      <div className="mx-auto max-w-[1400px]">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Acquisition Scout</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Private pipeline. Only members of your organisation can see these opportunities.
            </p>
          </div>
          <div className="flex gap-2">
            <a
              href="/acquisition-template.csv"
              download
              className="inline-flex items-center gap-2 rounded-md border border-input px-3 py-2 text-sm font-medium hover:bg-accent"
            >
              <Download className="h-4 w-4" /> CSV template
            </a>
            <button
              onClick={() => setShowAdd(true)}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Add business
            </button>
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Note.</span> Market opportunity signals
          arrive in Phase 2. Operational upside and valuation multiples require your private
          business data — until entered, they show as “{COMMERCIAL_LANGUAGE.commercial_data_required}”.
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-7">
          {PIPELINE_STAGES.map((stage) => (
            <div key={stage} className="rounded-xl border border-border bg-card p-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">{STAGE_LABEL[stage]}</h3>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {grouped.get(stage)?.length ?? 0}
                </span>
              </div>
              <div className="mt-3 flex flex-col gap-2">
                {(grouped.get(stage) ?? []).map(({ opp, biz }) => (
                  <div key={opp.id} className="rounded-lg border border-border bg-background p-3">
                    <div className="text-sm font-medium text-foreground">
                      {biz?.trading_name ?? opp.title}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {biz?.broker_or_source ? `Source: ${biz.broker_or_source}` : "Source: —"}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Asking price:{" "}
                      {biz?.asking_price != null
                        ? `A$${Number(biz.asking_price).toLocaleString()}`
                        : "Unknown"}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1">
                      <button
                        onClick={() => onMove(opp.id, -1)}
                        disabled={stage === PIPELINE_STAGES[0]}
                        className="rounded border border-input px-2 py-0.5 text-xs disabled:opacity-40"
                      >
                        ←
                      </button>
                      <button
                        onClick={() => onMove(opp.id, 1)}
                        disabled={stage === PIPELINE_STAGES[PIPELINE_STAGES.length - 1]}
                        className="rounded border border-input px-2 py-0.5 text-xs disabled:opacity-40"
                      >
                        →
                      </button>
                      {biz && (
                        <button
                          onClick={() => setOpenNotesFor(biz.id)}
                          className="ml-auto text-xs text-teal hover:underline"
                        >
                          Notes
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {(grouped.get(stage) ?? []).length === 0 && (
                  <div className="rounded border border-dashed border-border p-3 text-xs text-muted-foreground">
                    Empty
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {showAdd && (
        <AddBusinessDialog
          onClose={() => setShowAdd(false)}
          onCreate={async (payload) => {
            try {
              await createFn({ data: payload });
              toast.success("Added to pipeline");
              setShowAdd(false);
              q.refetch();
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Failed to add");
            }
          }}
        />
      )}

      {openNotesFor && (
        <NotesDialog
          business={q.data?.businesses.find((b) => b.id === openNotesFor) ?? null}
          onClose={() => setOpenNotesFor(null)}
          onSave={async (notes) => {
            try {
              await notesFn({ data: { business_id: openNotesFor, private_notes: notes } });
              toast.success("Notes saved");
              setOpenNotesFor(null);
              q.refetch();
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Failed to save");
            }
          }}
        />
      )}
    </AppShell>
  );
}

function AddBusinessDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (payload: {
    trading_name: string;
    broker_or_source: string | null;
    asking_price: number | null;
    listing_url: string | null;
    private_notes: string | null;
    pipeline_stage: (typeof PIPELINE_STAGES)[number];
  }) => void;
}) {
  const [name, setName] = useState("");
  const [broker, setBroker] = useState("");
  const [askingPrice, setAskingPrice] = useState("");
  const [listingUrl, setListingUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [stage, setStage] = useState<(typeof PIPELINE_STAGES)[number]>("watchlist");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg">
        <h2 className="text-lg font-semibold">Add pharmacy business</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            onCreate({
              trading_name: name.trim(),
              broker_or_source: broker.trim() || null,
              asking_price: askingPrice ? Number(askingPrice) : null,
              listing_url: listingUrl.trim() || null,
              private_notes: notes.trim() || null,
              pipeline_stage: stage,
            });
          }}
          className="mt-4 flex flex-col gap-3 text-sm"
        >
          <Field label="Trading name (required)">
            <input value={name} onChange={(e) => setName(e.target.value)} required className="input" />
          </Field>
          <Field label="Broker or source">
            <input value={broker} onChange={(e) => setBroker(e.target.value)} className="input" />
          </Field>
          <Field label="Asking price (AUD)">
            <input
              inputMode="numeric"
              value={askingPrice}
              onChange={(e) => setAskingPrice(e.target.value.replace(/[^0-9.]/g, ""))}
              className="input"
              placeholder="Leave blank if unknown"
            />
          </Field>
          <Field label="Listing URL">
            <input value={listingUrl} onChange={(e) => setListingUrl(e.target.value)} className="input" />
          </Field>
          <Field label="Private notes">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="input min-h-[80px]"
            />
          </Field>
          <Field label="Pipeline stage">
            <select
              value={stage}
              onChange={(e) => setStage(e.target.value as (typeof PIPELINE_STAGES)[number])}
              className="input"
            >
              {PIPELINE_STAGES.map((s) => (
                <option key={s} value={s}>
                  {STAGE_LABEL[s]}
                </option>
              ))}
            </select>
          </Field>

          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-input px-4 py-2 text-sm hover:bg-accent"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Add
            </button>
          </div>
        </form>
      </div>
      <style>{`
        .input { border-radius: 6px; border: 1px solid var(--input); background: var(--background); padding: 8px 10px; font-size: 14px; outline: none; }
        .input:focus { box-shadow: 0 0 0 2px var(--ring); }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function NotesDialog({
  business,
  onClose,
  onSave,
}: {
  business: { id: string; trading_name: string; private_notes: string | null } | null;
  onClose: () => void;
  onSave: (notes: string) => void;
}) {
  const [value, setValue] = useState(business?.private_notes ?? "");
  if (!business) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-lg">
        <h2 className="text-lg font-semibold">Notes — {business.trading_name}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Private to your organisation. Members can view. Nobody outside your organisation can read
          this.
        </p>
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="mt-3 min-h-[200px] w-full rounded-md border border-input bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <div className="mt-3 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-input px-4 py-2 text-sm hover:bg-accent"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(value)}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Save notes
          </button>
        </div>
      </div>
    </div>
  );
}
