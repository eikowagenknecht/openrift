import { createLazyFileRoute } from "@tanstack/react-router";

import { MyDeckCheckKeysSection } from "@/components/deck-check/deck-check-keys-section";
import type { PageTocItem } from "@/components/layout/page-toc";
import { SettingsGroup } from "@/components/layout/settings-group";
import { SettingsLayout } from "@/components/layout/settings-layout";
import { AccountInfoSection } from "@/components/profile/account-info-section";
import { ConnectedAccountsSection } from "@/components/profile/connected-accounts-section";
import { ContactMethodsSection } from "@/components/profile/contact-methods-section";
import { DangerZoneSection } from "@/components/profile/danger-zone-section";
import { DisplaySection } from "@/components/profile/display-section";
import { LanguagesSection } from "@/components/profile/languages-section";
import { MarketplacesSection } from "@/components/profile/marketplaces-section";
import { PasswordSection } from "@/components/profile/password-section";
import { PublicSharingSection } from "@/components/profile/public-sharing-section";
import { TradingSection } from "@/components/profile/trading-section";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UserAvatar } from "@/components/user-avatar";
import { useLanguageList } from "@/hooks/use-enums";
import { useSession } from "@/lib/auth-session";
import { formatAbsoluteDate } from "@/lib/format-date";
import { useGravatarHash } from "@/lib/gravatar";
import { cn, PAGE_PADDING } from "@/lib/utils";

export const Route = createLazyFileRoute("/_app/_authenticated/profile")({
  component: ProfilePage,
});

const NAV_SECTIONS: PageTocItem[] = [
  { id: "preferences", label: "Preferences" },
  { id: "display", label: "Display", level: 1 },
  { id: "marketplaces", label: "Marketplaces", level: 1 },
  { id: "languages", label: "Languages", level: 1 },
  { id: "trading", label: "Trading", level: 1 },
  { id: "contacts", label: "Trade contacts", level: 1 },
  { id: "sharing", label: "Public sharing" },
  { id: "integrations", label: "Integrations" },
  { id: "account", label: "Account" },
  { id: "security", label: "Security" },
  { id: "danger-zone", label: "Danger Zone" },
];

function ProfilePage() {
  const { data: session } = useSession();
  const languages = useLanguageList();
  const user = session?.user;
  const gravatarHash = useGravatarHash(user?.email);

  if (!user) {
    return null;
  }

  const createdAt = user.createdAt
    ? formatAbsoluteDate(user.createdAt, { year: "numeric", month: "long", day: "numeric" })
    : null;

  return (
    <div className={cn("flex justify-center", PAGE_PADDING)}>
      <SettingsLayout toc={NAV_SECTIONS} className="max-w-4xl">
        <Card>
          <CardHeader className="flex flex-row items-center gap-4">
            <UserAvatar
              image={user.image}
              name={user.name}
              email={user.email}
              gravatarHash={gravatarHash}
              size="lg"
            />
            <div className="flex flex-col gap-0.5">
              <CardTitle>{user.name || user.email}</CardTitle>
              <CardDescription>{user.email}</CardDescription>
              {createdAt && <p className="text-muted-foreground text-xs">Joined {createdAt}</p>}
            </div>
          </CardHeader>
        </Card>

        <SettingsGroup id="preferences" title="Preferences">
          <div id="display" className="scroll-mt-16">
            <DisplaySection />
          </div>
          <div id="marketplaces" className="scroll-mt-16">
            <MarketplacesSection />
          </div>
          <div id="languages" className="scroll-mt-16">
            <LanguagesSection availableLanguages={languages} />
          </div>
          <div id="trading" className="scroll-mt-16">
            <TradingSection />
          </div>
          <div id="contacts" className="scroll-mt-16">
            <ContactMethodsSection />
          </div>
        </SettingsGroup>

        <SettingsGroup id="sharing" title="Public sharing">
          <PublicSharingSection />
        </SettingsGroup>

        <SettingsGroup id="integrations" title="Integrations">
          <MyDeckCheckKeysSection />
        </SettingsGroup>

        <SettingsGroup id="account" title="Account">
          <AccountInfoSection
            defaultName={user.name ?? ""}
            defaultRiotId={user.riotId ?? ""}
            userId={user.id}
            currentEmail={user.email}
          />
          <ConnectedAccountsSection />
        </SettingsGroup>

        <SettingsGroup id="security" title="Security">
          <PasswordSection />
        </SettingsGroup>

        <SettingsGroup id="danger-zone" title="Danger Zone">
          <DangerZoneSection />
        </SettingsGroup>
      </SettingsLayout>
    </div>
  );
}
