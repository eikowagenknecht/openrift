import { useMutation } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { fetchApiJson } from "@/lib/server-fns/fetch-api";
import { withCookies } from "@/lib/server-fns/middleware";

interface FlushPrintingEventsResponse {
  sent: number;
  failed: number;
}

const flushPrintingEventsFn = createServerFn({ method: "POST" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<FlushPrintingEventsResponse> =>
      fetchApiJson<FlushPrintingEventsResponse>({
        errorTitle: "Couldn't flush printing events",
        cookie: context.cookie,
        path: "/api/v1/admin/printing-events/flush",
        method: "POST",
      }),
  );

export function useFlushPrintingEvents() {
  return useMutation({
    mutationFn: () => flushPrintingEventsFn(),
  });
}
