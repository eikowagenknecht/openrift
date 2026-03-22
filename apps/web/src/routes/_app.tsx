import { createFileRoute, Outlet } from "@tanstack/react-router";

import { Header } from "@/components/layout/header";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  return (
    <>
      <Header />
      <main className="mx-auto flex w-full max-w-7xl wide:max-w-(--container-max-wide) xwide:max-w-(--container-max-xwide) xxwide:max-w-(--container-max-xxwide) flex-1 flex-col px-4 py-6">
        <Outlet />
      </main>
    </>
  );
}
