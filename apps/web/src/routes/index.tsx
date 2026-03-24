import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "OpenRift — A Riftbound Companion" },
      {
        name: "description",
        content:
          "Fast. Open. Ad-free. Browse every Riftbound card, track your collection, and compare prices.",
      },
    ],
  }),
  beforeLoad: ({ context }) => {
    const session = context.queryClient.getQueryData<{ user: unknown } | null>(["session"]);
    if (session?.user) {
      throw redirect({ to: "/cards" });
    }
  },
});
