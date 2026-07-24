import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Map, Briefcase, Database, LogOut, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { DisclaimerFooter } from "./disclaimer-footer";

const NAV = [
  { to: "/app", label: "Opportunity Map", icon: Map, exact: true },
  { to: "/app/acquisitions", label: "Acquisition Scout", icon: Briefcase },
  { to: "/app/data-sources", label: "Data & Sources", icon: Database },
];

export function AppShell({
  children,
  currentOrgName,
  fullBleed,
}: {
  children: ReactNode;
  currentOrgName?: string | null;
  fullBleed?: boolean;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-60 shrink-0 flex-col justify-between border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
        <div>
          <div className="px-5 py-5">
            <div className="text-sm font-semibold tracking-wide">Chemist Care</div>
            <div className="text-xs text-sidebar-muted">Opportunity Scout</div>
          </div>
          <nav className="mt-2 flex flex-col gap-1 px-2">
            {NAV.map((item) => {
              const active = item.exact
                ? location.pathname === item.to
                : location.pathname.startsWith(item.to);
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-white/10 text-sidebar-foreground"
                      : "text-sidebar-muted hover:bg-white/5 hover:text-sidebar-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="border-t border-sidebar-border px-3 py-3">
          {currentOrgName ? (
            <div className="mb-2 flex items-center gap-2 px-2 text-xs text-sidebar-muted">
              <Building2 className="h-3.5 w-3.5" />
              <span className="truncate">{currentOrgName}</span>
            </div>
          ) : null}
          <button
            onClick={signOut}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-sidebar-muted hover:bg-white/5 hover:text-sidebar-foreground"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className={cn("flex-1", fullBleed ? "" : "px-6 py-6")}>{children}</div>
        <DisclaimerFooter />
      </div>
    </div>
  );
}
