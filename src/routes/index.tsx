import { createFileRoute, Link } from "@tanstack/react-router";
import { Map, Briefcase, ShieldCheck, ArrowRight } from "lucide-react";
import { DisclaimerFooter } from "@/components/disclaimer-footer";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Chemist Care Pharmacy Opportunity Scout" },
      {
        name: "description",
        content:
          "Decision support for Victorian pharmacist owners and prospective buyers: acquisition pipeline, verified discovery data and evidence for professional due diligence.",
      },
      { property: "og:title", content: "Chemist Care Pharmacy Opportunity Scout" },
      {
        property: "og:description",
        content:
          "Manage pharmacy acquisitions, screen possible sites, and assemble evidence for professional due diligence in Victoria.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <div className="text-sm font-semibold text-foreground">Chemist Care</div>
            <div className="text-xs text-muted-foreground">Pharmacy Opportunity Scout</div>
          </div>
          <Link
            to="/auth"
            className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-6 py-16 md:py-24">
          <div className="max-w-3xl">
            <p className="text-sm font-medium text-teal">Phase 1 preview</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight md:text-5xl">
              A calmer way to evaluate pharmacy opportunities in Victoria.
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
              Track acquisitions, review verified discovery data, and keep every source and door
              point traceable. Regulatory screening for the Pharmacy Location Rules and Victorian
              Pharmacy Authority requirements arrives in later phases.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/auth"
                className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                Get started <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#how"
                className="inline-flex items-center gap-2 rounded-md border border-input px-5 py-2.5 text-sm font-medium text-foreground hover:bg-accent"
              >
                What Phase 1 does
              </a>
            </div>
          </div>
        </section>

        <section id="how" className="border-t border-border bg-card">
          <div className="mx-auto grid max-w-6xl gap-6 px-6 py-14 md:grid-cols-3">
            <Feature icon={Map} title="Opportunity Map">
              Explore verified pharmacy discovery points across Camberwell, Hawthorn, Kew, Balwyn
              and Glen Iris. Every point shows its source, fetched date, and whether the VPA
              register or PBS approval has been matched.
            </Feature>
            <Feature icon={Briefcase} title="Acquisition Scout">
              Build a private pipeline of acquisition opportunities. Move deals through
              watchlist, contacting, information memorandum, due diligence, offer and outcomes.
              Financial analysis appears only when you enter private data.
            </Feature>
            <Feature icon={ShieldCheck} title="Data & Sources">
              Every dataset shows its regulatory purpose, licence status, coverage and last
              refresh. VPA and PBS records only appear once an admin imports a snapshot.
            </Feature>
          </div>
        </section>
      </main>

      <DisclaimerFooter />
    </div>
  );
}

function Feature({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Map;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-background/40 p-6">
      <Icon className="h-6 w-6 text-teal" />
      <h2 className="mt-4 text-lg font-semibold text-foreground">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}
