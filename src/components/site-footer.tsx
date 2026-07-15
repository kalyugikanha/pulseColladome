import { Link } from "@tanstack/react-router";

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60 px-6 md:px-16 py-10">
      <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-xs uppercase tracking-[0.25em] text-muted-foreground">
        <div>© {new Date().getFullYear()} Colladome Pulse</div>
        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
          <Link to="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link>
          <Link to="/contact" className="hover:text-foreground transition-colors">Contact & Support</Link>
        </nav>
      </div>
    </footer>
  );
}
