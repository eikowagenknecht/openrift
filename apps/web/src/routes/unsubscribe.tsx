import { unsubscribeContract } from "@openrift/shared/contracts/unsubscribe";
import type { EmailNotificationChannel } from "@openrift/shared/types";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import { seoHead } from "@/lib/seo";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { getSiteUrl } from "@/lib/site-config";

/** Read-only view of one channel, used to render the confirmation page. */
export interface UnsubscribePreview {
  valid: boolean;
  channel: EmailNotificationChannel | null;
  channelLabel: string | null;
  alreadyUnsubscribed: boolean;
}

const INVALID_PREVIEW: UnsubscribePreview = {
  valid: false,
  channel: null,
  channelLabel: null,
  alreadyUnsubscribed: false,
};

// Safe, read-only: resolves the channel + state for display. The mutation lives
// in the POST confirm action, so opening this link (incl. by a link scanner)
// never changes anything.
const previewUnsubscribeFn = createServerFn({ method: "GET" })
  .validator((token: string) => token)
  .handler(({ data }): Promise<UnsubscribePreview> => {
    if (!data) {
      return Promise.resolve(INVALID_PREVIEW);
    }
    return apiOrpcClient(unsubscribeContract).preview({ token: data });
  });

export const Route = createFileRoute("/unsubscribe")({
  head: () =>
    seoHead({
      siteUrl: getSiteUrl(),
      title: "Unsubscribe",
      path: "/unsubscribe",
      noIndex: true,
    }),
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : "",
  }),
  loaderDeps: ({ search }) => ({ token: search.token }),
  loader: ({ deps }): Promise<UnsubscribePreview> => previewUnsubscribeFn({ data: deps.token }),
});
