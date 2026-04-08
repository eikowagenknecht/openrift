import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/roadmap")({
  head: () => ({ meta: [{ title: "Roadmap — OpenRift" }] }),
});
