import {
  sentryGlobalFunctionMiddleware,
  sentryGlobalRequestMiddleware,
} from "@sentry/tanstackstart-react";
import { createStart } from "@tanstack/react-start";

// Sentry middlewares must be first so they wrap everything downstream in
// request/function spans. The Vite plugin would auto-inject these, but
// wiring them explicitly here makes the pipeline self-documenting.
export const startInstance = createStart(() => ({
  requestMiddleware: [sentryGlobalRequestMiddleware],
  functionMiddleware: [sentryGlobalFunctionMiddleware],
}));
