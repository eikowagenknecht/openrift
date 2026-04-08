import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/reset-password")({
  head: () => ({ meta: [{ title: "Reset Password — OpenRift" }] }),
  validateSearch: (search: Record<string, unknown>) => ({
    email: (search.email as string) || "",
  }),
});
