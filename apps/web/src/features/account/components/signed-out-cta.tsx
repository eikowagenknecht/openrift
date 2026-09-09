import { Link, useLocation } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useHydrated } from "@/hooks/use-hydrated";
import { useUserId } from "@/lib/auth-session";

/**
 * Sign-in / create-account pair that sends the visitor back to the page they
 * came from, so a token in the URL survives the trip through login.
 */
export function SignedOutAuthButtons({
  signInLabel = "Sign in",
  signUpLabel = "Create an account",
}: {
  signInLabel?: string;
  signUpLabel?: string;
}) {
  const location = useLocation();
  const search = { redirect: location.href, email: undefined };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link to="/login" search={search} className={buttonVariants()}>
        {signInLabel}
      </Link>
      <Link to="/signup" search={search} className={buttonVariants({ variant: "ghost" })}>
        {signUpLabel}
      </Link>
    </div>
  );
}

/**
 * Gated on hydration because these pages are SSR'd behind a shared public
 * cache, so anything per-viewer has to be resolved on the client.
 */
export function PublicShareCta({ title, children }: { title: string; children: ReactNode }) {
  const hydrated = useHydrated();
  const userId = useUserId();
  if (!hydrated || userId) {
    return null;
  }
  return (
    <Card className="my-3 flex-row flex-wrap items-center justify-between gap-3 px-4">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="font-medium">{title}</span>
        <span className="text-muted-foreground">{children}</span>
      </div>
      <SignedOutAuthButtons signUpLabel="Create a free account" />
    </Card>
  );
}
