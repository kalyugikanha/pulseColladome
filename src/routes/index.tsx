import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  CheckSquare,
  Clock,
  GraduationCap,
  Wallet,
  CalendarDays,
  Workflow,
  Timer,
  Eye,
  LineChart,
  TrendingUp,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SiteFooter } from "@/components/site-footer";
import colladomeLogo from "@/assets/colladome-logo.png.asset.json";

const FEATURES = [
  { icon: CheckSquare, title: "Task Management", desc: "Align. Assign. Track. Everything in one view." },
  { icon: Clock, title: "Attendance & Timesheets", desc: "Punch in/out, log hours, and stay compliant." },
  { icon: GraduationCap, title: "Learning Hub", desc: "Courses, onboarding, resources — always within reach." },
  { icon: Wallet, title: "Finance & Project Burn", desc: "Track salary burn, expenses, and project profitability in real time." },
  { icon: CalendarDays, title: "Team Meetings", desc: "Sync calendars, stay aligned, move faster." },
];

const CLOSER_ITEMS = [
  { icon: Timer, label: "Save Time" },
  { icon: Eye, label: "Gain Visibility" },
  { icon: LineChart, label: "Improve Decisions" },
  { icon: TrendingUp, label: "Drive Growth" },
];

// ---------- Mockup panels ----------

function TasksMockup() {
  const cols = [
    { name: "To Do", tone: "bg-muted text-muted-foreground", items: ["Draft Q3 launch plan", "Refresh brand deck"] },
    { name: "In Progress", tone: "bg-secondary text-secondary-foreground", items: ["Client onboarding: Acme", "Migrate CRM data"] },
    { name: "Review", tone: "bg-primary/15 text-primary", items: ["Vendor contract review"] },
    { name: "Done", tone: "bg-success/15 text-foreground", items: ["Kickoff notes shared"] },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      {cols.map((c) => (
        <div key={c.name} className="rounded-md border border-border/60 bg-surface p-2">
          <div className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${c.tone}`}>
            {c.name}
          </div>
          <div className="mt-2 space-y-1.5">
            {c.items.map((t) => (
              <div key={t} className="rounded border border-border/60 bg-background p-2 text-xs">
                {t}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function AttendanceMockup() {
  const rows = [
    { name: "A. Sharma", in: "09:42", status: "In" },
    { name: "R. Verma", in: "09:55", status: "In" },
    { name: "J. Singh", in: "—", status: "Missing" },
    { name: "K. Iyer", in: "10:08", status: "In" },
  ];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {[
          { k: "Employees", v: "20" },
          { k: "Punched in", v: "16" },
          { k: "Not punched", v: "3" },
        ].map((s) => (
          <div key={s.k} className="rounded-md border border-border/60 bg-surface p-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{s.k}</div>
            <div className="mt-1 text-xl font-semibold">{s.v}</div>
          </div>
        ))}
      </div>
      <div className="rounded-md border border-border/60 bg-surface overflow-hidden text-xs">
        {rows.map((r, i) => (
          <div
            key={r.name}
            className={`grid grid-cols-[1fr_auto_auto] items-center gap-3 px-3 py-2 ${i > 0 ? "border-t border-border/60" : ""}`}
          >
            <div>{r.name}</div>
            <div className="text-muted-foreground tabular-nums">{r.in}</div>
            <Badge variant={r.status === "In" ? "secondary" : "outline"} className="text-[10px]">
              {r.status}
            </Badge>
          </div>
        ))}
      </div>
    </div>
  );
}

function FinanceMockup() {
  const bars = [
    { name: "AS", pct: 92 },
    { name: "RV", pct: 74 },
    { name: "JS", pct: 61 },
    { name: "KI", pct: 48 },
    { name: "MP", pct: 33 },
  ];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {[
          { k: "Salary burn", v: "₹12.4L" },
          { k: "Expenses", v: "₹2.1L" },
          { k: "Total burn", v: "₹14.5L" },
        ].map((s) => (
          <div key={s.k} className="rounded-md border border-border/60 bg-surface p-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{s.k}</div>
            <div className="mt-1 text-lg font-semibold">{s.v}</div>
          </div>
        ))}
      </div>
      <div className="rounded-md border border-border/60 bg-surface p-3 space-y-2">
        {bars.map((b) => (
          <div key={b.name} className="flex items-center gap-2 text-xs">
            <div className="w-6 text-muted-foreground">{b.name}</div>
            <div className="flex-1 h-2 rounded bg-muted overflow-hidden">
              <div className="h-full bg-primary" style={{ width: `${b.pct}%` }} />
            </div>
            <div className="w-10 text-right tabular-nums text-muted-foreground">{b.pct}%</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LearningMockup() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {[
          { t: "AI Fundamentals Course", m: "6 modules · 2h" },
          { t: "Onboarding Essentials", m: "4 modules · 45m" },
        ].map((c) => (
          <div key={c.t} className="rounded-md border border-border/60 bg-surface p-3">
            <div className="text-xs font-semibold">{c.t}</div>
            <div className="mt-1 text-[11px] text-muted-foreground">{c.m}</div>
            <div className="mt-2 h-1.5 rounded bg-muted overflow-hidden">
              <div className="h-full bg-primary" style={{ width: "62%" }} />
            </div>
          </div>
        ))}
      </div>
      <div className="rounded-md border border-border/60 bg-surface p-3">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">Completion leaderboard</div>
        {[
          { n: "A. Sharma", c: 12 },
          { n: "R. Verma", c: 9 },
          { n: "J. Singh", c: 7 },
        ].map((r, i) => (
          <div key={r.n} className={`flex items-center justify-between text-xs py-1.5 ${i > 0 ? "border-t border-border/60" : ""}`}>
            <div>
              <span className="text-muted-foreground mr-2">#{i + 1}</span>
              {r.n}
            </div>
            <div className="tabular-nums text-muted-foreground">{r.c} done</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MeetingsMockup() {
  const items = [
    { t: "Weekly team sync", w: "Mon · 10:00 AM", n: "8 attendees" },
    { t: "Client review — Acme", w: "Tue · 3:30 PM", n: "5 attendees" },
    { t: "Product planning", w: "Thu · 11:00 AM", n: "6 attendees" },
  ];
  return (
    <div className="rounded-md border border-border/60 bg-surface overflow-hidden text-xs">
      {items.map((m, i) => (
        <div key={m.t} className={`flex items-center justify-between px-3 py-2.5 ${i > 0 ? "border-t border-border/60" : ""}`}>
          <div>
            <div className="font-medium">{m.t}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">{m.w}</div>
          </div>
          <Badge variant="secondary" className="text-[10px]">{m.n}</Badge>
        </div>
      ))}
    </div>
  );
}

function WorkflowMockup() {
  const templates = [
    { t: "New Hire Onboarding", s: ["Offer", "Docs", "IT setup", "Day 1", "30-day review"] },
    { t: "Client Kickoff", s: ["Discovery", "Proposal", "Contract", "Handoff"] },
    { t: "Vendor Approval", s: ["Request", "Compliance", "Finance", "Approved"] },
  ];
  return (
    <div className="space-y-2">
      {templates.map((tpl) => (
        <div key={tpl.t} className="rounded-md border border-border/60 bg-surface p-3">
          <div className="text-xs font-semibold">{tpl.t}</div>
          <div className="mt-2 flex flex-wrap gap-1">
            {tpl.s.map((step) => (
              <span key={step} className="rounded border border-border/60 bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {step}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const GALLERY = [
  { title: "Tasks & Workflows", sub: "Visualize. Prioritize. Get things done.", node: <TasksMockup /> },
  { title: "Attendance & Timesheets", sub: "Track time. Stay compliant. Build trust.", node: <AttendanceMockup /> },
  { title: "Finances & Project Burn", sub: "Real-time insights. Smarter decisions.", node: <FinanceMockup /> },
  { title: "Learning Hub", sub: "Learn. Grow. Share knowledge.", node: <LearningMockup /> },
  { title: "Team Meetings", sub: "Sync calendars. Stay aligned.", node: <MeetingsMockup /> },
  { title: "Workflow Templates", sub: "Standardize processes. Save time. Stay consistent.", node: <WorkflowMockup /> },
];

// ---------- Page ----------

function LandingPage() {
  const [isSignedIn, setIsSignedIn] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setIsSignedIn(!!data.session));
  }, []);

  const pulsePath = isSignedIn ? "/dashboard" : "/auth";
  const pulseLabel = isSignedIn ? "Go to dashboard" : "Enter Pulse →";

  return (
    <main className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* Hero */}
      <section className="relative px-6 md:px-16 pt-10 pb-20 md:pt-14 md:pb-28">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            background:
              "radial-gradient(1200px 600px at 20% 10%, color-mix(in oklab, var(--primary-glow) 35%, transparent), transparent 60%), radial-gradient(900px 500px at 90% 90%, color-mix(in oklab, var(--primary) 25%, transparent), transparent 60%)",
          }}
        />
        <nav className="relative z-10 flex items-center justify-between mb-16">
          <div className="font-semibold tracking-tight text-lg">
            Colladome <span className="text-primary">Pulse</span>
          </div>
          <div className="flex gap-3">
            <Link to={pulsePath}>
              <Button variant="ghost" size="sm">{isSignedIn ? "Dashboard" : "Sign in"}</Button>
            </Link>
          </div>
        </nav>

        <div className="relative z-10 max-w-5xl">
          <h1
            className="text-5xl md:text-7xl lg:text-8xl leading-[1.05] tracking-tight font-normal"
            style={{ fontFamily: '"Instrument Serif", ui-serif, Georgia, serif' }}
          >
            One Platform.
            <br />
            Every Process.
            <br />
            <span className="text-primary">Total Clarity.</span>
          </h1>
          <figure className="mt-8 max-w-2xl border-l-2 border-primary/60 pl-4">
            <blockquote
              className="text-lg md:text-xl text-foreground/80 leading-relaxed"
              style={{ fontFamily: '"Instrument Serif", ui-serif, Georgia, serif', fontStyle: "italic" }}
            >
              "Pulse brings everything our team needs into one place — so we can focus on growing
              the business, not chasing updates."
            </blockquote>
            <figcaption className="mt-3 text-xs uppercase tracking-[0.25em] text-muted-foreground">
              — Colladome Leadership
            </figcaption>
          </figure>

          <div className="mt-10 flex flex-wrap gap-3 items-center">
            <Link to={pulsePath}>
              <Button size="lg" className="text-base px-8 py-6">{pulseLabel}</Button>
            </Link>
            <Link to={isSignedIn ? "/dashboard" : "/auth"}>
              <Button variant="outline" size="lg" className="text-base px-8 py-6">
                {isSignedIn ? "Open dashboard" : "Sign in"}
              </Button>
            </Link>
            {!isSignedIn && (
              <Link to="/apply" className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-4 ml-1">
                Applying for our training program? →
              </Link>
            )}
          </div>

        </div>
      </section>

      {/* What is Pulse + feature grid */}
      <section className="relative px-6 md:px-16 py-20 border-t border-border/60 bg-surface-2/40">
        <div className="max-w-6xl mx-auto">
          <div className="grid gap-10 md:grid-cols-[1fr_2fr] items-start">
            <p className="uppercase tracking-[0.25em] text-xs text-primary font-semibold">
              What is Colladome Pulse?
            </p>
            <div className="space-y-5 max-w-2xl">
              <p
                className="text-2xl md:text-3xl leading-snug"
                style={{ fontFamily: '"Instrument Serif", ui-serif, Georgia, serif' }}
              >
                A unified operating system for how your company actually runs.
              </p>
              <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
                Pulse ties tasks, attendance, learning, finance, and meetings into a single portal —
                so managers stop chasing updates, employees stop hopping between tools, and leadership
                gets one clear source of truth across every function.
              </p>
            </div>
          </div>

          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <Card key={title} className="border-border/60">
                <CardHeader className="flex flex-row items-center gap-3 pb-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="text-base font-semibold">{title}</div>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">{desc}</CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Gallery */}
      <section className="relative px-6 md:px-16 py-24 border-t border-border/60">
        <div className="max-w-6xl mx-auto">
          <div className="mb-12 max-w-3xl">
            <p className="uppercase tracking-[0.25em] text-xs text-primary font-semibold mb-4">
              A quick tour
            </p>
            <h2
              className="text-4xl md:text-5xl leading-tight tracking-tight"
              style={{ fontFamily: '"Instrument Serif", ui-serif, Georgia, serif' }}
            >
              All your work. <span className="text-primary">One place.</span>
            </h2>
            <p className="mt-4 text-muted-foreground">
              A glimpse of what employees, managers, and leadership see day-to-day inside Pulse.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            {GALLERY.map((g) => (
              <Card key={g.title} className="border-border/60 overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="text-base font-semibold">{g.title}</div>
                  <div className="text-sm text-muted-foreground">{g.sub}</div>
                </CardHeader>
                <CardContent className="pt-0">{g.node}</CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Closing banner */}
      <section className="relative px-6 md:px-16 py-20 bg-sidebar text-sidebar-foreground">
        <div className="max-w-5xl mx-auto text-center space-y-4">
          <h2
            className="text-4xl md:text-6xl leading-tight tracking-tight"
            style={{ fontFamily: '"Instrument Serif", ui-serif, Georgia, serif' }}
          >
            Built to reduce operational chaos.
          </h2>
          <p className="text-lg md:text-xl text-sidebar-foreground/80 max-w-3xl mx-auto">
            So we can focus on what truly matters — growing the business.
          </p>

          <div className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
            {CLOSER_ITEMS.map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex flex-col items-center gap-2 rounded-lg border border-sidebar-border/60 bg-sidebar-accent/40 px-4 py-5"
              >
                <Icon className="h-5 w-5 text-sidebar-primary" />
                <div className="text-sm font-medium">{label}</div>
              </div>
            ))}
          </div>

          <div className="pt-10">
            <Link to={pulsePath}>
              <Button size="lg" className="text-base px-10 py-6">{pulseLabel}</Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Powered-by strip */}
      <section className="px-6 md:px-16 py-10 border-t border-border/60">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
            Powered by
          </div>
          <a
            href="https://colladome.com"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 group"
          >
            <img
              src={colladomeLogo.url}
              alt="Colladome IT Network Solutions"
              className="h-8 w-auto opacity-80 group-hover:opacity-100 transition"
            />
            <span className="text-sm text-muted-foreground group-hover:text-foreground transition">
              Colladome IT Network Solutions
            </span>
          </a>
          <div className="text-xs text-muted-foreground">
            Custom software · AI · Cloud & Enterprise
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Colladome Pulse | One Platform. Every Process. Total Clarity." },
      {
        name: "description",
        content:
          "Colladome Pulse unifies tasks, attendance, learning, finance, and meetings into one portal — so teams stop chasing updates and leaders get total clarity.",
      },
      { property: "og:title", content: "Colladome Pulse | One Platform. Every Process. Total Clarity." },
      {
        property: "og:description",
        content:
          "A unified operating system for how your company actually runs — tasks, attendance, learning, finance, and meetings in one place.",
      },
    ],
  }),
  component: LandingPage,
});
