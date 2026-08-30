import type { MetaListStatus } from "@openrift/shared";
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
import { MetaIdentity } from "@/components/meta/meta-identity";
import { MetaListStatusBadge } from "@/components/meta/meta-list-status-badge";
import type { ArchivedDeckIdentity } from "@/lib/meta-deck-archive";

/**
 * The archived deck page's title row: the trail back through the archive to the
 * event, the legend the list is named by, and the page's two actions.
 *
 * A page-level bar rather than the hero's own row, because the deck it frames is
 * one entry in a record the reader walked into from somewhere: the way back out
 * has to stay on screen while they scroll the list.
 *
 * @returns The sticky bar.
 */
export function MetaDeckArchiveBar({
  event,
  identity,
  deckName,
  listStatus,
  actions,
}: {
  event: { slug: string; name: string };
  /** Null for a list whose source published neither a Legend nor a champion. */
  identity: ArchivedDeckIdentity | null;
  /** The title for such a list: the deck's own name. */
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
