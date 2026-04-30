import { OpenAPIHono } from "@hono/zod-openapi";

import type { Variables } from "../../types.js";

const MAX_ENVELOPE_BYTES = 1_000_000;

// Tunnels browser Sentry envelopes through our own origin so they aren't
// blocked by Firefox Enhanced Tracking Protection or ad-blockers (Sentry's
// recommended workaround for `*.ingest.sentry.io` being on tracker blocklists).
// Follows Sentry's documented pattern: parse the envelope header, validate
// the claimed DSN host + project ID match SENTRY_DSN_SSR, then forward.
export const sentryTunnelRoute = new OpenAPIHono<{ Variables: Variables }>().post(
  "/sentry-tunnel",
  async (c) => {
    const { sentryDsnSsr } = c.get("config");
    const { fetch } = c.get("io");

    if (!sentryDsnSsr) {
      return c.json({ error: "Sentry tunnel not configured" }, 503);
    }

    const allowed = new URL(sentryDsnSsr);
    const allowedProjectId = allowed.pathname.replace(/^\/+/, "");

    const body = await c.req.raw.arrayBuffer();
    if (body.byteLength > MAX_ENVELOPE_BYTES) {
      return c.body(null, 413);
    }

    const text = new TextDecoder().decode(body);
    const newlineIdx = text.indexOf("\n");
    if (newlineIdx === -1) {
      return c.body(null, 400);
    }

    let envelopeDsn: URL;
    try {
      const header = JSON.parse(text.slice(0, newlineIdx)) as { dsn?: string };
      if (!header.dsn) {
        return c.body(null, 400);
      }
      envelopeDsn = new URL(header.dsn);
    } catch {
      return c.body(null, 400);
    }

    const projectId = envelopeDsn.pathname.replace(/^\/+/, "");
    if (envelopeDsn.host !== allowed.host || projectId !== allowedProjectId) {
      return c.body(null, 400);
    }

    const headers: Record<string, string> = {
      "content-type": c.req.header("content-type") ?? "application/x-sentry-envelope",
    };
    const encoding = c.req.header("content-encoding");
    if (encoding) {
      headers["content-encoding"] = encoding;
    }

    const upstream = await fetch(`https://${envelopeDsn.host}/api/${projectId}/envelope/`, {
      method: "POST",
      headers,
      body,
      redirect: "manual",
    });

    return new Response(upstream.body, {
      status: upstream.status,
      headers: upstream.headers,
    });
  },
);
