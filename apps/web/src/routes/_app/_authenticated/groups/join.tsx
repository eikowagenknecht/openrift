import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { RouteErrorFallback } from "@/components/error-message";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

const searchSchema = z.object({
  code: z.string().optional(),
});

export const Route = createFileRoute("/_app/_authenticated/groups/join")({
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Join group", noIndex: true }),
  validateSearch: (search) => searchSchema.parse(search),
  errorComponent: RouteErrorFallback,
});
