import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

// Fetch the current user session.
// Reads cookies from the incoming request and forwards them to the auth API.
export const fetchSession = createServerFn({ method: "GET" }).handler(async () => {
  const headers = getRequestHeaders();
  const cookie = headers.cookie;

  const res = await fetch(`${API_URL}/api/auth/get-session`, {
    headers: cookie ? { cookie } : {},
  });

  if (!res.ok) {
    return null;
  }

  return (await res.json()) as { session: unknown; user: unknown } | null;
});

// Generic authenticated API fetch. Forwards the request's cookies to the API.
// Used as the queryFn in query options so that:
// - During SSR: runs in-process, reads cookies from the SSR request
// - During client navigation: makes an RPC call to the Start server,
//   which receives the browser's cookies and forwards them to the API
export const fetchApi = createServerFn({ method: "GET" })
  .inputValidator((path: string) => path)
  .handler(async ({ data: path }) => {
    const headers = getRequestHeaders();
    const cookie = headers.cookie;

    const url = path.startsWith("http") ? path : `${API_URL}${path}`;
    const res = await fetch(url, {
      headers: cookie ? { cookie } : {},
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`API ${res.status}: ${body}`);
    }

    const text = await res.text();
    if (!text) {
      return null;
    }
    return JSON.parse(text);
  });
