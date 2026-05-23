import {
  sentryGlobalFunctionMiddleware,
  sentryGlobalRequestMiddleware,
} from "@sentry/tanstackstart-react";
import { createCsrfMiddleware, createStart } from "@tanstack/react-start";

import { otelRequestMiddleware } from "./middleware/otel-request";

const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
  // Browsers always add at least one of Sec-Fetch-Site / Origin / Referer on a
  // cross-site request, so a request with all three missing can't be a CSRF
  // attack — it's a legitimate client that strips them (old iOS Safari, in-app
  // webviews, privacy proxies). Reject only requests that actively claim a
  // cross-site origin.
  allowRequestsWithoutOriginCheck: true,
});

// Sentry middlewares must be first so they wrap everything downstream in
// request/function spans. The Vite plugin would auto-inject these, but
// wiring them explicitly here makes the pipeline self-documenting. The OTel
// request middleware runs after Sentry so its span sits inside Sentry's,
// and outbound API fetches (via fetchApi) pick up the active OTel span
// to inject W3C traceparent. CSRF runs last so rejections are still
// observable in Sentry/OTel spans.
export const startInstance = createStart(() => ({
  requestMiddleware: [sentryGlobalRequestMiddleware, otelRequestMiddleware, csrfMiddleware],
  functionMiddleware: [sentryGlobalFunctionMiddleware],
}));
