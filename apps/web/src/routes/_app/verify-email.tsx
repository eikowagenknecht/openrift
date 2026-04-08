import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/verify-email")({
  head: () => ({ meta: [{ title: "Verify Email — OpenRift" }] }),
  validateSearch: (search: Record<string, unknown>) => ({
    email: (search.email as string) || "",
  }),
});
