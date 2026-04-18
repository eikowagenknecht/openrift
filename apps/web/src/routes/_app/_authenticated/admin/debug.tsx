import { createFileRoute } from "@tanstack/react-router";

import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/debug")({
  staticData: { title: "Settings" },
  head: () => adminSeoHead("Settings"),
});
