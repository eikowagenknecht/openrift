import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod/v4";

import { AuthFormCard, SocialAuthButtons } from "@/components/auth-form-shell";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { clearUserScopedCache } from "@/lib/auth-cache";
import { authClient, signIn } from "@/lib/auth-client";
import { setServerError } from "@/lib/auth-errors";

const signInSchema = z.object({
  email: z.email("Please enter a valid email address."),
  password: z.string().min(1, "Password is required."),
});

type SignInValues = z.infer<typeof signInSchema>;

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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [method, setMethod] = useState<"password" | "otp">("password");
  const [loading, setLoading] = useState(false);
  const [emailNotVerified, setEmailNotVerified] = useState(false);
  const [resending, setResending] = useState(false);

  // Password form
  const form = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: initialEmail, password: "" },
  });

  const watchedEmail = form.watch("email");

  // OTP state
  const [otpEmail, setOtpEmail] = useState(initialEmail);
  const [otpEmailError, setOtpEmailError] = useState("");
  const [otpStep, setOtpStep] = useState<"email" | "code">("email");
  const [otp, setOtp] = useState("");
  const [otpError, setOtpError] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);

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
    await clearUserScopedCache(queryClient);
    void navigate({ to: (redirectTo as "/") ?? "/" });
  }

  async function handleResend() {
    setResending(true);
    await authClient.sendVerificationEmail({
      email: form.getValues("email"),
      callbackURL: "/",
    });
    setResending(false);
  }

  async function handleSendOtp() {
    const email = otpEmail.trim();
    if (!email || !email.includes("@")) {
      setOtpEmailError("Please enter a valid email address.");
      return;
    }
    setOtpEmailError("");
    setOtpLoading(true);
    await authClient.emailOtp.sendVerificationOtp({ email, type: "sign-in" });
    setOtpLoading(false);
    setOtpStep("code");
  }

  async function handleVerifyOtp() {
    if (otp.length < 6) {
      return;
    }
    setOtpLoading(true);
    setOtpError("");
    const result = await authClient.signIn.emailOtp({ email: otpEmail.trim(), otp });
    setOtpLoading(false);
    if (result.error) {
      if (result.error.code === "OTP_EXPIRED") {
        setOtpError("Code expired. Please request a new one.");
      } else if (result.error.code === "INVALID_OTP") {
        setOtpError("Incorrect code. Please try again.");
      } else if (result.error.code === "TOO_MANY_ATTEMPTS") {
        setOtpError("Too many attempts. Please request a new code.");
      } else {
        setOtpError(result.error.message ?? "Something went wrong. Please try again.");
      }
      return;
    }
    await clearUserScopedCache(queryClient);
    void navigate({ to: (redirectTo as "/") ?? "/" });
  }

  function handleTabChange(value: "password" | "otp") {
    if (value === method) {
      return;
    }
    if (value === "otp") {
      setOtpEmail(form.getValues("email"));
    } else {
      form.setValue("email", otpEmail);
    }
    setMethod(value);
    setOtpStep("email");
    setOtp("");
    setOtpError("");
    setOtpEmailError("");
  }

  const currentEmail = method === "password" ? watchedEmail : otpEmail;

  return (
    <AuthFormCard
      className={className}
      title="Welcome back"
      subtitle="Sign in to your OpenRift account"
      {...props}
    >
      <Tabs value={method} onValueChange={(v) => handleTabChange(v as "password" | "otp")}>
        <TabsList className="w-full">
          <TabsTrigger value="password">Password</TabsTrigger>
          <TabsTrigger value="otp">Email code</TabsTrigger>
        </TabsList>
        <TabsContent value="password" tabIndex={-1}>
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
            <FieldGroup>
              {form.formState.errors.root && (
                <FieldError>
                  {form.formState.errors.root.message}
                  {emailNotVerified && (
                    <button
                      type="button"
                      className="ml-1 underline underline-offset-2"
                      disabled={resending}
                      onClick={handleResend}
                    >
                      {resending ? "Sending..." : "Resend verification email"}
                    </button>
                  )}
                </FieldError>
              )}
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
                      autoFocus={!initialEmail}
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
                      <Link
                        to="/reset-password"
                        search={{ email: watchedEmail }}
                        className="text-muted-foreground col-start-2 row-start-1 justify-self-end text-sm underline-offset-2 hover:underline"
                      >
                        Forgot your password?
                      </Link>
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
        </TabsContent>
        <TabsContent value="otp" tabIndex={-1}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (otpStep === "email") {
                handleSendOtp();
              } else {
                handleVerifyOtp();
              }
            }}
            noValidate
          >
            <FieldGroup>
              {otpStep === "email" ? (
                <>
                  {otpEmailError && <FieldError>{otpEmailError}</FieldError>}
                  <Field>
                    <FieldLabel htmlFor="otp-email">Email</FieldLabel>
                    <Input
                      id="otp-email"
                      type="email"
                      autoComplete="email"
                      placeholder={emailPlaceholder}
                      value={otpEmail}
                      onChange={(e) => setOtpEmail(e.target.value)}
                      aria-invalid={Boolean(otpEmailError)}
                      // oxlint-disable-next-line jsx-a11y/no-autofocus -- OTP tab's primary input; panel remounts on tab switch so autofocus fires
                      autoFocus
                    />
                  </Field>
                  <Field>
                    <Button type="submit" disabled={otpLoading}>
                      {otpLoading ? "Sending..." : "Send code"}
                    </Button>
                  </Field>
                </>
              ) : (
                <>
                  {otpError && <FieldError>{otpError}</FieldError>}
                  <div className="flex justify-center">
                    {/* oxlint-disable-next-line jsx-a11y/no-autofocus -- input appears after user clicks "Send code"; focusing avoids a redundant click */}
                    <InputOTP autoFocus maxLength={6} value={otp} onChange={setOtp}>
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
                    <Button type="submit" disabled={otp.length < 6 || otpLoading}>
                      {otpLoading ? "Verifying..." : "Verify"}
                    </Button>
                  </Field>
                  <button
                    type="button"
                    className="text-muted-foreground text-center text-sm underline underline-offset-2"
                    disabled={otpLoading}
                    onClick={() => {
                      setOtpStep("email");
                      setOtp("");
                      setOtpError("");
                    }}
                  >
                    Use a different email
                  </button>
                </>
              )}
            </FieldGroup>
          </form>
        </TabsContent>
      </Tabs>
      <SocialAuthButtons redirectTo={redirectTo} />
      <FieldDescription className="text-center">
        Don&apos;t have an account?{" "}
        <Link to="/signup" search={{ email: currentEmail || undefined }}>
          Sign up
        </Link>
      </FieldDescription>
    </AuthFormCard>
  );
}
