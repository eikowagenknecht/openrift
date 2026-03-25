import { createFileRoute, Outlet } from "@tanstack/react-router";

import { Header } from "@/components/layout/header";
import { CONTAINER_WIDTH } from "@/lib/utils";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  return (
    <>
      <Header />
      <main className={`${CONTAINER_WIDTH} flex w-full flex-1 flex-col px-3 py-3`}>
        <Outlet />
      </main>
    </>
  );
}
