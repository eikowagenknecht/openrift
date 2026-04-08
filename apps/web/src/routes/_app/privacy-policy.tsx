import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/privacy-policy")({
  head: () => ({ meta: [{ title: "Privacy Policy — OpenRift" }] }),
});
