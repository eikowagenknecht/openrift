import { Link } from "@tanstack/react-router";

export function Footer() {
  return (
    <footer className="px-4 py-4 text-center text-[11px] leading-relaxed text-muted-foreground/60">
      <Link to="/legal-notice" className="hover:text-muted-foreground">
        Legal Notice
      </Link>
      <span aria-hidden="true"> · </span>
      <Link to="/privacy-policy" className="hover:text-muted-foreground">
        Privacy Policy
      </Link>
      <span aria-hidden="true"> · </span>
      <span>Not affiliated with or endorsed by Riot Games, Inc.</span>
    </footer>
  );
}
