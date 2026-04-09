import { Link } from "@tanstack/react-router";
import { siDiscord, siGithub } from "simple-icons";

import { COMMIT_HASH } from "@/lib/env";
import { cn } from "@/lib/utils";

export function Footer({ className }: { className?: string }) {
  return (
    <footer className={cn("text-2xs text-muted-foreground/60 mx-auto text-center", className)}>
      <p>
        <Link to="/legal-notice" className="hover:text-muted-foreground">
          Legal Notice
        </Link>
        <span aria-hidden="true"> · </span>
        <Link to="/privacy-policy" className="hover:text-muted-foreground">
          Privacy Policy
        </Link>
        <span aria-hidden="true"> · </span>
        <Link to="/support" className="hover:text-muted-foreground">
          Support Us
        </Link>
        <span aria-hidden="true"> · </span>
        <a
          href="https://discord.gg/Qb6RcjXq6z"
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
          href="https://github.com/eikowagenknecht/openrift/commits/main/"
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
