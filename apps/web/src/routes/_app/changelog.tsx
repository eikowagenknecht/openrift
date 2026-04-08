import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/changelog")({
  head: () => ({ meta: [{ title: "Changelog — OpenRift" }] }),
});
