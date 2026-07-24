import { FULL_DISCLAIMER } from "@/lib/language";

export function DisclaimerFooter() {
  return (
    <footer className="border-t border-border bg-muted/60 px-6 py-4 text-xs leading-relaxed text-muted-foreground">
      <p className="mx-auto max-w-5xl">
        <span className="font-semibold text-foreground">Disclaimer.</span> {FULL_DISCLAIMER}
      </p>
    </footer>
  );
}
