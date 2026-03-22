import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/verify-email")({
  validateSearch: (search: Record<string, unknown>) => ({
    email: (search.email as string) || "",
  }),
});
