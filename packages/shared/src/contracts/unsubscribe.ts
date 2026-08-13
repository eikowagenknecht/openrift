import { oc } from "@orpc/contract";
import { z } from "zod";

const TAG = "Account";

const tokenInput = z.object({ token: z.string().min(1) });

// Keep in sync with `EmailNotificationChannel` (types/api/preferences.ts) — an
// unlisted channel makes the whole unsubscribe handler fail to typecheck.
const channelSchema = z.enum(["tradeMatches", "tradeRequests", "tradeStatus", "cardSubmissions"]);

/**
 * One-click unsubscribe (ADR-030, RFC 8058). `preview` is a safe, read-only
 * GET the web confirmation page calls to render the right channel label and
 * state without mutating anything; `confirm` is the POST that actually flips
 * the channel off. The RFC 8058 mail-client one-click POST is handled by a
 * separate plain route (`/api/v1/unsubscribe/one-click`), not this contract.
 */
export const unsubscribeContract = {
  preview: oc
    .route({ method: "GET", path: "/api/v1/unsubscribe/preview", tags: [TAG] })
    .meta({ auth: "public" })
    .input(tokenInput)
    .output(
      z.object({
        valid: z.boolean(),
        channel: channelSchema.nullable(),
        channelLabel: z.string().nullable(),
        alreadyUnsubscribed: z.boolean(),
      }),
    ),
  confirm: oc
    .route({ method: "POST", path: "/api/v1/unsubscribe", tags: [TAG] })
    .meta({ auth: "public" })
    .input(tokenInput)
    .errors({ BAD_REQUEST: { message: "This unsubscribe link is invalid or has expired." } })
    .output(z.object({ channel: channelSchema, channelLabel: z.string() })),
};
