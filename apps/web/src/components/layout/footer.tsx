import { Link } from "@tanstack/react-router";
import { siDiscord, siGithub } from "simple-icons";

import { OrnamentRule } from "@/components/ui/ornament";
import { useFeatureEnabled } from "@/hooks/use-feature-flags";
import { COMMIT_HASH } from "@/lib/env";
import { SOCIAL_LINKS } from "@/lib/social-links";
import { cn } from "@/lib/utils";

export function Footer({ className }: { className?: string }) {
  const developersEnabled = useFeatureEnabled("developers");
  return (
    <footer className={cn("text-2xs text-muted-foreground/60 mx-auto text-center", className)}>
      <OrnamentRule className="mx-auto mb-3 w-56" />
      <p>
        <Link to="/features" className="hover:text-muted-foreground">
          Features
        </Link>
        <span aria-hidden="true"> · </span>
        <Link to="/legal-notice" className="hover:text-muted-foreground">
          Legal Notice
        </Link>
        <span aria-hidden="true"> · </span>
        <Link to="/privacy-policy" className="hover:text-muted-foreground">
          Privacy Policy
        </Link>
        <span aria-hidden="true"> · </span>
        <Link to="/support" className="hover:text-muted-foreground">
          Support us
        </Link>
        <span aria-hidden="true"> · </span>
        {developersEnabled && (
          <>
            <Link to="/developers" className="hover:text-muted-foreground">
              Developers
            </Link>
            <span aria-hidden="true"> · </span>
          </>
        )}
        <a
          href={SOCIAL_LINKS.discordInvite}
          target="_blank"
          rel="noreferrer"
          className="hover:text-muted-foreground"
        >
          <svg
            role="img"
            viewBox="0 0 24 24"
            className="mr-0.5 mb-px inline size-2.5 fill-current align-middle"
          >
            <path d={siDiscord.path} />
          </svg>
          Discord
        </a>
        <span aria-hidden="true"> · </span>
        <a
          href={SOCIAL_LINKS.githubCommits}
          target="_blank"
          rel="noreferrer"
          className="hover:text-muted-foreground"
        >
          <svg
            role="img"
            viewBox="0 0 24 24"
            className="mr-0.5 mb-px inline size-2.5 fill-current align-middle"
          >
            <path d={siGithub.path} />
          </svg>
          {COMMIT_HASH}
        </a>
      </p>
      <p className="mt-1">
        OpenRift was created under Riot Games&apos; &ldquo;Legal Jibber Jabber&rdquo; policy using
        assets owned by Riot Games. Riot Games does not endorse or sponsor this project. Links to
        TCGPlayer and CardTrader are affiliate links.
      </p>
    </footer>
  );
}
