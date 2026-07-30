import { Link } from "@tanstack/react-router";
import { Search, Layers, Bookmark, User, MapPin, LockKeyhole } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import {
  searchStatewideLocations,
  type StatewideSearchResult,
  type StatewideSearchType,
} from "@/lib/statewide-search";

export type Mode = "explore" | "acquisition" | "greenfield" | "relocation";

const MODES: Array<{ id: Mode; label: string }> = [
  { id: "explore", label: "Explore" },
  { id: "acquisition", label: "Acquisition" },
  { id: "greenfield", label: "Greenfield" },
  { id: "relocation", label: "Relocation" },
];

export function TopBar({
  mode,
  onMode,
  onSearchFallback,
  onSearchResult,
  onToggleLayers,
  onSaved,
  onAccount,
  authed,
  resultCount,
}: {
  mode: Mode;
  onMode: (m: Mode) => void;
  onSearchFallback: (q: string) => void;
  onSearchResult: (result: StatewideSearchResult) => void;
  onToggleLayers: () => void;
  onSaved: () => void;
  onAccount: () => void;
  authed: boolean;
  resultCount: number;
}) {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchQ = useQuery({
    queryKey: ["statewide-location-search", debouncedQ],
    queryFn: ({ signal }) => searchStatewideLocations(debouncedQ, signal, authed),
    enabled: debouncedQ.length >= 2,
    staleTime: 60_000,
  });
  const results = searchQ.data ?? [];

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQ(q.trim()), 220);
    return () => window.clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    function focusSearch(event: globalThis.KeyboardEvent) {
      if (
        event.key === "/" &&
        !(event.target instanceof HTMLInputElement) &&
        !(event.target instanceof HTMLTextAreaElement)
      ) {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (results[activeIndex]) {
      choose(results[activeIndex]);
    } else if (q.trim()) {
      onSearchFallback(q.trim());
    }
  }

  function choose(result: StatewideSearchResult) {
    onSearchResult(result);
    setOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && results.length > 0) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => (current + 1) % results.length);
    } else if (event.key === "ArrowUp" && results.length > 0) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => (current - 1 + results.length) % results.length);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <header className="pointer-events-auto absolute inset-x-0 top-0 z-[1100] flex h-14 items-center gap-3 border-b border-border/60 bg-card/95 px-3 backdrop-blur-sm">
      <Link to="/" search={{}} className="flex items-center gap-2 pr-2">
        <div className="grid h-8 w-8 place-items-center rounded-md bg-navy text-navy-foreground text-xs font-semibold">
          CC
        </div>
        <div className="hidden sm:block">
          <div className="text-sm font-semibold leading-tight tracking-tight">Chemist Care</div>
          <div className="text-[10px] uppercase leading-tight tracking-wider text-muted-foreground">
            Pharmacy Scout
          </div>
        </div>
      </Link>

      <form onSubmit={submit} className="relative min-w-0 flex-1 max-w-md">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value.slice(0, 120));
            setActiveIndex(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          onKeyDown={handleKeyDown}
          role="combobox"
          aria-expanded={open}
          aria-controls="statewide-search-results"
          aria-autocomplete="list"
          aria-activedescendant={
            open && results[activeIndex] ? `statewide-result-${activeIndex}` : undefined
          }
          placeholder="Search anywhere in Victoria…"
          className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        {open && debouncedQ.length >= 2 && (
          <div
            id="statewide-search-results"
            role="listbox"
            aria-label="Statewide search results"
            className="absolute left-0 right-0 top-11 max-h-[min(70vh,460px)] overflow-y-auto rounded-lg border border-border bg-card p-1 shadow-xl"
          >
            {searchQ.isFetching && (
              <div className="px-3 py-3 text-xs text-muted-foreground">
                Searching statewide records…
              </div>
            )}
            {searchQ.isError && (
              <div className="px-3 py-3 text-xs text-destructive">
                Statewide search is temporarily unavailable.
              </div>
            )}
            {!searchQ.isFetching && !searchQ.isError && results.length === 0 && (
              <div className="px-3 py-3 text-xs text-muted-foreground">
                No results found anywhere in Victoria.
              </div>
            )}
            {SEARCH_GROUPS.map((group) => {
              const grouped = results
                .map((result, index) => ({ result, index }))
                .filter(({ result }) => group.types.includes(result.result_type));
              if (grouped.length === 0) return null;
              return (
                <div key={group.label}>
                  <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {group.label}
                  </div>
                  {grouped.map(({ result, index }) => (
                    <button
                      id={`statewide-result-${index}`}
                      role="option"
                      aria-selected={activeIndex === index}
                      key={`${result.result_type}:${result.result_id}`}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => choose(result)}
                      onMouseEnter={() => setActiveIndex(index)}
                      className={
                        "flex w-full items-start gap-2 rounded-md px-3 py-2 text-left " +
                        (activeIndex === index ? "bg-accent" : "hover:bg-accent/60")
                      }
                    >
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1 text-sm font-medium">
                          <span className="truncate">{result.result_name}</span>
                          {result.is_private && (
                            <LockKeyhole
                              className="h-3 w-3 shrink-0 text-muted-foreground"
                              aria-label="Private organisation record"
                            />
                          )}
                        </span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {formatSearchAddress(result)}
                        </span>
                        <span className="block text-[10px] text-muted-foreground">
                          {typeLabel(result.result_type)} · {result.source_confidence}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </form>

      <nav className="hidden md:flex items-center gap-0.5 rounded-md border border-border bg-background p-0.5">
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => onMode(m.id)}
            className={
              "rounded px-2.5 py-1 text-xs font-medium transition-colors " +
              (mode === m.id
                ? "bg-navy text-navy-foreground"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            {m.label}
          </button>
        ))}
      </nav>
      <label className="sr-only" htmlFor="mobile-analysis-mode">
        Analysis mode
      </label>
      <select
        id="mobile-analysis-mode"
        aria-label="Analysis mode"
        value={mode}
        onChange={(event) => onMode(event.target.value as Mode)}
        className="h-9 max-w-24 rounded-md border border-input bg-background px-2 text-xs font-medium md:hidden"
      >
        {MODES.map((availableMode) => (
          <option key={availableMode.id} value={availableMode.id}>
            {availableMode.label}
          </option>
        ))}
      </select>

      <div className="hidden lg:flex items-center gap-2 pl-2 text-xs text-muted-foreground">
        <span className="tabular-nums">{resultCount.toLocaleString()}</span> pharmacies in view
      </div>

      <div className="ml-auto flex items-center gap-1">
        <button
          onClick={onToggleLayers}
          aria-label="Map layers"
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-2 text-xs font-medium hover:bg-accent sm:px-2.5"
        >
          <Layers className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Layers</span>
        </button>
        <button
          onClick={onSaved}
          className="hidden h-9 items-center gap-1.5 rounded-md border border-input bg-background px-2.5 text-xs font-medium hover:bg-accent sm:inline-flex"
        >
          <Bookmark className="h-3.5 w-3.5" /> Saved
        </button>
        <button
          onClick={onAccount}
          aria-label={authed ? "Account" : "Sign in"}
          className={
            "inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-xs font-medium sm:px-2.5 " +
            (authed
              ? "border border-input bg-background hover:bg-accent"
              : "bg-primary text-primary-foreground hover:opacity-90")
          }
        >
          <User className="h-3.5 w-3.5" />{" "}
          <span className="hidden sm:inline">{authed ? "Account" : "Sign in"}</span>
        </button>
      </div>
    </header>
  );
}

const SEARCH_GROUPS: Array<{ label: string; types: StatewideSearchType[] }> = [
  { label: "Pharmacies", types: ["pharmacy", "vpa_pharmacy"] },
  { label: "Supermarkets", types: ["supermarket"] },
  { label: "Medical centres", types: ["medical_centre"] },
  { label: "Residential aged care", types: ["aged_care"] },
  {
    label: "Your private records",
    types: ["acquisition_opportunity", "candidate_site"],
  },
];

function typeLabel(type: StatewideSearchType) {
  return type.replaceAll("_", " ");
}

function formatSearchAddress(result: StatewideSearchResult) {
  return (
    [result.result_address, result.result_suburb, result.result_postcode]
      .filter(Boolean)
      .join(", ") || "Address unavailable"
  );
}
