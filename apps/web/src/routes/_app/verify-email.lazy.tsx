import { useQueryClient } from "@tanstack/react-query";
import { createLazyFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { Heading } from "@/components/heading";
import { AuthPageLayout } from "@/components/layout/auth-page-layout";
import { SixDigitOtpInput } from "@/components/six-digit-otp-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FieldError, FieldGroup } from "@/components/ui/field";
import { authClient } from "@/lib/auth-client";
import { otpErrorMessage } from "@/lib/auth-errors";
import { sessionQueryOptions } from "@/lib/auth-session";

export const Route = createLazyFileRoute("/_app/verify-email")({
  component: VerifyEmailPage,
});

function VerifyEmailPage() {
  const { email, redirect: redirectTo } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [otp, setOtp] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");

  async function handleVerify(code: string) {
    if (code.length < 6) {
      return;
    }
    setVerifying(true);
    setError("");
    const result = await authClient.emailOtp.verifyEmail({ email, otp: code }).catch(() => null);
    setVerifying(false);
    if (!result) {
      setError("Could not verify the code. Please try again.");
      return;
    }
    if (result.error) {
      setError(otpErrorMessage(result.error));
      return;
    }
    // better-auth set the cookie, but the ["session"] query cache still holds
    // null from before verification.
    await queryClient.invalidateQueries({ queryKey: sessionQueryOptions().queryKey });
    void navigate({ to: (redirectTo as "/collections") ?? "/collections" });
  }

  async function handleResend() {
    setResending(true);
    setError("");
    const result = await authClient.emailOtp
      .sendVerificationOtp({ email, type: "email-verification" })
      .catch(() => null);
    setResending(false);
    if (!result) {
      setError("Could not send a new code. Please try again.");
    }
  }

  return (
    <AuthPageLayout>
      <Card className="overflow-hidden p-0">
        <CardContent className="flex flex-col items-center gap-4 p-6 text-center md:p-8">
          <img src="/logo-color.svg" alt="OpenRift" className="size-12" />
          <Heading level={1}>Verify your email</Heading>
          <p className="text-muted-foreground text-balance">
            We sent a 6-digit code to <strong>{email}</strong>. Enter it below to verify your
            account.
          </p>
          <FieldGroup className="items-center">
            {error && <FieldError>{error}</FieldError>}
            <SixDigitOtpInput
              autoFocusOnMount
              value={otp}
              onChange={setOtp}
              onComplete={(code) => void handleVerify(code)}
            />
            <Button
              className="w-full"
              disabled={otp.length < 6 || verifying}
              onClick={() => void handleVerify(otp)}
            >
              {verifying ? "Verifying..." : "Verify"}
            </Button>
            <Button
              type="button"
              variant="link-muted"
              disabled={resending}
              onClick={() => void handleResend()}
            >
              {resending ? "Sending..." : "Resend code"}
            </Button>
          </FieldGroup>
          <p className="text-muted-foreground text-sm">
            <Link
              to="/login"
              search={{ redirect: redirectTo, email: undefined }}
              className="underline underline-offset-2"
            >
              Back to login
            </Link>
          </p>
        </CardContent>
      </Card>
    </AuthPageLayout>
  );
}
