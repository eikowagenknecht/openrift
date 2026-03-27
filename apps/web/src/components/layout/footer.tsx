import { Link } from "@tanstack/react-router";
import { siGithub } from "simple-icons";

import { COMMIT_HASH } from "@/lib/env";

export function Footer() {
  return (
    <footer className="text-2xs text-muted-foreground/60 mx-auto p-4 text-center">
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
        assets owned by Riot Games. Riot Games does not endorse or sponsor this project.
      </p>
    </footer>
  );
}
