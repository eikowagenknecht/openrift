import { zodResolver } from "@hookform/resolvers/zod";
import { validateRiotId } from "@openrift/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod/v4";

import { SixDigitOtpInput } from "@/components/six-digit-otp-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { otpErrorMessage, requestOtpErrorMessage, setServerError } from "@/lib/auth-errors";
import { sessionQueryOptions } from "@/lib/auth-session";

const displayNameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required.")
    .max(50, "Name must be 50 characters or fewer.")
    .regex(
      /^[\p{L}\p{N} ._-]+$/u,
      "Name may only contain letters, digits, spaces, periods, underscores, and hyphens.",
    ),
});

type DisplayNameValues = z.infer<typeof displayNameSchema>;

export function AccountInfoSection({
  defaultName,
  defaultRiotId,
  userId,
  currentEmail,
}: {
  defaultName: string;
  defaultRiotId: string;
  userId: string;
  currentEmail: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Account Info</CardTitle>
        <CardDescription>Your name is what shows on shared lists.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <DisplayNameForm defaultName={defaultName} userId={userId} />
        <div className="border-t" />
        <RiotIdForm defaultRiotId={defaultRiotId} userId={userId} />
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
  // `useWatch` rather than `form.watch()`: the latter returns a function the
  // React Compiler flags as un-memoizable (IncompatibleLibrary), bailing on the
  // whole component. The hook form subscribes the same way without the bailout.
  const watchedName = useWatch({ control: form.control, name: "name" });

  async function onSubmit(values: DisplayNameValues) {
    setLoading(true);
    setSuccess(false);
    const result = await authClient.updateUser({ name: values.name.trim() }).catch(() => null);
    setLoading(false);
    if (!result) {
      form.setError("root", { message: "Could not save. Please try again." });
      return;
    }
    const { error } = result;
    if (error) {
      setServerError(form, error);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: sessionQueryOptions().queryKey });
    setSuccess(true);
  }

  return (
    <form key={userId} onSubmit={(event) => void form.handleSubmit(onSubmit)(event)} noValidate>
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
          <Button type="submit" disabled={loading || watchedName.trim() === defaultName}>
            {loading ? "Saving..." : "Save"}
          </Button>
        </Field>
        {success && <FieldDescription className="text-success">Name updated.</FieldDescription>}
      </FieldGroup>
    </form>
  );
}

// ── Riot ID ─────────────────────────────────────────────────────────────────

const riotIdSchema = z.object({
  riotId: z.string().superRefine((value, ctx) => {
    const result = validateRiotId(value);
    if (!result.ok) {
      ctx.addIssue({ code: "custom", message: result.reason });
    }
  }),
});

type RiotIdValues = z.infer<typeof riotIdSchema>;

function RiotIdForm({ defaultRiotId, userId }: { defaultRiotId: string; userId: string }) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const queryClient = useQueryClient();
  const form = useForm<RiotIdValues>({
    resolver: zodResolver(riotIdSchema),
    defaultValues: { riotId: defaultRiotId },
  });
  const watchedRiotId = useWatch({ control: form.control, name: "riotId" });

  async function onSubmit(values: RiotIdValues) {
    setLoading(true);
    setSuccess(false);
    // The server hook normalizes an empty string to null (clears the field).
    const result = await authClient.updateUser({ riotId: values.riotId.trim() }).catch(() => null);
    setLoading(false);
    if (!result) {
      form.setError("root", { message: "Could not save. Please try again." });
      return;
    }
    const { error } = result;
    if (error) {
      setServerError(form, error);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: sessionQueryOptions().queryKey });
    setSuccess(true);
  }

  return (
    <form key={userId} onSubmit={(event) => void form.handleSubmit(onSubmit)(event)} noValidate>
      <FieldGroup>
        {form.formState.errors.root && (
          <FieldError>{form.formState.errors.root.message}</FieldError>
        )}
        <Controller
          name="riotId"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={field.name}>Riot ID</FieldLabel>
              <Input
                {...field}
                id={field.name}
                type="text"
                placeholder="SummonerName#EUW"
                aria-invalid={fieldState.invalid}
              />
              <FieldDescription>Prefills your tournament deck submissions.</FieldDescription>
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Field>
          <Button type="submit" disabled={loading || watchedRiotId.trim() === defaultRiotId}>
            {loading ? "Saving..." : "Save"}
          </Button>
        </Field>
        {success && <FieldDescription className="text-success">Riot ID updated.</FieldDescription>}
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
    const result = await authClient.emailOtp
      .sendVerificationOtp({ email: currentEmail, type: "email-verification" })
      .catch(() => null);
    setLoading(false);
    if (!result) {
      setError("Could not send the code. Please try again.");
      return;
    }
    if (result.error) {
      setError(requestOtpErrorMessage(result.error));
      return;
    }
    setStep("verify-current");
  }

  async function handleVerifyCurrentEmail() {
    if (otp.length < 6) {
      return;
    }
    setLoading(true);
    setError("");
    const result = await authClient.emailOtp
      .requestEmailChange({ newEmail: newEmail.trim(), otp })
      .catch(() => null);
    setLoading(false);
    if (!result) {
      setError("Could not verify the code. Please try again.");
      return;
    }
    if (result.error) {
      setError(otpErrorMessage(result.error));
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
    const result = await authClient.emailOtp
      .changeEmail({ newEmail: newEmail.trim(), otp })
      .catch(() => null);
    setLoading(false);
    if (!result) {
      setError("Could not verify the code. Please try again.");
      return;
    }
    if (result.error) {
      setError(otpErrorMessage(result.error));
      return;
    }
    await queryClient.invalidateQueries({ queryKey: sessionQueryOptions().queryKey });
    setSuccess(true);
    setStep("input");
    setNewEmail("");
    setOtp("");
  }

  // Only the current-email step can resend. The new address's code is minted by
  // `requestEmailChange`, which needs a fresh current-email OTP, and that one
  // was consumed getting here, so that step offers Cancel instead.
  async function handleResend() {
    setResending(true);
    setError("");
    const result = await authClient.emailOtp
      .sendVerificationOtp({ email: currentEmail, type: "email-verification" })
      .catch(() => null);
    setResending(false);
    if (!result) {
      setError("Could not send the code. Please try again.");
      return;
    }
    if (result.error) {
      setError(requestOtpErrorMessage(result.error));
    }
  }

  return (
    <FieldGroup>
      <FieldLabel>
        Email <span className="text-muted-foreground font-normal">({currentEmail})</span>
      </FieldLabel>
      {error && <FieldError>{error}</FieldError>}
      {success && (
        <FieldDescription className="text-success">Email updated successfully.</FieldDescription>
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
            <Button
              disabled={loading || !newEmail.trim()}
              onClick={() => void handleSendToCurrentEmail()}
            >
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
            <SixDigitOtpInput value={otp} onChange={setOtp} />
          </div>
          <Field>
            <Button
              disabled={otp.length < 6 || loading}
              onClick={() => void handleVerifyCurrentEmail()}
            >
              {loading ? "Verifying..." : "Verify"}
            </Button>
          </Field>
          <div className="flex justify-center gap-4">
            <Button
              type="button"
              variant="link-muted"
              className="h-auto px-0 text-sm"
              disabled={resending}
              onClick={() => void handleResend()}
            >
              {resending ? "Sending..." : "Resend code"}
            </Button>
            <Button
              type="button"
              variant="link-muted"
              className="h-auto px-0 text-sm"
              onClick={resetFlow}
            >
              Cancel
            </Button>
          </div>
        </>
      )}

      {step === "verify-new" && (
        <>
          <p className="text-muted-foreground text-sm">
            Enter the 6-digit code sent to <strong>{newEmail.trim()}</strong>.
          </p>
          <div className="flex justify-center">
            <SixDigitOtpInput value={otp} onChange={setOtp} />
          </div>
          <Field>
            <Button
              disabled={otp.length < 6 || loading}
              onClick={() => void handleVerifyNewEmail()}
            >
              {loading ? "Confirming..." : "Confirm"}
            </Button>
          </Field>
          <div className="flex justify-center">
            <Button
              type="button"
              variant="link-muted"
              className="h-auto px-0 text-sm"
              onClick={resetFlow}
            >
              Cancel
            </Button>
          </div>
        </>
      )}
    </FieldGroup>
  );
}
