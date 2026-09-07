import { createLazyFileRoute } from "@tanstack/react-router";

import { ApiKeysPage } from "@/features/admin/components/api-keys-page";

export const Route = createLazyFileRoute("/_app/_authenticated/admin/api-keys")({
  component: ApiKeysPage,
});
