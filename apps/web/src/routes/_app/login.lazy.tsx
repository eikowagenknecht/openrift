import { createLazyFileRoute } from "@tanstack/react-router";

import { AuthPageLayout } from "@/components/layout/auth-page-layout";
import { LoginForm } from "@/components/login-form";

export const Route = createLazyFileRoute("/_app/login")({
  component: LoginPage,
});

function LoginPage() {
  const { redirect: redirectTo = "/", email } = Route.useSearch();
  const { emailPlaceholder } = Route.useLoaderData();

  return (
    <AuthPageLayout size="2xl">
      <LoginForm redirectTo={redirectTo} initialEmail={email} emailPlaceholder={emailPlaceholder} />
    </AuthPageLayout>
  );
}
