import type { Context } from "@opentelemetry/api";
import { context as otelContext, createContextKey } from "@opentelemetry/api";

// Uses OTel context, not `@tanstack/react-start/server`, because
// `@opentelemetry/api` is safe to import in client-bundled modules.

const CLIENT_IP_KEY = createContextKey("openrift.client-ip");

export function contextWithClientIp(ctx: Context, clientIp: string): Context {
  return ctx.setValue(CLIENT_IP_KEY, clientIp);
}

export function activeClientIp(): string | undefined {
  const value = otelContext.active().getValue(CLIENT_IP_KEY);
  return typeof value === "string" && value !== "" ? value : undefined;
}
