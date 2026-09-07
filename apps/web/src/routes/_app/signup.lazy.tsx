import { createLazyFileRoute } from "@tanstack/react-router";

import { AuthPageLayout } from "@/components/layout/auth-page-layout";
import { SignupForm } from "@/features/account/components/signup-form";

export const Route = createLazyFileRoute("/_app/signup")({
  component: SignupPage,
});

function SignupPage() {
  const { email, redirect: redirectTo } = Route.useSearch();
  const { emailPlaceholder } = Route.useLoaderData();

  return (
    <AuthPageLayout size="2xl">
      <SignupForm
        redirectTo={redirectTo}
        initialEmail={email}
        emailPlaceholder={emailPlaceholder}
      />
    </AuthPageLayout>
  );
}
