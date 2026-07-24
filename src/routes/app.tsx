import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

// Client-only auth gate. Supabase stores the session in localStorage which
// the server cannot read, so this route is not SSR-rendered.
export const Route = createFileRoute("/app")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/auth", search: { redirect: location.href } });
    }
    return { user: data.user };
  },
  component: () => <Outlet />,
});
