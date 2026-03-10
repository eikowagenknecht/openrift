import { Link } from "@tanstack/react-router";

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
