import { createLazyFileRoute } from "@tanstack/react-router";

import { AuthPageLayout } from "@/components/layout/auth-page-layout";
import { SignupForm } from "@/components/signup-form";

export const Route = createLazyFileRoute("/_app/signup")({
  component: SignupPage,
});

function SignupPage() {
  const { redirect: redirectTo = "/", email } = Route.useSearch();

  return (
    <AuthPageLayout size="4xl">
      <SignupForm redirectTo={redirectTo} initialEmail={email} />
    </AuthPageLayout>
  );
}
