import {
  sentryGlobalFunctionMiddleware,
  sentryGlobalRequestMiddleware,
} from "@sentry/tanstackstart-react";
import { createCsrfMiddleware, createStart } from "@tanstack/react-start";

import { otelRequestMiddleware } from "./middleware/otel-request";

const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
  // Missing Sec-Fetch-Site/Origin/Referer means a client that strips them, not CSRF;
  // browsers always send at least one on a cross-site request.
  allowRequestsWithoutOriginCheck: true,
});

// Order matters: Sentry first so its span wraps OTel's, CSRF last so
// rejections are still observable in both.
export const startInstance = createStart(() => ({
  requestMiddleware: [sentryGlobalRequestMiddleware, otelRequestMiddleware, csrfMiddleware],
  functionMiddleware: [sentryGlobalFunctionMiddleware],
}));
