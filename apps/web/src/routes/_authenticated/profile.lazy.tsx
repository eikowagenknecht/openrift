import { zodResolver } from "@hookform/resolvers/zod";
import { createLazyFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { siDiscord, siGoogle } from "simple-icons";
import { z } from "zod/v4";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { authClient, useSession } from "@/lib/auth-client";
import { setServerError } from "@/lib/auth-errors";
import { useGravatarUrl } from "@/lib/gravatar";

export const Route = createLazyFileRoute("/_authenticated/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const { data: session } = useSession();
  const user = session?.user;
  const gravatarUrl = useGravatarUrl(user?.email);

  if (!user) {
    return null;
  }

  const initials = (user.name ?? user.email ?? "?")
    .split(/[\s@]/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");

  const createdAt = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <div className="flex justify-center">
      <div className="flex w-full max-w-2xl flex-col gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center gap-4">
            <Avatar size="lg">
              {gravatarUrl && <AvatarImage src={gravatarUrl} alt={user.name ?? user.email} />}
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col gap-0.5">
              <CardTitle className="text-xl">{user.name || user.email}</CardTitle>
              <CardDescription>{user.email}</CardDescription>
              {createdAt && <p className="text-xs text-muted-foreground">Joined {createdAt}</p>}
            </div>
          </CardHeader>
        </Card>

        <DisplayNameSection defaultName={user.name ?? ""} userId={user.id} />
        <EmailSection currentEmail={user.email} />
        <PasswordSection />
        <ConnectedAccountsSection />
        <DangerZoneSection />
      </div>
    </div>
  );
}

// --- Display Name ---

const displayNameSchema = z.object({
  name: z.string().min(1, "Name is required."),
});

type DisplayNameValues = z.infer<typeof displayNameSchema>;

function DisplayNameSection({ defaultName, userId }: { defaultName: string; userId: string }) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
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
    setSuccess(true);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Display Name</CardTitle>
        <CardDescription>This is how your name appears across the site.</CardDescription>
      </CardHeader>
      <CardContent>
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
            {success && (
              <FieldDescription className="text-emerald-600">Name updated.</FieldDescription>
            )}
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

// --- Email ---

function EmailSection({ currentEmail }: { currentEmail: string }) {
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
          Your current email is <span className="font-medium text-foreground">{currentEmail}</span>.
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

// --- Password ---

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required."),
    newPassword: z.string().min(8, "New password must be at least 8 characters."),
    confirmPassword: z.string().min(1, "Please confirm your new password."),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

type PasswordValues = z.infer<typeof passwordSchema>;

function PasswordSection() {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const form = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  async function onSubmit(values: PasswordValues) {
    setLoading(true);
    setSuccess(false);
    const { error } = await authClient.changePassword({
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
      revokeOtherSessions: true,
    });
    setLoading(false);
    if (error) {
      setServerError(form, error);
      return;
    }
    setSuccess(true);
    form.reset();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
        <CardDescription>
          Update your password. You&apos;ll be signed out of other sessions.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            {form.formState.errors.root && (
              <FieldError>{form.formState.errors.root.message}</FieldError>
            )}
            <Controller
              name="currentPassword"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>Current password</FieldLabel>
                  <Input
                    {...field}
                    id={field.name}
                    type="password"
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
            <Controller
              name="newPassword"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>New password</FieldLabel>
                  <Input
                    {...field}
                    id={field.name}
                    type="password"
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
            <Controller
              name="confirmPassword"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>Confirm new password</FieldLabel>
                  <Input
                    {...field}
                    id={field.name}
                    type="password"
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
            <Field>
              <Button type="submit" disabled={loading}>
                {loading ? "Updating..." : "Update password"}
              </Button>
            </Field>
            {success && (
              <FieldDescription className="text-emerald-600">Password updated.</FieldDescription>
            )}
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

// --- Connected Accounts ---

const SOCIAL_PROVIDERS = [
  { id: "google", name: "Google", icon: siGoogle },
  { id: "discord", name: "Discord", icon: siDiscord },
] as const;

function ConnectedAccountsSection() {
  const [accounts, setAccounts] = useState<{ providerId: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAccounts() {
      const { data, error: fetchError } = await authClient.listAccounts();
      if (fetchError) {
        setError(fetchError.message ?? "Failed to load connected accounts.");
      } else {
        setAccounts(data ?? []);
      }
      setLoading(false);
    }
    fetchAccounts();
  }, []);

  async function handleLink(provider: string) {
    setActionLoading(provider);
    setError(null);
    await authClient.linkSocial({
      provider: provider as "google" | "discord",
      callbackURL: "/profile",
    });
  }

  async function handleUnlink(providerId: string) {
    setActionLoading(providerId);
    setError(null);
    const { error: unlinkError } = await authClient.unlinkAccount({ providerId });
    setActionLoading(null);
    if (unlinkError) {
      setError(unlinkError.message ?? "Failed to unlink account.");
      return;
    }
    setAccounts((prev) => prev.filter((a) => a.providerId !== providerId));
  }

  const linkedProviderIds = new Set(accounts.map((a) => a.providerId));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connected Accounts</CardTitle>
        <CardDescription>Link your social accounts for faster sign-in.</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : (
          <div className="grid gap-3">
            {error && <p className="text-sm text-destructive">{error}</p>}
            {SOCIAL_PROVIDERS.map((provider) => {
              const isLinked = linkedProviderIds.has(provider.id);
              const isOnlyAccount = accounts.length <= 1;
              return (
                <div
                  key={provider.id}
                  className="flex items-center justify-between rounded-md border p-3"
                >
                  <div className="flex items-center gap-3">
                    <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
                      <path d={provider.icon.path} fill="currentColor" />
                    </svg>
                    <span className="text-sm font-medium">{provider.name}</span>
                  </div>
                  {isLinked ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isOnlyAccount || actionLoading === provider.id}
                      onClick={() => handleUnlink(provider.id)}
                      title={
                        isOnlyAccount ? "You must have at least one linked account" : undefined
                      }
                    >
                      {actionLoading === provider.id ? "Unlinking..." : "Unlink"}
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={actionLoading === provider.id}
                      onClick={() => handleLink(provider.id)}
                    >
                      {actionLoading === provider.id ? "Connecting..." : "Connect"}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// --- Danger Zone ---

function DangerZoneSection() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!password) {
      setError("Password is required.");
      return;
    }
    setLoading(true);
    setError(null);
    const { error: deleteError } = await authClient.deleteUser({ password });
    setLoading(false);
    if (deleteError) {
      setError(deleteError.message ?? "Failed to delete account.");
      return;
    }
    globalThis.location.href = "/";
  }

  return (
    <Card className="border-destructive/50">
      <CardHeader>
        <CardTitle>Danger Zone</CardTitle>
        <CardDescription>
          Permanently delete your account and all associated data. This action cannot be undone.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AlertDialog
          open={open}
          onOpenChange={(nextOpen) => {
            setOpen(nextOpen);
            if (!nextOpen) {
              setPassword("");
              setError(null);
            }
          }}
        >
          <AlertDialogTrigger render={<Button variant="destructive">Delete account</Button>} />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete your account?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete your account and all your data. Enter your password to
                confirm.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="grid gap-2">
              <Input
                type="password"
                placeholder="Your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={Boolean(error)}
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <Button variant="destructive" disabled={loading} onClick={handleDelete}>
                {loading ? "Deleting..." : "Delete account"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
