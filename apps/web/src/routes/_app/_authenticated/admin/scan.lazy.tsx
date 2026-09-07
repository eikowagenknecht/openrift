import { createLazyFileRoute } from "@tanstack/react-router";

import { ScanTestPage } from "@/features/admin/components/scan-test-page";

export const Route = createLazyFileRoute("/_app/_authenticated/admin/scan")({
  component: ScanTestPage,
});
