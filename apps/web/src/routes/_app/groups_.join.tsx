import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { RouteErrorFallback } from "@/components/error-message";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

const searchSchema = z.object({
  code: z.string().optional(),
});

// Outside `_authenticated` on purpose: a code link must say which group it
// leads to before asking anyone to sign in. Requesting to join still needs an account.
export const Route = createFileRoute("/_app/groups_/join")({
  ssr: "data-only",
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Join group", noIndex: true }),
  validateSearch: (search) => searchSchema.parse(search),
  errorComponent: RouteErrorFallback,
});
