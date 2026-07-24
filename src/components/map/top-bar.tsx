import { Link } from "@tanstack/react-router";
import { Search, Layers, Bookmark, User } from "lucide-react";
import { useState, type FormEvent } from "react";

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
  onSearch,
  onToggleLayers,
  onSaved,
  onAccount,
  authed,
  resultCount,
}: {
  mode: Mode;
  onMode: (m: Mode) => void;
  onSearch: (q: string) => void;
  onToggleLayers: () => void;
  onSaved: () => void;
  onAccount: () => void;
  authed: boolean;
  resultCount: number;
}) {
  const [q, setQ] = useState("");

  function submit(e: FormEvent) {
    e.preventDefault();
    if (q.trim()) onSearch(q.trim());
  }

  return (
    <header className="pointer-events-auto absolute inset-x-0 top-0 z-[1100] flex h-14 items-center gap-3 border-b border-border/60 bg-card/95 px-3 backdrop-blur-sm">
      <Link to="/" className="flex items-center gap-2 pr-2">
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
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search pharmacy name, address, suburb, postcode…"
          className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
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

      <div className="hidden lg:flex items-center gap-2 pl-2 text-xs text-muted-foreground">
        <span className="tabular-nums">{resultCount.toLocaleString()}</span> pharmacies loaded
      </div>

      <div className="ml-auto flex items-center gap-1">
        <button
          onClick={onToggleLayers}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-2.5 text-xs font-medium hover:bg-accent"
        >
          <Layers className="h-3.5 w-3.5" /> Layers
        </button>
        <button
          onClick={onSaved}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-2.5 text-xs font-medium hover:bg-accent"
        >
          <Bookmark className="h-3.5 w-3.5" /> Saved
        </button>
        <button
          onClick={onAccount}
          className={
            "inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium " +
            (authed
              ? "border border-input bg-background hover:bg-accent"
              : "bg-primary text-primary-foreground hover:opacity-90")
          }
        >
          <User className="h-3.5 w-3.5" /> {authed ? "Account" : "Sign in"}
        </button>
      </div>
    </header>
  );
}
