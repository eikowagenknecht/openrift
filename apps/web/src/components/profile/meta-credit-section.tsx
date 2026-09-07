import type { MetaCreditVisibility } from "@openrift/shared";
import { META_CREDIT_VISIBILITIES } from "@openrift/shared";
import { Link } from "@tanstack/react-router";

import { MetaContributors } from "@/components/meta/meta-contributors";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { useFeatureEnabled } from "@/hooks/use-feature-flags";
import { useMetaCreditVisibility, useSetMetaCreditVisibility } from "@/hooks/use-meta-submissions";
import { useSession } from "@/lib/auth-session";
import {
  metaCreditPreview,
  metaCreditVisibilityHints,
  metaCreditVisibilityLabels,
} from "@/lib/meta-submission-copy";

function CreditPreview({
  creditedAs,
  usesDisplayNameFallback,
  visibility,
}: {
  creditedAs: string | null;
  usesDisplayNameFallback: boolean;
  visibility: MetaCreditVisibility;
}) {
  return (
    <div className="flex flex-col gap-1 border-t pt-4">
      <h3 className="font-medium">On an event page</h3>
      {creditedAs === null ? (
        <p className="text-muted-foreground text-sm">
          {visibility === "hidden"
            ? "Nothing names you. Your decklists still count towards the archive."
            : "There is no name to print, so you are left off the page entirely."}
        </p>
      ) : (
        <MetaContributors contributors={[creditedAs]} />
      )}
      {usesDisplayNameFallback && creditedAs !== null && (
        <p className="text-muted-foreground text-sm">
          You have no Riot ID yet, so your display name is used.{" "}
          <Link to="/profile" hash="account" className="underline">
            Add one
          </Link>{" "}
          and it takes over.
        </p>
      )}
      {creditedAs === null && visibility !== "hidden" && (
        <p className="text-muted-foreground text-sm">
          <Link to="/profile" hash="account" className="underline">
            Set a display name
          </Link>{" "}
          to be credited.
        </p>
      )}
    </div>
  );
}

// Credit rows are written regardless of this setting; the public read filters
// on it at render time, so toggling it retroactively (un)credits everything.
export function MetaCreditSection() {
  const metaEnabled = useFeatureEnabled("meta");
  const { data: session } = useSession();
  const { data, isPending } = useMetaCreditVisibility();
  const setVisibility = useSetMetaCreditVisibility();

  if (!metaEnabled) {
    return null;
  }

  const user = session?.user;
  const visibility = data?.visibility ?? "hidden";
  const preview = metaCreditPreview(visibility, { name: user?.name, riotId: user?.riotId });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Meta archive credit</CardTitle>
        <CardDescription>
          Whether archive event pages name you as a contributor. Covers everything you have
          contributed, past and future.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <RadioGroup
            value={visibility}
            onValueChange={(next) =>
              setVisibility.mutate({ visibility: next as MetaCreditVisibility })
            }
            className="flex flex-col gap-3"
            aria-label="Meta archive credit"
          >
            {META_CREDIT_VISIBILITIES.map((option) => {
              const radioId = `meta-credit-${option}`;
              return (
                <div key={option} className="flex items-start gap-2">
                  <RadioGroupItem
                    id={radioId}
                    value={option}
                    disabled={setVisibility.isPending}
                    className="mt-1"
                  />
                  <label htmlFor={radioId} className="cursor-pointer">
                    <span className="block">{metaCreditVisibilityLabels[option]}</span>
                    <span className="text-muted-foreground block text-sm">
                      {metaCreditVisibilityHints[option]}
                    </span>
                  </label>
                </div>
              );
            })}
          </RadioGroup>
        )}

        <CreditPreview
          creditedAs={preview.creditedAs}
          usesDisplayNameFallback={preview.usesDisplayNameFallback}
          visibility={visibility}
        />
      </CardContent>
    </Card>
  );
}
