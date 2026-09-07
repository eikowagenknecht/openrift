import { createLazyFileRoute } from "@tanstack/react-router";

import { ScanReportPage } from "@/features/scan/components/scan-report-page";

export const Route = createLazyFileRoute("/_app/_authenticated/scan_/report")({
  component: ScanReportRoute,
});

function ScanReportRoute() {
  return <ScanReportPage />;
}
