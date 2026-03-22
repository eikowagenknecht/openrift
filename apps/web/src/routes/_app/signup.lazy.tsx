import { createLazyFileRoute } from "@tanstack/react-router";

import { SignupForm } from "@/components/signup-form";

export const Route = createLazyFileRoute("/_app/signup")({
  component: SignupPage,
});

function SignupPage() {
  const { redirect: redirectTo = "/", email } = Route.useSearch();

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm md:max-w-4xl">
        <SignupForm redirectTo={redirectTo} initialEmail={email} />
      </div>
    </div>
  );
}
