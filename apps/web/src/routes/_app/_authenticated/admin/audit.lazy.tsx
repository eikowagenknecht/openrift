import { createLazyFileRoute } from "@tanstack/react-router";

import { AuditLogPage } from "@/components/admin/audit-log-page";

export const Route = createLazyFileRoute("/_app/_authenticated/admin/audit")({
  component: AuditLogPage,
});
