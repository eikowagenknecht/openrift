import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/contribute_/$cardSlug_/image/$printingId")({
  loader: ({ params }) => {
    throw redirect({
      to: "/contribute/card/$cardSlug/printing/$printingId/image",
      params: { cardSlug: params.cardSlug, printingId: params.printingId },
      replace: true,
    });
  },
});
