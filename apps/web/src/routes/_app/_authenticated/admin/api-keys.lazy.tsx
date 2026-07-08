import { createLazyFileRoute } from "@tanstack/react-router";

import { ApiKeysPage } from "@/components/admin/api-keys-page";

export const Route = createLazyFileRoute("/_app/_authenticated/admin/api-keys")({
  component: ApiKeysPage,
});
