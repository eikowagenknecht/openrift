import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod/v4";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { setServerError } from "@/lib/auth-errors";

const displayNameSchema = z.object({
  name: z.string().min(1, "Name is required."),
});

type DisplayNameValues = z.infer<typeof displayNameSchema>;

export function DisplayNameSection({
  defaultName,
  userId,
}: {
  defaultName: string;
  userId: string;
}) {
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
