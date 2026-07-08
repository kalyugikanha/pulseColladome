import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPage,
  head: () => ({
    meta: [
      { title: "Privacy Policy — Colladome Pulse" },
      { name: "description", content: "How Colladome Pulse collects, uses, and protects information for its internal team operating system." },
      { property: "og:title", content: "Privacy Policy — Colladome Pulse" },
      { property: "og:description", content: "How Colladome Pulse collects, uses, and protects information for its internal team operating system." },
      { property: "og:url", content: "https://colladome-pulse.lovable.app/privacy" },
    ],
    links: [{ rel: "canonical", href: "https://colladome-pulse.lovable.app/privacy" }],
  }),
});

function PrivacyPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← Back to home</Link>
        <h1 className="font-display text-4xl font-bold mt-6 mb-2">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground mb-10">Last updated: 7 July 2026</p>

        <section className="space-y-6 text-[15px] leading-relaxed">
          <p>
            Colladome Pulse ("Pulse", "we", "us") is an internal team operating
            system maintained by Colladome for its own employees and authorized
            contractors. This page explains what information Pulse handles and
            how it is used. This page is maintained by Colladome to answer
            common privacy questions about Pulse.
          </p>

          <div>
            <h2 className="font-display text-xl font-semibold mb-2">Who can use Pulse</h2>
            <p>
              Sign-in is restricted to Google accounts on the
              <span className="font-semibold"> @colladome.com</span> and
              <span className="font-semibold"> @colladome.in</span> domains.
              Personal Gmail and third-party accounts cannot access the app.
            </p>
          </div>

          <div>
            <h2 className="font-display text-xl font-semibold mb-2">Information we handle</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>Account basics from Google sign-in: name, work email, profile photo, Google account ID.</li>
              <li>Work data you or your teammates create in Pulse: attendance punches, timesheets, leave requests, project entries, tasks, calendar events, directory profile fields.</li>
              <li>If you connect Google Calendar, calendar events you choose to sync — used only to display and sync your work calendar inside Pulse.</li>
              <li>Basic technical logs (sign-in time, request errors) needed to operate the service.</li>
            </ul>
          </div>

          <div>
            <h2 className="font-display text-xl font-semibold mb-2">How we use it</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>To authenticate you and keep your session secure.</li>
              <li>To run the internal HR and operations features you interact with (attendance, leave, timesheets, projects, calendar, directory).</li>
              <li>To help Colladome's admin team manage internal operations.</li>
            </ul>
            <p className="mt-3">
              We do not sell your data. We do not use your data for advertising.
              We do not share your data with third parties for their own
              purposes.
            </p>
          </div>

          <div>
            <h2 className="font-display text-xl font-semibold mb-2">Google user data</h2>
            <p>
              Pulse's use of information received from Google APIs adheres to the
              {" "}
              <a href="https://developers.google.com/terms/api-services-user-data-policy" className="underline" target="_blank" rel="noreferrer">
                Google API Services User Data Policy
              </a>
              , including the Limited Use requirements. Google Calendar data, if
              connected, is used only to provide in-app calendar features and is
              not transferred to third parties except as needed to provide the
              service, or as required by law.
            </p>
          </div>

          <div>
            <h2 className="font-display text-xl font-semibold mb-2">Storage and security</h2>
            <p>
              Data is stored in Colladome's managed backend with row-level
              access controls so that users only see the data they are
              authorized to see. Access is limited to authenticated Colladome
              accounts and the platform administrators.
            </p>
          </div>

          <div>
            <h2 className="font-display text-xl font-semibold mb-2">Retention and deletion</h2>
            <p>
              Work records are retained for as long as the account is active or
              as needed for legitimate internal record-keeping. To request
              deletion or export of your data, contact the admin team using the
              address below.
            </p>
          </div>

          <div>
            <h2 className="font-display text-xl font-semibold mb-2">Contact</h2>
            <p>
              For privacy questions or data requests, contact the Colladome
              admin team at <a href="mailto:admin@colladome.com" className="underline">admin@colladome.com</a>.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
