import { Link } from "@tanstack/react-router";

export function Footer() {
  return (
    <footer className="border-t border-border bg-muted/50 py-6">
      <div className="mx-auto max-w-7xl px-4 wide:max-w-(--container-max-wide) xwide:max-w-(--container-max-xwide) xxwide:max-w-(--container-max-xxwide)">
        <nav className="mb-3 flex justify-center gap-4 text-xs">
          <Link to="/legal-notice" className="text-muted-foreground hover:text-foreground">
            Legal Notice
          </Link>
          <Link to="/privacy-policy" className="text-muted-foreground hover:text-foreground">
            Privacy Policy
          </Link>
        </nav>
        <p className="text-center text-xs text-muted-foreground">
          OpenRift isn&apos;t endorsed by Riot Games and doesn&apos;t reflect the views or opinions
          of Riot Games or anyone officially involved in producing or managing Riot Games
          properties. Riot Games, and all associated properties are trademarks or registered
          trademarks of Riot Games, Inc.
        </p>
      </div>
    </footer>
  );
}
