import type { MetaListStatus } from "@openrift/shared/types/enums";
import { Link } from "@tanstack/react-router";

import {
  PageTopBar,
  PageTopBarActions,
  PageTopBarSticky,
  PageTopBarTitle,
} from "@/components/layout/page-top-bar";
import {
  TopBarBreadcrumbSeparator,
  TopBarBreadcrumbTrail,
} from "@/components/layout/top-bar-breadcrumb";
import { MetaIdentity } from "@/features/meta/components/meta-identity";
import { MetaListStatusBadge } from "@/features/meta/components/meta-list-status-badge";
import type { ArchivedDeckIdentity } from "@/features/meta/lib/meta-deck-archive";

export function MetaDeckArchiveBar({
  event,
  identity,
  deckName,
  listStatus,
  actions,
}: {
  event: { slug: string; name: string };
  identity: ArchivedDeckIdentity | null;
  deckName: string;
  listStatus: MetaListStatus;
  actions: React.ReactNode;
}) {
  return (
    <PageTopBarSticky width="full">
      <PageTopBar className="gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <TopBarBreadcrumbTrail
            segments={[
              { label: "Meta Archive", link: <Link to="/meta" /> },
              {
                label: event.name,
                link: <Link to="/meta/$slug" params={{ slug: event.slug }} />,
              },
            ]}
          />
          <TopBarBreadcrumbSeparator className="hidden sm:inline" />
          <PageTopBarTitle>
            {identity ? (
              <MetaIdentity
                name={identity.name}
                slug={identity.slug}
                domains={identity.domains}
                className="flex-nowrap"
              />
            ) : (
              deckName
            )}
          </PageTopBarTitle>
          <MetaListStatusBadge listStatus={listStatus} />
        </div>
        <PageTopBarActions>{actions}</PageTopBarActions>
      </PageTopBar>
    </PageTopBarSticky>
  );
}
