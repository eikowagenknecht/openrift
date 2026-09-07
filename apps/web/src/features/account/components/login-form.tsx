import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import type { Control, UseFormReturn } from "react-hook-form";
import { Controller, useForm, useFormState, useWatch } from "react-hook-form";
import { z } from "zod/v4";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AuthFormCard, SocialAuthButtons } from "@/features/account/components/auth-form-shell";
import { SixDigitOtpInput } from "@/features/account/components/six-digit-otp-input";
import { authClient, signIn } from "@/features/account/lib/auth-client";
import { otpErrorMessage, requestOtpErrorMessage, setServerError } from "@/lib/auth-errors";
import { sessionQueryOptions } from "@/lib/auth-session";

const signInSchema = z.object({
  email: z.email("Please enter a valid email address."),
  password: z.string().min(1, "Password is required."),
});

type SignInValues = z.infer<typeof signInSchema>;

/**
 * useWatch/useFormState/Controller stay in leaf components below, never in
 * LoginForm: lifting one re-renders the whole card per keystroke.
 */
export function LoginForm({
  className,
  redirectTo,
  initialEmail = "",
  emailPlaceholder,
  ...props
}: React.ComponentProps<"div"> & {
  redirectTo?: string;
  initialEmail?: string;
  emailPlaceholder: string;
}) {
  const [method, setMethod] = useState<"password" | "otp">("password");

  const form = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: initialEmail, password: "" },
  });

  return (
    <AuthFormCard
      className={className}
      title="Welcome back"
      subtitle="Sign in to your OpenRift account"
      {...props}
    >
      <Tabs value={method} onValueChange={(v) => setMethod(v as "password" | "otp")}>
        <TabsList className="w-full">
          <TabsTrigger value="password">Password</TabsTrigger>
          <TabsTrigger value="otp">Email code</TabsTrigger>
        </TabsList>
        <TabsContent value="password" tabIndex={-1}>
          <PasswordSignIn
            form={form}
            redirectTo={redirectTo}
            emailPlaceholder={emailPlaceholder}
            autoFocusEmail={!initialEmail}
          />
        </TabsContent>
        <TabsContent value="otp" tabIndex={-1}>
          {/* BaseUI keeps inactive panels mounted; the key clears a half-finished code on return. */}
          <OtpSignIn
            key={method}
            form={form}
            redirectTo={redirectTo}
            emailPlaceholder={emailPlaceholder}
          />
        </TabsContent>
      </Tabs>
      <SocialAuthButtons redirectTo={redirectTo} />
      <FieldDescription className="text-center">
        Don&apos;t have an account? <SignupLink control={form.control} redirectTo={redirectTo} />
      </FieldDescription>
    </AuthFormCard>
  );
}

function PasswordSignIn({
  form,
  redirectTo,
  emailPlaceholder,
  autoFocusEmail,
}: {
  form: UseFormReturn<SignInValues>;
  redirectTo?: string;
  emailPlaceholder: string;
  autoFocusEmail: boolean;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [emailNotVerified, setEmailNotVerified] = useState(false);
  const [resending, setResending] = useState(false);

  async function onSubmit(values: SignInValues) {
    setLoading(true);
    setEmailNotVerified(false);
    const result = await signIn.email(values).catch(() => null);
    setLoading(false);
    if (!result) {
      form.setError("root", { message: "Could not sign in. Please try again." });
      return;
    }
    const { error } = result;
    if (error) {
      if (error.code === "EMAIL_NOT_VERIFIED") {
        setEmailNotVerified(true);
      }
      setServerError(form, error);
      return;
    }
    // Cache is keyed by the prior session's userId; invalidate so it re-keys to the new one.
    await queryClient.invalidateQueries({ queryKey: sessionQueryOptions().queryKey });
    void navigate({ to: (redirectTo as "/collections") ?? "/collections" });
  }

  async function handleResend() {
    const email = form.getValues("email").trim();
    setResending(true);
    // /login has no field for the 6-digit code sendVerificationEmail would mail; use the OTP flow instead.
    const result = await authClient.emailOtp
      .sendVerificationOtp({ email, type: "email-verification" })
      .catch(() => null);
    setResending(false);
    if (!result) {
      form.setError("root", { message: "Could not send the code. Please try again." });
      return;
    }
    if (result.error) {
      form.setError("root", { message: requestOtpErrorMessage(result.error) });
      return;
    }
    void navigate({ to: "/verify-email", search: { email, redirect: redirectTo } });
  }

  return (
    <form onSubmit={(event) => void form.handleSubmit(onSubmit)(event)} noValidate>
      <FieldGroup>
        <RootFormError control={form.control}>
          {emailNotVerified && (
            <Button
              type="button"
              variant="link-muted"
              className="ml-1 h-auto px-0 text-inherit hover:text-inherit"
              disabled={resending}
              onClick={() => void handleResend()}
            >
              {resending ? "Sending..." : "Send a verification code"}
            </Button>
          )}
        </RootFormError>
        <Controller
          name="email"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={field.name}>Email</FieldLabel>
              <Input
                {...field}
                id={field.name}
                type="email"
                autoComplete="email"
                placeholder={emailPlaceholder}
                aria-invalid={fieldState.invalid}
                // oxlint-disable-next-line jsx-a11y/no-autofocus -- login page's primary input; skipped when prefilled from URL
                autoFocus={autoFocusEmail}
              />
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Controller
          name="password"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              {/* Grid places the Forgot link visually in the label row, but renders it DOM-after the input so tab order is input → Forgot */}
              <div className="grid grid-cols-[1fr_auto] items-center gap-x-2">
                <FieldLabel htmlFor={field.name} className="col-start-1 row-start-1">
                  Password
                </FieldLabel>
                <Input
                  {...field}
                  id={field.name}
                  type="password"
                  autoComplete="current-password"
                  aria-invalid={fieldState.invalid}
                  className="col-span-2 row-start-2"
                />
                <ForgotPasswordLink
                  control={form.control}
                  className="text-muted-foreground col-start-2 row-start-1 justify-self-end text-sm underline-offset-2 hover:underline"
                />
              </div>
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
        <Field>
          <Button type="submit" disabled={loading}>
            {loading ? "Signing in..." : "Login"}
          </Button>
        </Field>
      </FieldGroup>
    </form>
  );
}

function OtpSignIn({
  form,
  redirectTo,
  emailPlaceholder,
}: {
  form: UseFormReturn<SignInValues>;
  redirectTo?: string;
  emailPlaceholder: string;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<"email" | "code">("email");
  const [otp, setOtp] = useState("");
  const [emailError, setEmailError] = useState("");
  const [otpError, setOtpError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSendOtp() {
    const email = form.getValues("email").trim();
    if (!email || !email.includes("@")) {
      setEmailError("Please enter a valid email address.");
      return;
    }
    setEmailError("");
    setLoading(true);
    const result = await authClient.emailOtp
      .sendVerificationOtp({ email, type: "sign-in" })
      .catch(() => null);
    setLoading(false);
    if (!result) {
      setEmailError("Could not send the code. Please try again.");
      return;
    }
    if (result.error) {
      setEmailError(requestOtpErrorMessage(result.error));
      return;
    }
    setStep("code");
  }

  async function handleVerifyOtp() {
    if (otp.length < 6) {
      return;
    }
    setLoading(true);
    setOtpError("");
    const result = await authClient.signIn
      .emailOtp({ email: form.getValues("email").trim(), otp })
      .catch(() => null);
    setLoading(false);
    if (!result) {
      setOtpError("Could not sign in. Please try again.");
      return;
    }
    if (result.error) {
      setOtpError(otpErrorMessage(result.error));
      return;
    }
    await queryClient.invalidateQueries({ queryKey: sessionQueryOptions().queryKey });
    void navigate({ to: (redirectTo as "/collections") ?? "/collections" });
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (step === "email") {
          void handleSendOtp();
        } else {
          void handleVerifyOtp();
        }
      }}
      noValidate
    >
      <FieldGroup>
        {step === "email" ? (
          <>
            {emailError && <FieldError>{emailError}</FieldError>}
            <Field>
              <FieldLabel htmlFor="otp-email">Email</FieldLabel>
              <Controller
                name="email"
                control={form.control}
                render={({ field }) => (
                  <Input
                    {...field}
                    id="otp-email"
                    type="email"
                    autoComplete="email"
                    placeholder={emailPlaceholder}
                    aria-invalid={Boolean(emailError)}
                    // oxlint-disable-next-line jsx-a11y/no-autofocus -- OTP tab's primary input; panel remounts on tab switch so autofocus fires
                    autoFocus
                  />
                )}
              />
            </Field>
            <Field>
              <Button type="submit" disabled={loading}>
                {loading ? "Sending..." : "Send code"}
              </Button>
            </Field>
          </>
        ) : (
          <>
            {otpError && <FieldError>{otpError}</FieldError>}
            <div className="flex justify-center">
              <SixDigitOtpInput autoFocusOnMount value={otp} onChange={setOtp} />
            </div>
            <Field>
              <Button type="submit" disabled={otp.length < 6 || loading}>
                {loading ? "Verifying..." : "Verify"}
              </Button>
            </Field>
            <Button
              type="button"
              variant="link-muted"
              disabled={loading}
              onClick={() => {
                setStep("email");
                setOtp("");
                setOtpError("");
              }}
            >
              Use a different email
            </Button>
          </>
        )}
      </FieldGroup>
    </form>
  );
}

function RootFormError({
  control,
  children,
}: {
  control: Control<SignInValues>;
  children?: React.ReactNode;
}) {
  const { errors } = useFormState({ control });
  if (!errors.root) {
    return null;
  }
  return (
    <FieldError>
      {errors.root.message}
      {children}
    </FieldError>
  );
}

function ForgotPasswordLink({
  control,
  className,
}: {
  control: Control<SignInValues>;
  className?: string;
}) {
  const email = useWatch({ control, name: "email" });
  return (
    <Link to="/reset-password" search={{ email }} className={className}>
      Forgot your password?
    </Link>
  );
}

function SignupLink({
  control,
  redirectTo,
}: {
  control: Control<SignInValues>;
  redirectTo?: string;
}) {
  const email = useWatch({ control, name: "email" });
  return (
    <Link to="/signup" search={{ redirect: redirectTo, email: email || undefined }}>
      Sign up
    </Link>
  );
}
