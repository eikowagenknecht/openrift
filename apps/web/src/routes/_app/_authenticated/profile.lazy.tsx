import { createLazyFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

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
import { cn, PAGE_PADDING } from "@/lib/utils";

export const Route = createLazyFileRoute("/_app/_authenticated/profile")({
  component: ProfilePage,
});

const NAV_SECTIONS = [
  { id: "preferences", label: "Preferences" },
  { id: "account", label: "Account" },
  { id: "security", label: "Security" },
  { id: "danger-zone", label: "Danger Zone" },
] as const;

function ProfilePage() {
  const { data: session } = useSession();
  const languages = useLanguageList();
  const user = session?.user;
  const gravatarUrl = useGravatarUrl(user?.email);
  const [activeSection, setActiveSection] = useState<string>(NAV_SECTIONS[0].id);
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map());

  useEffect(() => {
    const elements = [...sectionRefs.current.values()];
    if (elements.length === 0) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        // Find the topmost visible section
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          const id = (visible[0].target as HTMLElement).dataset.section;
          if (id) {
            setActiveSection(id);
          }
        }
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0 },
    );

    for (const element of elements) {
      observer.observe(element);
    }
    return () => observer.disconnect();
  }, []);

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

  function scrollToSection(sectionId: string) {
    const element = sectionRefs.current.get(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function setSectionRef(id: string, element: HTMLElement | null) {
    if (element) {
      sectionRefs.current.set(id, element);
    } else {
      sectionRefs.current.delete(id);
    }
  }

  return (
    <div className={`flex justify-center ${PAGE_PADDING}`}>
      <div className="flex w-full max-w-3xl gap-8">
        {/* Sidebar nav — hidden on mobile */}
        <nav className="hidden shrink-0 md:block md:w-44">
          <div className="sticky top-16 space-y-0.5">
            {NAV_SECTIONS.map((section) => (
              <button
                key={section.id}
                type="button"
                onClick={() => scrollToSection(section.id)}
                className={cn(
                  "block w-full rounded-md px-3 py-1.5 text-left text-sm transition-colors",
                  activeSection === section.id
                    ? "bg-muted text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                )}
              >
                {section.label}
              </button>
            ))}
          </div>
        </nav>

        {/* Main content */}
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

          {/* Preferences */}
          <section
            ref={(el) => setSectionRef("preferences", el)}
            data-section="preferences"
            className="scroll-mt-16 space-y-6"
          >
            <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
              Preferences
            </h2>
            <DisplaySection />
            <MarketplacesSection />
            <LanguagesSection availableLanguages={languages} />
          </section>

          {/* Account */}
          <section
            ref={(el) => setSectionRef("account", el)}
            data-section="account"
            className="scroll-mt-16 space-y-6"
          >
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

          {/* Security */}
          <section
            ref={(el) => setSectionRef("security", el)}
            data-section="security"
            className="scroll-mt-16 space-y-6"
          >
            <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
              Security
            </h2>
            <PasswordSection />
          </section>

          {/* Danger Zone */}
          <section
            ref={(el) => setSectionRef("danger-zone", el)}
            data-section="danger-zone"
            className="scroll-mt-16 space-y-6"
          >
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
