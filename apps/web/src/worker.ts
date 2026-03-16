interface Env {
  /** Static assets binding (Cloudflare Workers Assets) */
  ASSETS: { fetch(request: Request): Promise<Response> };
  /** Backend API origin, e.g. "https://preview.openrift.app" */
  API_BACKEND: string;
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/card-images/")) {
      const backend = new URL(url.pathname + url.search, env.API_BACKEND);
      const headers = new Headers(request.headers);
      headers.set("Host", new URL(env.API_BACKEND).host);
      headers.set("X-Forwarded-Host", url.host);

      const res = await fetch(backend, {
        method: request.method,
        headers,
        body: request.body,
        redirect: "manual",
      });

      // Rewrite any Location headers pointing at the backend back to the Workers origin,
      // so OAuth redirects land on the same domain the user is browsing.
      const location = res.headers.get("Location");
      if (location) {
        try {
          const loc = new URL(location);
          if (loc.origin === new URL(env.API_BACKEND).origin) {
            loc.protocol = url.protocol;
            loc.host = url.host;
            const rewritten = new Response(res.body, res);
            rewritten.headers.set("Location", loc.toString());
            return rewritten;
          }
        } catch {
          // non-URL location, pass through
        }
      }

      return res;
    }

    // Serve static assets, with SPA fallback for client-side routes.
    // We handle this manually instead of using Cloudflare's built-in
    // not_found_handling: "single-page-application" because that intercepts
    // navigation requests to /card-images/ and /api/ before the Worker runs.
    const asset = await env.ASSETS.fetch(request);
    if (asset.status === 404) {
      return env.ASSETS.fetch(new Request(new URL("/index.html", request.url), request));
    }
    return asset;
  },
};

export default worker;
