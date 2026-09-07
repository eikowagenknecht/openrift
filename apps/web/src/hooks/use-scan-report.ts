import { scanReportsContract } from "@openrift/shared/contracts/scan-reports";
import type { CreateScanReportInput } from "@openrift/shared/contracts/scan-reports";
import type { ScanReportResponse } from "@openrift/shared/types/api/scan-report";
import { useMutation } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";

const sendScanReportFn = createServerFn({ method: "POST" })
  .validator((input: CreateScanReportInput) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<ScanReportResponse> =>
    apiOrpcClient(scanReportsContract, context.cookie).create(data),
  );

export function useSendScanReport() {
  return useMutation({
    mutationFn: (input: CreateScanReportInput): Promise<ScanReportResponse> =>
      sendScanReportFn({ data: input }),
  });
}
