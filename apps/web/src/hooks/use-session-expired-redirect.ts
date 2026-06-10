import { useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { useSession } from "@/lib/auth-session";

/**
 * Watches for the session disappearing while an `_authenticated` route is
 * mounted, and redirects to /login when it does.
 *
 * The `_authenticated` beforeLoad guard only runs on navigation INTO the
 * layout — it can't see a session that expires or is revoked afterwards
 * (long-lived tab, sign-out in another tab). When the session query then
 * refetches and resolves to null, every mounted user-scoped component
 * re-renders with no user and `useRequiredUserId()` throws into the route's
 * error boundary. The layout must instead unmount its children the moment the
 * session is gone (render null when this returns true) and send the user to
 * /login with a redirect back to where they were.
 *
 * `null` is the session query's "definitively signed out" result; `undefined`
 * means the query hasn't resolved yet (the beforeLoad guard has already
 * ensured it by the time the layout mounts, so this is a non-state in
 * practice) and triggers nothing.
 *
 * @returns Whether the session is gone and the redirect has been scheduled.
 */
export function useSessionExpiredRedirect(): boolean {
  const { data: session } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const expired = session === null;
  const currentHref = location.href;
  useEffect(() => {
    if (expired) {
      void navigate({
        to: "/login",
        search: { redirect: currentHref || undefined, email: undefined },
      });
    }
  }, [expired, navigate, currentHref]);
  return expired;
}
