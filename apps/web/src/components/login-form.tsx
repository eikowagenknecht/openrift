import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { siDiscord, siGoogle } from "simple-icons";
import { z } from "zod/v4";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IS_PREVIEW } from "@/lib/api-base";
import { authClient, signIn } from "@/lib/auth-client";
import { setServerError } from "@/lib/auth-errors";
import { randomEmailPlaceholder } from "@/lib/placeholders";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

const signInSchema = z.object({
  email: z.email("Please enter a valid email address."),
  password: z.string().min(1, "Password is required."),
});

type SignInValues = z.infer<typeof signInSchema>;

export function LoginForm({
  className,
  redirectTo,
  initialEmail = "",
  ...props
}: React.ComponentProps<"div"> & { redirectTo?: string; initialEmail?: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [emailPlaceholder] = useState(randomEmailPlaceholder);
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
    void queryClient.invalidateQueries({ queryKey: queryKeys.admin.me });
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
    void queryClient.invalidateQueries({ queryKey: queryKeys.admin.me });
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
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="overflow-hidden p-0">
        <CardContent className="grid p-0 md:grid-cols-2">
          <div className="p-6 md:p-8">
            <FieldGroup>
              <div className="flex flex-col items-center gap-2 text-center">
                <img src="/logo.webp" alt="OpenRift" className="size-12 md:hidden" />
                <h1 className="text-2xl font-bold">Welcome back</h1>
                <p className="text-muted-foreground text-balance">
                  Sign in to your OpenRift account
                </p>
              </div>
              <Tabs value={method} onValueChange={(v) => handleTabChange(v as "password" | "otp")}>
                <TabsList className="w-full">
                  <TabsTrigger value="password">Password</TabsTrigger>
                  <TabsTrigger value="otp">Email code</TabsTrigger>
                </TabsList>
                <TabsContent value="password">
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
                            {/* oxlint-disable jsx-a11y/tabindex-no-positive -- intentional: enforce email → password → login → forgot-password tab order */}
                            <Input
                              {...field}
                              id={field.name}
                              tabIndex={1}
                              type="email"
                              placeholder={emailPlaceholder}
                              aria-invalid={fieldState.invalid}
                            />
                            {/* oxlint-enable jsx-a11y/tabindex-no-positive */}
                            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                          </Field>
                        )}
                      />
                      <Controller
                        name="password"
                        control={form.control}
                        render={({ field, fieldState }) => (
                          <Field data-invalid={fieldState.invalid}>
                            <div className="flex items-center justify-between">
                              <FieldLabel htmlFor={field.name}>Password</FieldLabel>
                              {/* oxlint-disable jsx-a11y/tabindex-no-positive -- intentional: tab after login button */}
                              <Link
                                to="/reset-password"
                                search={{ email: watchedEmail }}
                                tabIndex={4}
                                className="text-muted-foreground text-sm underline-offset-2 hover:underline"
                              >
                                Forgot your password?
                              </Link>
                              {/* oxlint-enable jsx-a11y/tabindex-no-positive */}
                            </div>
                            {/* oxlint-disable jsx-a11y/tabindex-no-positive -- intentional: enforce email → password → login → forgot-password tab order */}
                            <Input
                              {...field}
                              id={field.name}
                              tabIndex={2}
                              type="password"
                              aria-invalid={fieldState.invalid}
                            />
                            {/* oxlint-enable jsx-a11y/tabindex-no-positive */}
                            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                          </Field>
                        )}
                      />
                      <Field>
                        {/* oxlint-disable jsx-a11y/tabindex-no-positive -- intentional: enforce email → password → login → forgot-password tab order */}
                        <Button type="submit" tabIndex={3} disabled={loading}>
                          {loading ? "Signing in..." : "Login"}
                        </Button>
                        {/* oxlint-enable jsx-a11y/tabindex-no-positive */}
                      </Field>
                    </FieldGroup>
                  </form>
                </TabsContent>
                <TabsContent value="otp">
                  <FieldGroup>
                    {otpStep === "email" ? (
                      <>
                        {otpEmailError && <FieldError>{otpEmailError}</FieldError>}
                        <Field>
                          <FieldLabel htmlFor="otp-email">Email</FieldLabel>
                          <Input
                            id="otp-email"
                            type="email"
                            placeholder={emailPlaceholder}
                            value={otpEmail}
                            onChange={(e) => setOtpEmail(e.target.value)}
                            aria-invalid={Boolean(otpEmailError)}
                          />
                        </Field>
                        <Field>
                          <Button type="button" disabled={otpLoading} onClick={handleSendOtp}>
                            {otpLoading ? "Sending..." : "Send code"}
                          </Button>
                        </Field>
                      </>
                    ) : (
                      <>
                        {otpError && <FieldError>{otpError}</FieldError>}
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
                          <Button
                            type="button"
                            disabled={otp.length < 6 || otpLoading}
                            onClick={handleVerifyOtp}
                          >
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
                </TabsContent>
              </Tabs>
              {!IS_PREVIEW && (
                <>
                  <FieldSeparator className="*:data-[slot=field-separator-content]:bg-card">
                    Or continue with
                  </FieldSeparator>
                  <Field className="grid grid-cols-2 gap-4">
                    <Button
                      variant="outline"
                      type="button"
                      className="w-full"
                      onClick={() =>
                        authClient.signIn.social({
                          provider: "google",
                          callbackURL: redirectTo ?? "/",
                        })
                      }
                    >
                      <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
                        <path d={siGoogle.path} fill="currentColor" />
                      </svg>
                      Google
                    </Button>
                    <Button
                      variant="outline"
                      type="button"
                      className="w-full"
                      onClick={() =>
                        authClient.signIn.social({
                          provider: "discord",
                          callbackURL: redirectTo ?? "/",
                        })
                      }
                    >
                      <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
                        <path d={siDiscord.path} fill="currentColor" />
                      </svg>
                      Discord
                    </Button>
                  </Field>
                </>
              )}
              <FieldDescription className="text-center">
                Don&apos;t have an account?{" "}
                <Link
                  to="/signup"
                  search={{
                    redirect: redirectTo === "/" ? undefined : redirectTo,
                    email: currentEmail || undefined,
                  }}
                >
                  Sign up
                </Link>
              </FieldDescription>
            </FieldGroup>
          </div>
          <div className="bg-muted relative hidden md:block">
            <img
              src="/logo-gray.webp"
              alt="OpenRift"
              className="absolute inset-0 m-auto size-48 object-contain"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
