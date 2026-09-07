import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import type { Control } from "react-hook-form";
import { Controller, useForm, useFormState, useWatch } from "react-hook-form";
import { z } from "zod/v4";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { AuthFormCard, SocialAuthButtons } from "@/features/account/components/auth-form-shell";
import { signUp } from "@/features/account/lib/auth-client";
import { setServerError } from "@/lib/auth-errors";

const signUpSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required.")
    .max(50, "Name must be 50 characters or fewer.")
    .regex(
      /^[\p{L}\p{N} ._-]+$/u,
      "Name may only contain letters, digits, spaces, periods, underscores, and hyphens.",
    ),
  email: z.email("Please enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

type SignUpValues = z.infer<typeof signUpSchema>;

export function SignupForm({
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
  const [loading, setLoading] = useState(false);
  const form = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { name: "", email: initialEmail, password: "" },
  });

  async function onSubmit(values: SignUpValues) {
    setLoading(true);
    const result = await signUp.email(values).catch(() => null);
    setLoading(false);
    if (!result) {
      form.setError("root", { message: "Could not create the account. Please try again." });
      return;
    }
    const { error } = result;
    if (error) {
      setServerError(form, error);
      return;
    }
    void navigate({ to: "/verify-email", search: { email: values.email, redirect: redirectTo } });
  }

  return (
    <AuthFormCard
      className={className}
      title="Create an account"
      subtitle="Enter your details to get started"
      {...props}
    >
      <form onSubmit={(event) => void form.handleSubmit(onSubmit)(event)} noValidate>
        <FieldGroup>
          <RootFormError control={form.control} />
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
                  // oxlint-disable-next-line jsx-a11y/no-autofocus -- sign-up page's primary input
                  autoFocus
                />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />
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
                <FieldLabel htmlFor={field.name}>Password</FieldLabel>
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
              {loading ? "Signing up..." : "Sign up"}
            </Button>
          </Field>
        </FieldGroup>
      </form>
      <SocialAuthButtons redirectTo={redirectTo} />
      <FieldDescription className="text-center">
        Already have an account? <LoginLink control={form.control} redirectTo={redirectTo} />
      </FieldDescription>
    </AuthFormCard>
  );
}

function RootFormError({ control }: { control: Control<SignUpValues> }) {
  const { errors } = useFormState({ control });
  return errors.root ? <FieldError>{errors.root.message}</FieldError> : null;
}

/**
 * Isolated so the watch re-renders this link, not the whole card. Uses
 * `useWatch`, not `form.watch()`: the latter bails out the React Compiler.
 */
function LoginLink({
  control,
  redirectTo,
}: {
  control: Control<SignUpValues>;
  redirectTo?: string;
}) {
  const email = useWatch({ control, name: "email" });
  return (
    <Link to="/login" search={{ redirect: redirectTo, email: email || undefined }}>
      Sign in
    </Link>
  );
}
