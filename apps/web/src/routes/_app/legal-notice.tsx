import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/legal-notice")({
  head: () => ({ meta: [{ title: "Legal Notice — OpenRift" }] }),
});
