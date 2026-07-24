import { cn } from "@/lib/utils";

type VerificationStatus = "unverified" | "matched" | "verified" | "conflict";

const LABELS: Record<VerificationStatus, string> = {
  unverified: "Unverified",
  matched: "Source matched",
  verified: "Verified from register",
  conflict: "Source conflict",
};

const STYLES: Record<VerificationStatus, string> = {
  unverified: "bg-muted text-muted-foreground",
  matched: "bg-accent text-accent-foreground",
  verified: "bg-teal/15 text-teal",
  conflict: "bg-destructive/15 text-destructive",
};

export function VerificationBadge({
  status,
  label,
  className,
}: {
  status: VerificationStatus;
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        STYLES[status],
        className,
      )}
    >
      {label ?? LABELS[status]}
    </span>
  );
}

export function EvidenceBadge({
  kind,
  children,
}: {
  kind: "missing" | "ok" | "coverage" | "info";
  children: React.ReactNode;
}) {
  const styles = {
    missing: "bg-amber/15 text-amber",
    ok: "bg-teal/15 text-teal",
    coverage: "bg-muted text-muted-foreground",
    info: "bg-accent text-accent-foreground",
  }[kind];
  return (
    <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium", styles)}>
      {children}
    </span>
  );
}
