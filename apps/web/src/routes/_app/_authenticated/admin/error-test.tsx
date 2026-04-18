import { createFileRoute } from "@tanstack/react-router";

import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/error-test")({
  staticData: { title: "Error Test" },
  head: () => adminSeoHead("Error Test"),
});
