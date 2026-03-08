import { zodResolver } from "@hookform/resolvers/zod";
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
import { IS_PREVIEW } from "@/lib/api-base";
import { authClient, signUp } from "@/lib/auth-client";
import { setServerError } from "@/lib/auth-errors";
import { randomEmailPlaceholder } from "@/lib/placeholders";
import { cn } from "@/lib/utils";

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
  ...props
}: React.ComponentProps<"div"> & { redirectTo?: string; initialEmail?: string }) {
  const navigate = useNavigate();
  const [emailPlaceholder] = useState(randomEmailPlaceholder);
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
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="overflow-hidden p-0">
        <CardContent className="grid p-0 md:grid-cols-2">
          <form className="p-6 md:p-8" onSubmit={form.handleSubmit(onSubmit)} noValidate>
            <FieldGroup>
              <div className="flex flex-col items-center gap-2 text-center">
                <img src="/logo.webp" alt="OpenRift" className="size-12 md:hidden" />
                <h1 className="text-2xl font-bold">Create an account</h1>
                <p className="text-muted-foreground text-balance">
                  Enter your details to get started
                </p>
              </div>
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
            </FieldGroup>
          </form>
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
