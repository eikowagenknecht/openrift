import { API_URL } from "./api-url";

interface FetchApiOptions {
  // Full, user-facing sentence for the Sonner toast on failure (e.g. "Couldn't delete collection").
  errorTitle: string;
  cookie?: string;
  path: string;
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  // Status codes that should be returned to the caller without logging or
  // throwing — for endpoints that use non-2xx codes as intentional control
  // flow (e.g. /admin/me returning 401/403 for non-admins). The Response is
  // returned as-is; callers must inspect res.ok / res.status themselves.
  acceptStatuses?: readonly number[];
}

/**
 * Fetches the API with structured error reporting. On a non-2xx response
 * (that isn't listed in acceptStatuses), captures the body, logs it to the
 * server console, and throws an Error whose message carries both the toast
 * title (errorTitle) and the full diagnostic details, separated by "\n---\n".
 * The global mutation onError splits on that marker: the title goes to
 * Sonner, the details go to console.error.
 * @returns The Response for ok or accepted statuses; throws otherwise.
 */
export async function fetchApi(options: FetchApiOptions): Promise<Response> {
  const {
    errorTitle,
    cookie,
    path,
    method = "GET",
    body,
    headers: extraHeaders,
    acceptStatuses,
  } = options;
  const url = `${API_URL}${path}`;
  const headers: Record<string, string> = { ...extraHeaders };
  if (cookie !== undefined) {
    headers.cookie = cookie;
  }
  if (body !== undefined) {
    headers["content-type"] = "application/json";
  }
  const res = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok && !acceptStatuses?.includes(res.status)) {
    const respBody = await res.text().catch(() => "<no body>");
    console.error(`[${errorTitle}]`, { url, method, status: res.status, body: respBody });
    throw new Error(
      `${errorTitle}\n---\n${method} ${url} → ${res.status} ${res.statusText}\n${respBody}`,
    );
  }
  return res;
}

/**
 * Same as fetchApi, but parses the response as JSON and returns the typed payload.
 * @returns The decoded JSON body as T.
 */
export async function fetchApiJson<T>(options: FetchApiOptions): Promise<T> {
  const res = await fetchApi(options);
  return res.json() as Promise<T>;
}
