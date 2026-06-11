import type { Context } from "@opentelemetry/api";
import { context as otelContext, createContextKey } from "@opentelemetry/api";

// Carries the real visitor IP (the `X-Real-IP` header nginx forwards, restored
// from Cloudflare's CF-Connecting-IP at the host nginx) through the server-side
// request context, so outbound API calls can forward it without every server
// function threading it explicitly. Rides on the OTel context because that is
// the one request-scoped storage already active around SSR / server-fn
// execution (see middleware/otel-request.ts), and `@opentelemetry/api` is safe
// to import in client-bundled modules — unlike `@tanstack/react-start/server`.

const CLIENT_IP_KEY = createContextKey("openrift.client-ip");

/**
 * Attach the visitor IP to an OTel context.
 *
 * @param ctx - The context to derive from.
 * @param clientIp - The visitor IP from the incoming request's X-Real-IP header.
 * @returns A new context carrying the IP.
 */
export function contextWithClientIp(ctx: Context, clientIp: string): Context {
  return ctx.setValue(CLIENT_IP_KEY, clientIp);
}

/**
 * Read the visitor IP from the active OTel context.
 *
 * @returns The IP attached by the request middleware, or undefined when not in
 * a request scope (internal jobs, cache warmers, the browser).
 */
export function activeClientIp(): string | undefined {
  const value = otelContext.active().getValue(CLIENT_IP_KEY);
  return typeof value === "string" && value !== "" ? value : undefined;
}
