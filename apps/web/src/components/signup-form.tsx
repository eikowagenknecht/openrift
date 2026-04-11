import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod/v4";

import { AuthFormCard, SocialAuthButtons } from "@/components/auth-form-shell";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { signUp } from "@/lib/auth-client";
import { setServerError } from "@/lib/auth-errors";

const signUpSchema = z.object({
  name: z.string().min(1, "Name is required."),
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
    const { error } = await signUp.email(values);
    setLoading(false);
    if (error) {
      setServerError(form, error);
      return;
    }
    void navigate({ to: "/verify-email", search: { email: values.email } });
  }

  return (
    <AuthFormCard
      className={className}
      title="Create an account"
      subtitle="Enter your details to get started"
      {...props}
    >
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
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
        Already have an account?{" "}
        <Link
          to="/login"
          search={{
            redirect: redirectTo === "/" ? undefined : redirectTo,
            email: form.getValues("email") || undefined,
          }}
        >
          Sign in
        </Link>
      </FieldDescription>
    </AuthFormCard>
  );
}
