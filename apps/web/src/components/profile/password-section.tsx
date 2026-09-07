import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod/v4";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { setServerError } from "@/lib/auth-errors";

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

export function PasswordSection({ currentEmail }: { currentEmail: string }) {
  const { data: accounts, isPending } = useQuery({
    queryKey: ["auth", "accounts"],
    queryFn: async () => {
      const { data, error } = await authClient.listAccounts();
      if (error) {
        throw new Error(error.message ?? "Failed to load connected accounts.");
      }
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  if (isPending) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">Loading...</p>
        </CardContent>
      </Card>
    );
  }

  if (accounts && !accounts.some((account) => account.providerId === "credential")) {
    return <SetPasswordCard currentEmail={currentEmail} />;
  }

  return <ChangePasswordCard />;
}

function SetPasswordCard({ currentEmail }: { currentEmail: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
        <CardDescription>
          You sign in with a connected account, so this account has no password yet.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <FieldDescription>
            Set one and you can sign in with your email address as well. We&apos;ll send a code to{" "}
            <strong>{currentEmail}</strong> to confirm it&apos;s you.
          </FieldDescription>
          <Field>
            <Button render={<Link to="/reset-password" search={{ email: currentEmail }} />}>
              Set a password
            </Button>
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}

function ChangePasswordCard() {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const form = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  async function onSubmit(values: PasswordValues) {
    setLoading(true);
    setSuccess(false);
    const result = await authClient
      .changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
        revokeOtherSessions: true,
      })
      .catch(() => null);
    setLoading(false);
    if (!result) {
      form.setError("root", { message: "Could not change the password. Please try again." });
      return;
    }
    const { error } = result;
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
        <CardDescription>Other signed-in devices will be signed out.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(event) => void form.handleSubmit(onSubmit)(event)} noValidate>
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
                    autoComplete="current-password"
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
                    autoComplete="new-password"
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
                    autoComplete="new-password"
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
              <FieldDescription className="text-success">Password updated.</FieldDescription>
            )}
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
