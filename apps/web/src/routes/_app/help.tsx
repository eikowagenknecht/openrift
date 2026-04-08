import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/help")({
  head: () => ({ meta: [{ title: "Help — OpenRift" }] }),
});
