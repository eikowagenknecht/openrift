import { createLazyFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createLazyFileRoute("/_app/_authenticated/decks")({
  component: DecksLayout,
});

function DecksLayout() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-1">
        <Outlet />
      </div>
    </div>
  );
}
