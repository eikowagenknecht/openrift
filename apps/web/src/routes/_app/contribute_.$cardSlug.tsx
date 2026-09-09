import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/contribute_/$cardSlug")({
  loader: ({ params }) => {
    throw redirect({
      to: "/contribute/card/$cardSlug",
      params: { cardSlug: params.cardSlug },
      replace: true,
    });
  },
});
