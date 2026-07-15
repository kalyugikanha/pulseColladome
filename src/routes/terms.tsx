import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteFooter } from "@/components/site-footer";

export const Route = createFileRoute("/terms")({
  component: TermsPage,
  head: () => ({
    meta: [
      { title: "Terms of Service — Colladome Pulse" },
      { name: "description", content: "Terms of use for Colladome Pulse, an internal team operating system for Colladome employees." },
      { property: "og:title", content: "Terms of Service — Colladome Pulse" },
      { property: "og:description", content: "Terms of use for Colladome Pulse, an internal team operating system for Colladome employees." },
      { property: "og:url", content: "https://colladome-pulse.lovable.app/terms" },
    ],
    links: [{ rel: "canonical", href: "https://colladome-pulse.lovable.app/terms" }],
  }),
});

function TermsPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← Back to home</Link>
        <h1 className="font-display text-4xl font-bold mt-6 mb-2">Terms of Service</h1>
        <p className="text-sm text-muted-foreground mb-10">Last updated: 7 July 2026</p>

        <section className="space-y-6 text-[15px] leading-relaxed">
          <p>
            Colladome Pulse ("Pulse") is an internal team operating system
            provided by Colladome ("Colladome", "we") to its employees and
            authorized contractors. By signing in you agree to these terms.
          </p>

          <div>
            <h2 className="font-display text-xl font-semibold mb-2">Who may use Pulse</h2>
            <p>
              Access is restricted to authorized Colladome personnel signing in
              with a Google account on the
              <span className="font-semibold"> @colladome.com</span> or
              <span className="font-semibold"> @colladome.in</span> domain.
              Sharing credentials or attempting to bypass sign-in restrictions
              is not permitted.
            </p>
          </div>

          <div>
            <h2 className="font-display text-xl font-semibold mb-2">Acceptable use</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>Use Pulse only for legitimate Colladome work.</li>
              <li>Do not upload unlawful, harmful, or infringing content.</li>
              <li>Do not attempt to probe, scan, or disrupt the service.</li>
              <li>Keep company and client information confidential.</li>
            </ul>
          </div>

          <div>
            <h2 className="font-display text-xl font-semibold mb-2">Your content</h2>
            <p>
              Entries you make in Pulse (timesheets, leave requests, project
              updates, tasks, calendar entries, directory information) are
              Colladome business records. Colladome may access, retain, and act
              on them in the ordinary course of managing internal operations.
            </p>
          </div>

          <div>
            <h2 className="font-display text-xl font-semibold mb-2">Availability</h2>
            <p>
              Pulse is provided on an "as is" basis for internal use. We may
              add, change, or remove features and may schedule downtime for
              maintenance without prior notice.
            </p>
          </div>

          <div>
            <h2 className="font-display text-xl font-semibold mb-2">Termination</h2>
            <p>
              Access ends automatically when a person is no longer an authorized
              Colladome user, and may be suspended for violations of these
              terms or internal policy.
            </p>
          </div>

          <div>
            <h2 className="font-display text-xl font-semibold mb-2">Contact</h2>
            <p>
              Questions about these terms: <a href="mailto:admin@colladome.com" className="underline">admin@colladome.com</a>.
            </p>
          </div>
        </section>
      </div>
      <SiteFooter />
    </main>
  );
}
