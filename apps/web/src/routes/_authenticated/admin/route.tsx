import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { API_BASE } from "@/lib/api-base";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async () => {
    const res = await fetch(`${API_BASE}/api/admin/me`, {
      credentials: "include",
    });
    if (!res.ok) {
      throw redirect({ to: "/" });
    }
    const data = (await res.json()) as { isAdmin: boolean };
    if (!data.isAdmin) {
      throw redirect({ to: "/" });
    }
  },
  component: AdminLayout,
});

function AdminLayout() {
  return <Outlet />;
}
