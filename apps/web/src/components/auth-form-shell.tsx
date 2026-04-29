import { siDiscord, siGoogle } from "simple-icons";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldGroup, FieldSeparator } from "@/components/ui/field";
import { isPreview } from "@/lib/api-base";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

export function AuthFormCard({
  className,
  title,
  subtitle,
  children,
  ...props
}: React.ComponentProps<"div"> & { title: string; subtitle: string }) {
  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="overflow-hidden p-0">
        <CardContent className="grid p-0 md:grid-cols-2">
          <div className="p-6 md:p-8">
            <FieldGroup>
              <div className="flex flex-col items-center gap-2 text-center">
                <img src="/logo-color.svg" alt="OpenRift" className="size-12 md:hidden" />
                <h1 className="text-2xl font-bold">{title}</h1>
                <p className="text-muted-foreground text-balance">{subtitle}</p>
              </div>
              {children}
            </FieldGroup>
          </div>
          <div className="bg-muted relative hidden md:block">
            <img
              src="/logo-gray.svg"
              alt="OpenRift"
              className="absolute inset-0 m-auto size-48 object-contain"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function SocialAuthButtons({ redirectTo }: { redirectTo?: string }) {
  if (isPreview()) {
    return null;
  }
  return (
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
  );
}
