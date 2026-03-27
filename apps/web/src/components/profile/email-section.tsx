import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { authClient } from "@/lib/auth-client";

export function EmailSection({ currentEmail }: { currentEmail: string }) {
  const [step, setStep] = useState<"input" | "verify-current" | "verify-new">("input");
  const [newEmail, setNewEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [success, setSuccess] = useState(false);

  function resetFlow() {
    setStep("input");
    setNewEmail("");
    setOtp("");
    setError("");
    setSuccess(false);
  }

  async function handleSendToCurrentEmail() {
    const trimmed = newEmail.trim();
    if (!trimmed || !trimmed.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }
    setError("");
    setLoading(true);
    await authClient.emailOtp.sendVerificationOtp({
      email: currentEmail,
      type: "email-verification",
    });
    setLoading(false);
    setStep("verify-current");
  }

  async function handleVerifyCurrentEmail() {
    if (otp.length < 6) {
      return;
    }
    setLoading(true);
    setError("");
    const result = await authClient.emailOtp.requestEmailChange({
      newEmail: newEmail.trim(),
      otp,
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
    setOtp("");
    setStep("verify-new");
  }

  async function handleVerifyNewEmail() {
    if (otp.length < 6) {
      return;
    }
    setLoading(true);
    setError("");
    const result = await authClient.emailOtp.changeEmail({
      newEmail: newEmail.trim(),
      otp,
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
    setSuccess(true);
    setStep("input");
    setNewEmail("");
    setOtp("");
  }

  async function handleResend() {
    setResending(true);
    setError("");
    if (step === "verify-current") {
      await authClient.emailOtp.sendVerificationOtp({
        email: currentEmail,
        type: "email-verification",
      });
    } else if (step === "verify-new") {
      await authClient.emailOtp.requestEmailChange({
        newEmail: newEmail.trim(),
        otp: "",
      });
    }
    setResending(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Email Address</CardTitle>
        <CardDescription>
          Your current email is <span className="text-foreground font-medium">{currentEmail}</span>.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          {error && <FieldError>{error}</FieldError>}
          {success && (
            <FieldDescription className="text-emerald-600">
              Email updated successfully.
            </FieldDescription>
          )}

          {step === "input" && (
            <>
              <Field>
                <FieldLabel htmlFor="new-email">New email</FieldLabel>
                <Input
                  id="new-email"
                  type="email"
                  placeholder={currentEmail}
                  value={newEmail}
                  onChange={(e) => {
                    setNewEmail(e.target.value);
                    setSuccess(false);
                  }}
                />
              </Field>
              <Field>
                <Button disabled={loading || !newEmail.trim()} onClick={handleSendToCurrentEmail}>
                  {loading ? "Sending..." : "Send code to current email"}
                </Button>
              </Field>
            </>
          )}

          {step === "verify-current" && (
            <>
              <p className="text-muted-foreground text-sm">
                Enter the 6-digit code sent to <strong>{currentEmail}</strong>.
              </p>
              <div className="flex justify-center">
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
              </div>
              <Field>
                <Button disabled={otp.length < 6 || loading} onClick={handleVerifyCurrentEmail}>
                  {loading ? "Verifying..." : "Verify"}
                </Button>
              </Field>
              <div className="flex justify-center gap-4">
                <button
                  type="button"
                  className="text-muted-foreground text-sm underline underline-offset-2"
                  disabled={resending}
                  onClick={handleResend}
                >
                  {resending ? "Sending..." : "Resend code"}
                </button>
                <button
                  type="button"
                  className="text-muted-foreground text-sm underline underline-offset-2"
                  onClick={resetFlow}
                >
                  Cancel
                </button>
              </div>
            </>
          )}

          {step === "verify-new" && (
            <>
              <p className="text-muted-foreground text-sm">
                Enter the 6-digit code sent to <strong>{newEmail.trim()}</strong>.
              </p>
              <div className="flex justify-center">
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
              </div>
              <Field>
                <Button disabled={otp.length < 6 || loading} onClick={handleVerifyNewEmail}>
                  {loading ? "Confirming..." : "Confirm"}
                </Button>
              </Field>
              <div className="flex justify-center">
                <button
                  type="button"
                  className="text-muted-foreground text-sm underline underline-offset-2"
                  onClick={resetFlow}
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </FieldGroup>
      </CardContent>
    </Card>
  );
}
