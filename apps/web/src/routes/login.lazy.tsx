import { createLazyFileRoute } from "@tanstack/react-router";

import { LoginForm } from "@/components/login-form";

export const Route = createLazyFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { redirect: redirectTo = "/", email } = Route.useSearch();

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm md:max-w-4xl">
        <LoginForm redirectTo={redirectTo} initialEmail={email} />
      </div>
    </div>
  );
}
