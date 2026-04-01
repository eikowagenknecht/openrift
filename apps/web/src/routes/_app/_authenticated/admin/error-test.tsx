import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/_authenticated/admin/error-test")({
  staticData: { title: "Error Test" },
});
