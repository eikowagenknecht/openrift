import { formatDay } from "@openrift/shared/format-date";
import { createLazyFileRoute } from "@tanstack/react-router";

import type { PageTocItem } from "@/components/layout/page-toc";
import { SettingsGroup } from "@/components/layout/settings-group";
import { SettingsLayout } from "@/components/layout/settings-layout";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UserAvatar } from "@/components/user-avatar";
import { AccountInfoSection } from "@/features/account/components/account-info-section";
import { AdminNotificationsSection } from "@/features/account/components/admin-notifications-section";
import { ConnectedAccountsSection } from "@/features/account/components/connected-accounts-section";
import { ContactMethodsSection } from "@/features/account/components/contact-methods-section";
import { DangerZoneSection } from "@/features/account/components/danger-zone-section";
import { DisplaySection } from "@/features/account/components/display-section";
import { GroupNotificationsSection } from "@/features/account/components/group-notifications-section";
import { LanguagesSection } from "@/features/account/components/languages-section";
import { MarketplacesSection } from "@/features/account/components/marketplaces-section";
import { MetaCreditSection } from "@/features/account/components/meta-credit-section";
import { PasswordSection } from "@/features/account/components/password-section";
import { PublicSharingSection } from "@/features/account/components/public-sharing-section";
import { TradingSection } from "@/features/account/components/trading-section";
import { useIsAdmin } from "@/features/admin/hooks/use-admin";
import { MyDeckCheckKeysSection } from "@/features/tournaments/components/deck-check-keys-section";
import { useLanguageList } from "@/hooks/use-enums";
import { useSession } from "@/lib/auth-session";
import { useGravatarHash } from "@/lib/gravatar";
import { cn, PAGE_PADDING, PAGE_WIDTH } from "@/lib/utils";

export const Route = createLazyFileRoute("/_app/_authenticated/profile")({
  component: ProfilePage,
});

const NAV_SECTIONS: PageTocItem[] = [
  { id: "sharing", label: "Public sharing" },
  { id: "preferences", label: "Preferences" },
  { id: "display", label: "Display", level: 1 },
  { id: "marketplaces", label: "Marketplaces", level: 1 },
  { id: "languages", label: "Languages", level: 1 },
  { id: "trading", label: "Trading", level: 1 },
  { id: "contacts", label: "Trade contacts", level: 1 },
  { id: "groups", label: "Groups", level: 1 },
  { id: "integrations", label: "Integrations" },
  { id: "account", label: "Account" },
  { id: "security", label: "Security" },
  { id: "danger-zone", label: "Danger Zone" },
];

/** The admin group sits after Integrations, so the entry goes at that index. */
const ADMIN_NAV_INDEX = NAV_SECTIONS.findIndex((item) => item.id === "account");

const ADMIN_NAV_SECTIONS: PageTocItem[] = NAV_SECTIONS.toSpliced(ADMIN_NAV_INDEX, 0, {
  id: "admin",
  label: "Admin",
});

function ProfilePage() {
  const { data: session } = useSession();
  const languages = useLanguageList();
  const user = session?.user;
  const gravatarHash = useGravatarHash(user?.email);
  // isAdmin query is not prefetched, so the admin section is absent during SSR.
  const { data: isAdmin = false } = useIsAdmin();

  if (!user) {
    return null;
  }

  const createdAt = user.createdAt ? formatDay(user.createdAt) : null;

  return (
    <div className={cn(PAGE_WIDTH.capped, PAGE_PADDING)}>
      <SettingsLayout toc={isAdmin ? ADMIN_NAV_SECTIONS : NAV_SECTIONS}>
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

        <SettingsGroup id="sharing" title="Public sharing">
          <PublicSharingSection />
          {/* Renders nothing while the meta archive is unlaunched. */}
          <MetaCreditSection />
        </SettingsGroup>

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
          <div id="groups" className="scroll-mt-16">
            <GroupNotificationsSection />
          </div>
        </SettingsGroup>

        <SettingsGroup id="integrations" title="Integrations">
          <MyDeckCheckKeysSection />
        </SettingsGroup>

        {isAdmin && (
          <SettingsGroup id="admin" title="Admin">
            <AdminNotificationsSection />
          </SettingsGroup>
        )}

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
          <PasswordSection currentEmail={user.email} />
        </SettingsGroup>

        <SettingsGroup id="danger-zone" title="Danger Zone">
          <DangerZoneSection />
        </SettingsGroup>
      </SettingsLayout>
    </div>
  );
}
