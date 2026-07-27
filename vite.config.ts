// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { execFileSync } from "node:child_process";

function resolveCommitSha() {
  const supplied =
    process.env.GITHUB_SHA ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.COMMIT_SHA ??
    process.env.CF_PAGES_COMMIT_SHA;
  if (supplied) return supplied;
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

const buildCommit = resolveCommitSha();
const buildDate = new Date().toISOString();
const buildEnvironment = process.env.DEPLOYMENT_ENV ?? process.env.NODE_ENV ?? "development";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return undefined;
            if (
              id.includes("/leaflet/") ||
              id.includes("/react-leaflet/") ||
              id.includes("/react-leaflet-cluster/")
            ) {
              return "vendor-map";
            }
            if (id.includes("/@supabase/")) return "vendor-supabase";
            if (id.includes("/@tanstack/")) return "vendor-tanstack";
            if (id.includes("/@radix-ui/")) return "vendor-radix";
            if (
              id.includes("/react/") ||
              id.includes("/react-dom/") ||
              id.includes("/scheduler/")
            ) {
              return "vendor-react";
            }
            return "vendor";
          },
        },
      },
    },
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(
        "https://gvrwrqcftlaavxarmgfk.supabase.co",
      ),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
        "sb_publishable_sEkRklmCHAXmEhtiYc00ZA_LqicfUrg",
      ),
      "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify("gvrwrqcftlaavxarmgfk"),
      "import.meta.env.VITE_BUILD_COMMIT_SHA": JSON.stringify(buildCommit),
      "import.meta.env.VITE_BUILD_DATE": JSON.stringify(buildDate),
      "import.meta.env.VITE_BUILD_ENVIRONMENT": JSON.stringify(buildEnvironment),
    },
  },
});
