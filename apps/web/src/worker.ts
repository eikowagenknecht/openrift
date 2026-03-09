interface Env {
  /** Static assets binding (Cloudflare Workers Assets) */
  ASSETS: { fetch(request: Request): Promise<Response> };
  /** Backend API origin, e.g. "https://preview.openrift.app" */
  API_BACKEND: string;
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
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

    return env.ASSETS.fetch(request);
  },
};

export default worker;
