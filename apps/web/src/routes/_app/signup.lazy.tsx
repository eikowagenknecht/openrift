import { createLazyFileRoute } from "@tanstack/react-router";

import { AuthPageLayout } from "@/components/layout/auth-page-layout";
import { SignupForm } from "@/components/signup-form";

export const Route = createLazyFileRoute("/_app/signup")({
  component: SignupPage,
});

function SignupPage() {
  const { redirect: redirectTo = "/", email } = Route.useSearch();
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
