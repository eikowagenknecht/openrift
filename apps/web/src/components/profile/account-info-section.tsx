import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod/v4";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { authClient } from "@/lib/auth-client";
import { setServerError } from "@/lib/auth-errors";
import { sessionQueryOptions } from "@/lib/auth-session";

const displayNameSchema = z.object({
  name: z.string().min(1, "Name is required."),
});

type DisplayNameValues = z.infer<typeof displayNameSchema>;

export function AccountInfoSection({
  defaultName,
  userId,
  currentEmail,
}: {
  defaultName: string;
  userId: string;
  currentEmail: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Account Info</CardTitle>
        <CardDescription>Your name and email address.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <DisplayNameForm defaultName={defaultName} userId={userId} />
        <div className="border-t" />
        <EmailForm currentEmail={currentEmail} />
      </CardContent>
    </Card>
  );
}

// ── Display Name ────────────────────────────────────────────────────────────

function DisplayNameForm({ defaultName, userId }: { defaultName: string; userId: string }) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const queryClient = useQueryClient();
  const form = useForm<DisplayNameValues>({
    resolver: zodResolver(displayNameSchema),
    defaultValues: { name: defaultName },
  });

  async function onSubmit(values: DisplayNameValues) {
    setLoading(true);
    setSuccess(false);
    const { error } = await authClient.updateUser({ name: values.name.trim() });
    setLoading(false);
    if (error) {
      setServerError(form, error);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: sessionQueryOptions().queryKey });
    setSuccess(true);
  }

  return (
    <form key={userId} onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <FieldGroup>
        {form.formState.errors.root && (
          <FieldError>{form.formState.errors.root.message}</FieldError>
        )}
        <Controller
          name="name"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={field.name}>Name</FieldLabel>
              <Input
                {...field}
                id={field.name}
                type="text"
                placeholder="Your name"
                aria-invalid={fieldState.invalid}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Field>
          <Button type="submit" disabled={loading || form.watch("name").trim() === defaultName}>
            {loading ? "Saving..." : "Save"}
          </Button>
        </Field>
        {success && <FieldDescription className="text-emerald-600">Name updated.</FieldDescription>}
      </FieldGroup>
    </form>
  );
}

// ── Email ───────────────────────────────────────────────────────────────────

function EmailForm({ currentEmail }: { currentEmail: string }) {
  const [step, setStep] = useState<"input" | "verify-current" | "verify-new">("input");
  const [newEmail, setNewEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [success, setSuccess] = useState(false);
  const queryClient = useQueryClient();

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
    await queryClient.invalidateQueries({ queryKey: sessionQueryOptions().queryKey });
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
    <FieldGroup>
      <FieldLabel>
        Email <span className="text-muted-foreground font-normal">({currentEmail})</span>
      </FieldLabel>
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
              autoComplete="email"
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
  );
}
