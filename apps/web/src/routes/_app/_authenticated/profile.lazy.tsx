import { createLazyFileRoute } from "@tanstack/react-router";

import { ConnectedAccountsSection } from "@/components/profile/connected-accounts-section";
import { DangerZoneSection } from "@/components/profile/danger-zone-section";
import { DisplayNameSection } from "@/components/profile/display-name-section";
import { EmailSection } from "@/components/profile/email-section";
import { PasswordSection } from "@/components/profile/password-section";
import { PreferencesSection } from "@/components/profile/preferences-section";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useCards } from "@/hooks/use-cards";
import { useSession } from "@/lib/auth-client";
import { useGravatarUrl } from "@/lib/gravatar";
import { PAGE_PADDING } from "@/lib/utils";

export const Route = createLazyFileRoute("/_app/_authenticated/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const { data: session } = useSession();
  const { languages } = useCards();
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
    <div className={`flex justify-center ${PAGE_PADDING}`}>
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
              {createdAt && <p className="text-muted-foreground text-xs">Joined {createdAt}</p>}
            </div>
          </CardHeader>
        </Card>

        <DisplayNameSection defaultName={user.name ?? ""} userId={user.id} />
        <EmailSection currentEmail={user.email} />
        <PasswordSection />
        <PreferencesSection availableLanguages={languages} />
        <ConnectedAccountsSection />
        <DangerZoneSection />
      </div>
    </div>
  );
}
