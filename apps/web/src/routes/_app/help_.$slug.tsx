import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/help_/$slug")({
  head: ({ params }) => ({
    meta: [
      {
        title: `${params.slug.replaceAll("-", " ").replaceAll(/\b\w/g, (char) => char.toUpperCase())} — Help — OpenRift`,
      },
    ],
  }),
});
