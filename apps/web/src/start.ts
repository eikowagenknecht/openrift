import {
  sentryGlobalFunctionMiddleware,
  sentryGlobalRequestMiddleware,
} from "@sentry/tanstackstart-react";
import { createCsrfMiddleware, createStart } from "@tanstack/react-start";

import { otelRequestMiddleware } from "./middleware/otel-request";

const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
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
