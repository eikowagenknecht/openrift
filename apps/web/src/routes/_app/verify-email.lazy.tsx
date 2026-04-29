import { useQueryClient } from "@tanstack/react-query";
import { createLazyFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { AuthPageLayout } from "@/components/layout/auth-page-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FieldError, FieldGroup } from "@/components/ui/field";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { clearUserScopedCache } from "@/lib/auth-cache";
import { authClient } from "@/lib/auth-client";

export const Route = createLazyFileRoute("/_app/verify-email")({
  component: VerifyEmailPage,
});

function VerifyEmailPage() {
  const { email, redirect } = Route.useSearch();
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
    const result = await authClient.emailOtp.verifyEmail({ email, otp: code });
    setVerifying(false);
    if (result.error) {
      if (result.error.code === "OTP_EXPIRED") {
        setError("Code expired. Please request a new one.");
      } else if (result.error.code === "INVALID_OTP") {
        setError("Incorrect code. Please try again.");
      } else if (result.error.code === "TOO_MANY_ATTEMPTS") {
        setError("Too many attempts. Please request a new code.");
      } else {
        setError(result.error.message ?? "Something went wrong. Please try again.");
      }
      return;
    }
    await clearUserScopedCache(queryClient);
    void navigate({ to: (redirect as "/") ?? "/" });
  }

  async function handleResend() {
    setResending(true);
    setError("");
    await authClient.emailOtp.sendVerificationOtp({ email, type: "email-verification" });
    setResending(false);
  }

  return (
    <AuthPageLayout>
      <Card className="overflow-hidden p-0">
        <CardContent className="flex flex-col items-center gap-4 p-6 text-center md:p-8">
          <img src="/logo-color.svg" alt="OpenRift" className="size-12" />
          <h1 className="text-2xl font-bold">Verify your email</h1>
          <p className="text-muted-foreground text-balance">
            We sent a 6-digit code to <strong>{email}</strong>. Enter it below to verify your
            account.
          </p>
          <FieldGroup className="items-center">
            {error && <FieldError>{error}</FieldError>}
            <InputOTP
              maxLength={6}
              value={otp}
              onChange={setOtp}
              onComplete={handleVerify}
              // oxlint-disable-next-line jsx-a11y/no-autofocus -- OTP input is the sole action on this page
              autoFocus
            >
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>
            <Button
              className="w-full"
              disabled={otp.length < 6 || verifying}
              onClick={() => handleVerify(otp)}
            >
              {verifying ? "Verifying..." : "Verify"}
            </Button>
            <button
              type="button"
              className="text-muted-foreground text-sm underline underline-offset-2"
              disabled={resending}
              onClick={handleResend}
            >
              {resending ? "Sending..." : "Resend code"}
            </button>
          </FieldGroup>
          <p className="text-muted-foreground text-sm">
            <Link
              to="/login"
              search={{ redirect: undefined, email: undefined }}
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
