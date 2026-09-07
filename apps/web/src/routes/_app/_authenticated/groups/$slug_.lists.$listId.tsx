/* oxlint-disable unicorn/no-useless-undefined, promise/prefer-await-to-then, unicorn/prefer-top-level-await -- zod's `.catch(undefined)` is a sync fallback, not a Promise#catch */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { RouteErrorFallback } from "@/components/error-message";
import { filterSearchSchema } from "@/features/cards/lib/search-schemas";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

const sharedListSearchSchema = filterSearchSchema.extend({
  fromUser: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/_app/_authenticated/groups/$slug_/lists/$listId")({
  validateSearch: sharedListSearchSchema,
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Shared list", noIndex: true }),
  errorComponent: RouteErrorFallback,
});
