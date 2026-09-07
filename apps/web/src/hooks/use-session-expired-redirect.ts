import { useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import { useSession } from "@/lib/auth-session";

/**
 * Catches a session expiring while `_authenticated` stays mounted (the beforeLoad
 * guard only runs on navigation in). `redirectedRef` stops `navigate`'s own href change from looping.
 */
export function useSessionExpiredRedirect(): boolean {
  const { data: session } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const expired = session === null;
  const currentHref = location.href;
  const redirectedRef = useRef(false);
  useEffect(() => {
    if (!expired) {
      redirectedRef.current = false;
      return;
    }
    if (redirectedRef.current) {
      return;
    }
    redirectedRef.current = true;
    void navigate({
      to: "/login",
      search: { redirect: currentHref || undefined, email: undefined },
    });
  }, [expired, navigate, currentHref]);
  return expired;
}
