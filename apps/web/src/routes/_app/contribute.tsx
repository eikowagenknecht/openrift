import { createFileRoute } from "@tanstack/react-router";

import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/contribute")({
  head: () =>
    seoHead({
      siteUrl: getSiteUrl(),
      title: "Contribute card data",
      description:
        "Submit a missing or corrected Riftbound card to OpenRift. Opens a prefilled pull request against the openrift-data repo.",
      path: "/contribute",
    }),
});
