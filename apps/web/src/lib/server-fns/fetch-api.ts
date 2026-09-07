import { context, propagation } from "@opentelemetry/api";

import { apiErrorFromResponse } from "./api-error";
import { getApiUrl } from "./api-url";
import { activeClientIp } from "./client-ip-context";

interface FetchApiOptions {
  errorTitle: string;
  cookie?: string;
  path: string;
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  acceptStatuses?: readonly number[];
}

// Throws ApiError on a non-2xx response not listed in acceptStatuses; otherwise returns the Response untouched.
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
  const url = `${getApiUrl()}${path}`;
  const headers: Record<string, string> = { ...extraHeaders };
  if (cookie !== undefined) {
    headers.cookie = cookie;
  }
  if (body !== undefined) {
    headers["content-type"] = "application/json";
  }
  propagation.inject(context.active(), headers);
  const clientIp = activeClientIp();
  if (clientIp !== undefined) {
    headers["x-real-ip"] = clientIp;
  }
  const res = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok && !acceptStatuses?.includes(res.status)) {
    throw await apiErrorFromResponse(res, errorTitle, { method, url });
  }
  return res;
}

export async function fetchApiJson<T>(options: FetchApiOptions): Promise<T> {
  const res = await fetchApi(options);
  return res.json() as Promise<T>;
}
