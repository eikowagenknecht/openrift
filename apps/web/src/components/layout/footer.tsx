import { Link } from "@tanstack/react-router";
import { siGithub } from "simple-icons";

import { COMMIT_HASH } from "@/lib/env";

export function Footer() {
  return (
    <footer className="mx-auto max-w-3xl px-4 py-4 text-center text-[11px] leading-relaxed text-muted-foreground/60">
      <p>
        <Link to="/legal-notice" className="hover:text-muted-foreground">
          Legal Notice
        </Link>
        <span aria-hidden="true"> · </span>
        <Link to="/privacy-policy" className="hover:text-muted-foreground">
          Privacy Policy
        </Link>
        <span aria-hidden="true"> · </span>
        <a
          href="https://github.com/eikowagenknecht/openrift/commits/main/"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-muted-foreground"
        >
          <svg
            role="img"
            viewBox="0 0 24 24"
            className="mb-px mr-0.5 inline size-2.5 fill-current align-middle"
          >
            <path d={siGithub.path} />
          </svg>
          {COMMIT_HASH}
        </a>
      </p>
      <p className="mt-1">
        OpenRift isn&apos;t endorsed by Riot Games and doesn&apos;t reflect the views or opinions of
        Riot Games or anyone officially involved in producing or managing Riot Games properties.
        Riot Games, and all associated properties are trademarks or registered trademarks of Riot
        Games, Inc.
      </p>
    </footer>
  );
}
