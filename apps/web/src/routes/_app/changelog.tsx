import { createFileRoute } from "@tanstack/react-router";

import { articleJsonLd, seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

const CHANGELOG_DESCRIPTION = "Recent updates and new features in OpenRift.";

export const Route = createFileRoute("/_app/changelog")({
  head: () => {
    const siteUrl = getSiteUrl();
    const head = seoHead({
      siteUrl,
      title: "Changelog",
      description: CHANGELOG_DESCRIPTION,
      path: "/changelog",
    });
    return {
      ...head,
      scripts: [
        articleJsonLd({
          siteUrl,
          headline: "OpenRift Changelog",
          description: CHANGELOG_DESCRIPTION,
          path: "/changelog",
        }),
      ],
    };
  },
});
