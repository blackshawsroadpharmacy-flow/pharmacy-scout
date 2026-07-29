import { createFileRoute, redirect } from "@tanstack/react-router";

// /app now redirects to the map-first home. The signed-in map lives at /.
export const Route = createFileRoute("/app/")({
  beforeLoad: () => {
    throw redirect({ to: "/", search: {} });
  },
});
