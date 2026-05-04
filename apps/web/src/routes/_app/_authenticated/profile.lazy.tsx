import { createLazyFileRoute } from "@tanstack/react-router";

import { PageToc } from "@/components/layout/page-toc";
import type { PageTocItem } from "@/components/layout/page-toc";
import { AccountInfoSection } from "@/components/profile/account-info-section";
import { ConnectedAccountsSection } from "@/components/profile/connected-accounts-section";
import { DangerZoneSection } from "@/components/profile/danger-zone-section";
import { DisplaySection } from "@/components/profile/display-section";
import { LanguagesSection } from "@/components/profile/languages-section";
import { MarketplacesSection } from "@/components/profile/marketplaces-section";
import { PasswordSection } from "@/components/profile/password-section";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguageList } from "@/hooks/use-enums";
import { useSession } from "@/lib/auth-session";
import { useGravatarUrl } from "@/lib/gravatar";
import { getUserInitials } from "@/lib/user-initials";
import { PAGE_PADDING } from "@/lib/utils";

export const Route = createLazyFileRoute("/_app/_authenticated/profile")({
  component: ProfilePage,
});

const NAV_SECTIONS: PageTocItem[] = [
  { id: "preferences", label: "Preferences" },
  { id: "display", label: "Display", level: 1 },
  { id: "marketplaces", label: "Marketplaces", level: 1 },
  { id: "languages", label: "Languages", level: 1 },
  { id: "account", label: "Account" },
  { id: "security", label: "Security" },
  { id: "danger-zone", label: "Danger Zone" },
];

function ProfilePage() {
  const { data: session } = useSession();
  const languages = useLanguageList();
  const user = session?.user;
  const gravatarUrl = useGravatarUrl(user?.email);

  if (!user) {
    return null;
  }

  const initials = getUserInitials(user.name, user.email);

  const createdAt = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <div className={`flex justify-center ${PAGE_PADDING}`}>
      <div className="flex w-full max-w-3xl gap-6">
        <PageToc items={NAV_SECTIONS} />

        <div className="flex min-w-0 flex-1 flex-col gap-6">
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

          <section id="preferences" className="scroll-mt-16 space-y-6">
            <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
              Preferences
            </h2>
            <div id="display" className="scroll-mt-16">
              <DisplaySection />
            </div>
            <div id="marketplaces" className="scroll-mt-16">
              <MarketplacesSection />
            </div>
            <div id="languages" className="scroll-mt-16">
              <LanguagesSection availableLanguages={languages} />
            </div>
          </section>

          <section id="account" className="scroll-mt-16 space-y-6">
            <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
              Account
            </h2>
            <AccountInfoSection
              defaultName={user.name ?? ""}
              userId={user.id}
              currentEmail={user.email}
            />
            <ConnectedAccountsSection />
          </section>

          <section id="security" className="scroll-mt-16 space-y-6">
            <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
              Security
            </h2>
            <PasswordSection />
          </section>

          <section id="danger-zone" className="scroll-mt-16 space-y-6">
            <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
              Danger Zone
            </h2>
            <DangerZoneSection />
          </section>
        </div>
      </div>
    </div>
  );
}
