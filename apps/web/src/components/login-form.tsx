import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import type { Control, UseFormReturn } from "react-hook-form";
import { Controller, useForm, useFormState, useWatch } from "react-hook-form";
import { z } from "zod/v4";

import { AuthFormCard, SocialAuthButtons } from "@/components/auth-form-shell";
import { SixDigitOtpInput } from "@/components/six-digit-otp-input";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { authClient, signIn } from "@/lib/auth-client";
import { otpErrorMessage, requestOtpErrorMessage, setServerError } from "@/lib/auth-errors";
import { sessionQueryOptions } from "@/lib/auth-session";

const signInSchema = z.object({
  email: z.email("Please enter a valid email address."),
  password: z.string().min(1, "Password is required."),
});

type SignInValues = z.infer<typeof signInSchema>;

/**
 * Both tabs share one react-hook-form instance, so the email carries across a
 * tab switch without any copying, and `LoginForm` itself subscribes to nothing.
 *
 * Every `useWatch` / `useFormState` / `Controller` below sits in a leaf that
 * renders only what depends on the value. Keeping any of them in `LoginForm`
 * re-rendered the whole card on every keystroke: both tab panels, the social
 * buttons, and two router links whose `search` object was rebuilt per character.
 * On iOS that showed up as the email input flickering while typing.
 *
 * Those hooks rather than `form.watch()` / `form.formState`: the former returns
 * a function the React Compiler flags as un-memoizable (IncompatibleLibrary),
 * bailing on the whole component, and the latter is a proxy whose reads
 * subscribe wherever they happen.
 *
 * @returns The login card with password and email-code sign-in tabs.
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
          {/* BaseUI keeps inactive panels mounted, so the key is what clears a
              half-finished code when the user leaves and comes back. Its email
              lives in the shared form, so that part survives the remount. */}
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

/**
 * @returns The password sign-in form.
 */
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
    const { error } = await signIn.email(values);
    setLoading(false);
    if (error) {
      if (error.code === "EMAIL_NOT_VERIFIED") {
        setEmailNotVerified(true);
      }
      setServerError(form, error);
      return;
    }
    // Refetch the session: better-auth set the cookie, but our React Query
    // cache for ["session"] still holds the prior value. User-scoped queries
    // are keyed by userId, so once the new session lands every consumer
    // attaches to the new user's data automatically.
    await queryClient.invalidateQueries({ queryKey: sessionQueryOptions().queryKey });
    void navigate({ to: (redirectTo as "/collections") ?? "/collections" });
  }

  async function handleResend() {
    const email = form.getValues("email").trim();
    setResending(true);
    // `sendVerificationEmail` would mail a 6-digit code (the emailOTP plugin
    // runs with `overrideDefaultEmailVerification`), and /login has no field to
    // type one into. Send the code and hand the user to the page that does.
    const result = await authClient.emailOtp.sendVerificationOtp({
      email,
      type: "email-verification",
    });
    setResending(false);
    if (result.error) {
      form.setError("root", { message: requestOtpErrorMessage(result.error) });
      return;
    }
    void navigate({ to: "/verify-email", search: { email, redirect: redirectTo } });
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <FieldGroup>
        <RootFormError control={form.control}>
          {emailNotVerified && (
            <Button
              type="button"
              variant="link-muted"
              // text-inherit keeps the link in the FieldError's color so it
              // reads as part of the error sentence.
              className="ml-1 h-auto px-0 text-inherit hover:text-inherit"
              disabled={resending}
              onClick={handleResend}
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

/**
 * @returns The email-code sign-in form: request a code, then verify it.
 */
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
    const result = await authClient.emailOtp.sendVerificationOtp({ email, type: "sign-in" });
    setLoading(false);
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
    const result = await authClient.signIn.emailOtp({
      email: form.getValues("email").trim(),
      otp,
    });
    setLoading(false);
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
          handleSendOtp();
        } else {
          handleVerifyOtp();
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

/**
 * @returns The form-level server error, or null when there is none.
 */
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

/**
 * @returns A reset-password link carrying the email typed so far.
 */
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

/**
 * @returns A sign-up link carrying the email typed so far.
 */
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
