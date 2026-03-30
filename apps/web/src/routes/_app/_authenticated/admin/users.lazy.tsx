import { createLazyFileRoute } from "@tanstack/react-router";

import { UsersPage } from "@/components/admin/users-page";

export const Route = createLazyFileRoute("/_app/_authenticated/admin/users")({
  component: UsersPage,
});
