import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteFooter } from "@/components/site-footer";

export const Route = createFileRoute("/contact")({
  component: ContactPage,
  head: () => ({
    meta: [
      { title: "Contact & Support — Colladome Pulse" },
      { name: "description", content: "Get in touch with the Colladome Pulse team for support, access issues, or feedback about the internal employee portal." },
      { property: "og:title", content: "Contact & Support — Colladome Pulse" },
      { property: "og:description", content: "Get in touch with the Colladome Pulse team for support, access issues, or feedback." },
      { property: "og:url", content: "https://pulse.colladome.com/contact" },
    ],
    links: [{ rel: "canonical", href: "https://pulse.colladome.com/contact" }],
  }),
});

function ContactPage() {
  return (
    <main className="min-h-screen bg-background text-foreground flex flex-col">
      <div className="flex-1">
        <div className="max-w-3xl mx-auto px-6 py-16">
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← Back to home</Link>
          <h1 className="font-display text-4xl font-bold mt-6 mb-2">Contact & Support</h1>
          <p className="text-sm text-muted-foreground mb-10">
            Colladome Pulse is an internal portal maintained for Colladome IT Network Solutions employees.
          </p>

          <section className="space-y-8 text-[15px] leading-relaxed">
            <div>
              <h2 className="text-lg font-semibold mb-2">Employee support</h2>
              <p className="text-muted-foreground">
                If you're a Colladome employee and need help signing in, resetting access,
                or reporting a bug, reach out to the internal admin team.
              </p>
              <ul className="mt-3 space-y-1">
                <li>Email: <a href="mailto:support@colladome.com" className="text-primary hover:underline">support@colladome.com</a></li>
                <li>HR queries: <a href="mailto:hr@colladome.com" className="text-primary hover:underline">hr@colladome.com</a></li>
              </ul>
            </div>

            <div>
              <h2 className="text-lg font-semibold mb-2">Security & privacy</h2>
              <p className="text-muted-foreground">
                For privacy questions or to report a security concern, contact{" "}
                <a href="mailto:security@colladome.com" className="text-primary hover:underline">security@colladome.com</a>.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold mb-2">Company</h2>
              <p className="text-muted-foreground">
                Colladome IT Network Solutions<br />
                Hyderabad, India
              </p>
            </div>

            <p className="text-xs text-muted-foreground pt-6 border-t border-border/60">
              This page is maintained by Colladome. Access to Colladome Pulse is limited
              to authorized employees and contractors.
            </p>
          </section>
        </div>
      </div>
      <SiteFooter />
    </main>
  );
}
