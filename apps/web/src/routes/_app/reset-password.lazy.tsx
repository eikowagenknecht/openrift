import { createLazyFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { authClient } from "@/lib/auth-client";
import { randomEmailPlaceholder } from "@/lib/placeholders";

export const Route = createLazyFileRoute("/_app/reset-password")({
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { email: initialEmail } = Route.useSearch();
  const navigate = useNavigate();

  const [step, setStep] = useState<"email" | "code">(initialEmail ? "code" : "email");
  const [email, setEmail] = useState(initialEmail);
  const [emailError, setEmailError] = useState("");

  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [emailPlaceholder] = useState(randomEmailPlaceholder);

  async function handleSendCode() {
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes("@")) {
      setEmailError("Please enter a valid email address.");
      return;
    }
    setEmailError("");
    setLoading(true);
    await authClient.emailOtp.sendVerificationOtp({ email: trimmed, type: "forget-password" });
    setLoading(false);
    setStep("code");
  }

  async function handleResend() {
    setResending(true);
    setError("");
    await authClient.emailOtp.sendVerificationOtp({ email: email.trim(), type: "forget-password" });
    setResending(false);
  }

  async function handleReset() {
    setError("");
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    const result = await authClient.emailOtp.resetPassword({
      email: email.trim(),
      otp,
      password: newPassword,
    });
    setLoading(false);
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
    void navigate({ to: "/login", search: { redirect: undefined, email: email.trim() } });
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm md:max-w-md">
        <Card className="overflow-hidden p-0">
          <CardContent className="flex flex-col items-center gap-4 p-6 text-center md:p-8">
            <img src="/logo.webp" alt="OpenRift" className="size-12" />
            <h1 className="text-2xl font-bold">Reset your password</h1>

            {step === "email" ? (
              <>
                <p className="text-muted-foreground text-balance">
                  Enter your email and we&apos;ll send you a code to reset your password.
                </p>
                <FieldGroup className="w-full">
                  {emailError && <FieldError>{emailError}</FieldError>}
                  <Field>
                    <FieldLabel htmlFor="reset-email">Email</FieldLabel>
                    <Input
                      id="reset-email"
                      type="email"
                      placeholder={emailPlaceholder}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      aria-invalid={Boolean(emailError)}
                    />
                  </Field>
                  <Field>
                    <Button className="w-full" disabled={loading} onClick={handleSendCode}>
                      {loading ? "Sending..." : "Send code"}
                    </Button>
                  </Field>
                </FieldGroup>
              </>
            ) : (
              <>
                <p className="text-muted-foreground text-balance">
                  Enter the 6-digit code sent to <strong>{email.trim()}</strong> and your new
                  password.
                </p>
                <FieldGroup className="w-full items-center">
                  {error && <FieldError>{error}</FieldError>}
                  <InputOTP maxLength={6} value={otp} onChange={setOtp}>
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                  <Field className="w-full">
                    <FieldLabel htmlFor="new-password">New password</FieldLabel>
                    <Input
                      id="new-password"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                    />
                  </Field>
                  <Field className="w-full">
                    <FieldLabel htmlFor="confirm-password">Confirm password</FieldLabel>
                    <Input
                      id="confirm-password"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                    />
                  </Field>
                  <Button
                    className="w-full"
                    disabled={otp.length < 6 || !newPassword || loading}
                    onClick={handleReset}
                  >
                    {loading ? "Resetting..." : "Reset password"}
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
              </>
            )}

            <p className="text-muted-foreground text-sm">
              <Link
                to="/login"
                search={{ redirect: undefined, email: email.trim() || undefined }}
                className="underline underline-offset-2"
              >
                Back to login
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
