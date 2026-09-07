import { createLazyFileRoute } from "@tanstack/react-router";

import { UsersPage } from "@/features/admin/components/users-page";

export const Route = createLazyFileRoute("/_app/_authenticated/admin/users")({
  component: UsersPage,
});
