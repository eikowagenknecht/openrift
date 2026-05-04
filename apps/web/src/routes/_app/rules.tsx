import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/rules")({
  loader: ({ location }) => {
    throw redirect({
      to: "/rules/$kind",
      params: { kind: "core" },
      hash: location.hash || undefined,
      replace: true,
    });
  },
});
