import { createLazyFileRoute } from "@tanstack/react-router";

import { ScanTestPage } from "@/components/admin/scan-test-page";

export const Route = createLazyFileRoute("/_authenticated/admin/scan")({
  component: ScanTestPage,
});
