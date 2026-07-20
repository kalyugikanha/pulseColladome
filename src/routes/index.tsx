import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  CheckSquare,
  Clock,
  GraduationCap,
  Wallet,
  CalendarDays,
  Timer,
  Eye,
  LineChart,
  TrendingUp,
  Sparkles,
  ArrowRight,
  Mail,
  Phone,
  Linkedin,
  Instagram,
  Facebook,
  Youtube,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

// ---------- Hero product visual (floating browser mockup) ----------

function HeroProductVisual() {
  return (
    <div className="relative mx-auto max-w-5xl">
      {/* Glow behind the frame */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-x-10 -top-10 bottom-0 blur-3xl opacity-70"
        style={{
          background:
            "radial-gradient(60% 60% at 50% 40%, color-mix(in oklab, var(--primary-glow) 45%, transparent), transparent 70%)",
        }}
      />
      <div className="relative rounded-2xl border border-border/70 bg-card shadow-[0_40px_120px_-30px_rgba(0,0,0,0.35),0_20px_60px_-20px_color-mix(in_oklab,var(--primary)_25%,transparent)] overflow-hidden">
        {/* Browser chrome */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60 bg-surface-2/60">
          <span className="h-3 w-3 rounded-full bg-destructive/70" />
          <span className="h-3 w-3 rounded-full bg-primary/70" />
          <span className="h-3 w-3 rounded-full bg-success/70" />
          <div className="ml-4 flex-1 max-w-md">
            <div className="rounded-md border border-border/60 bg-background px-3 py-1 text-[11px] text-muted-foreground">
              pulse.colladome.com / dashboard
            </div>
          </div>
        </div>
        {/* Dashboard content */}
        <div className="p-5 md:p-7 space-y-5 bg-background">
          {/* Stat row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { k: "Punched in today", v: "16 / 20" },
              { k: "Open tasks", v: "42" },
              { k: "Salary burn (Jul)", v: "₹12.4L" },
              { k: "Courses in progress", v: "9" },
            ].map((s) => (
              <div key={s.k} className="rounded-lg border border-border/60 bg-surface p-3">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{s.k}</div>
                <div className="mt-1 text-xl font-semibold">{s.v}</div>
              </div>
            ))}
          </div>
          {/* Two-panel row */}
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-border/60 bg-surface p-3">
              <div className="text-xs font-semibold mb-3">Today's board</div>
              <TasksMockup />
            </div>
            <div className="rounded-lg border border-border/60 bg-surface p-3">
              <div className="text-xs font-semibold mb-3">Team attendance</div>
              <AttendanceMockup />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Sticky nav ----------

function StickyNav({ pulsePath, isSignedIn }: { pulsePath: string; isSignedIn: boolean }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <nav
      className={`sticky top-0 z-40 transition-all ${
        scrolled
          ? "backdrop-blur-md bg-background/75 border-b border-border/60"
          : "bg-transparent border-b border-transparent"
      }`}
    >
      <div className="max-w-6xl mx-auto flex items-center justify-between px-6 md:px-10 py-4">
        <Link to="/" className="font-semibold tracking-tight text-lg">
          Colladome <span className="text-primary">Pulse</span>
        </Link>
        <div className="flex items-center gap-3">
          <Link to={pulsePath}>
            <Button variant={scrolled ? "default" : "ghost"} size="sm">
              {isSignedIn ? "Dashboard" : "Sign in"}
            </Button>
          </Link>
        </div>
      </div>
    </nav>
  );
}

// ---------- Rich footer ----------

function LandingFooter() {
  const socials = [
    { icon: Linkedin, href: "https://www.linkedin.com/company/colladome/", label: "LinkedIn" },
    { icon: Instagram, href: "https://www.instagram.com/colladome/", label: "Instagram" },
    { icon: Facebook, href: "https://www.facebook.com/socialcolladome", label: "Facebook" },
    { icon: Youtube, href: "https://www.youtube.com/@Colladome", label: "YouTube" },
  ];
  return (
    <footer className="border-t border-border/60 bg-surface-2/40">
      <div className="max-w-6xl mx-auto px-6 md:px-16 py-14 grid gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="space-y-4">
          <a href="https://colladome.com" target="_blank" rel="noreferrer" className="inline-flex items-center gap-3 group">
            <img src={colladomeLogo.url} alt="Colladome IT Network Solutions" className="h-9 w-auto opacity-90 group-hover:opacity-100 transition" />
          </a>
          <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
            Colladome Pulse is built and maintained by{" "}
            <a href="https://colladome.com" target="_blank" rel="noreferrer" className="text-foreground hover:text-primary underline underline-offset-4">
              Colladome IT Network Solutions
            </a>
            . Custom software · AI · Cloud & Enterprise.
          </p>
          <div className="flex items-center gap-3 pt-2">
            {socials.map(({ icon: Icon, href, label }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noreferrer"
                aria-label={label}
                className="flex h-9 w-9 items-center justify-center rounded-md border border-border/60 text-muted-foreground hover:text-primary hover:border-primary/60 transition"
              >
                <Icon className="h-4 w-4" />
              </a>
            ))}
            <a
              href="https://x.com/SocialColladome"
              target="_blank"
              rel="noreferrer"
              aria-label="X"
              className="flex h-9 w-9 items-center justify-center rounded-md border border-border/60 text-muted-foreground hover:text-primary hover:border-primary/60 transition font-semibold text-sm"
            >
              𝕏
            </a>
          </div>
        </div>

        <div className="space-y-3">
          <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground font-semibold">Get in touch</div>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-primary" />
              <a href="mailto:hello@colladome.com" className="hover:text-primary">hello@colladome.com</a>
            </li>
            <li className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-primary" />
              <a href="tel:+917727895151" className="hover:text-primary">+91 77278 95151</a>
            </li>
            <li>
              <a
                href="https://colladome.com/contact-us/"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline underline-offset-4"
              >
                Get in touch <ArrowRight className="h-3.5 w-3.5" />
              </a>
            </li>
          </ul>
        </div>

        <div className="space-y-3">
          <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground font-semibold">Product</div>
          <ul className="space-y-2 text-sm">
            <li><Link to="/apply" className="hover:text-primary">Apply for training</Link></li>
            <li><Link to="/privacy" className="hover:text-primary">Privacy Policy</Link></li>
            <li><Link to="/terms" className="hover:text-primary">Terms of Service</Link></li>
            <li><Link to="/contact" className="hover:text-primary">Support</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border/60">
        <div className="max-w-6xl mx-auto px-6 md:px-16 py-5 text-xs text-muted-foreground">
          © 2026 Colladome IT Network Solutions. All rights reserved.
        </div>
      </div>
    </footer>
  );
}

// ---------- Page ----------

function LandingPage() {
  const [isSignedIn, setIsSignedIn] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setIsSignedIn(!!data.session));
  }, []);

  const pulsePath = isSignedIn ? "/dashboard" : "/auth";
  const pulseLabel = isSignedIn ? "Go to dashboard" : "Enter Pulse →";

  const serifStyle = { fontFamily: '"Instrument Serif", ui-serif, Georgia, serif' } as const;

  return (
    <main className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <StickyNav pulsePath={pulsePath} isSignedIn={isSignedIn} />

      {/* ================= HERO ================= */}
      <section className="relative px-6 md:px-16 pt-16 pb-28 md:pt-24 md:pb-36">
        {/* Layered radial glows */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(1200px 700px at 50% -10%, color-mix(in oklab, var(--primary-glow) 55%, transparent), transparent 65%), radial-gradient(900px 600px at 15% 30%, color-mix(in oklab, var(--primary) 30%, transparent), transparent 60%), radial-gradient(900px 600px at 85% 20%, color-mix(in oklab, var(--primary-glow) 30%, transparent), transparent 60%)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-1/3 h-px opacity-40"
          style={{
            background:
              "linear-gradient(90deg, transparent, color-mix(in oklab, var(--primary) 50%, transparent), transparent)",
          }}
        />

        <div className="relative z-10 max-w-5xl mx-auto text-center">
          {/* Built by pill */}
          <div className="flex justify-center mb-8">
            <a
              href="https://colladome.com"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 backdrop-blur px-4 py-1.5 text-xs uppercase tracking-[0.2em] text-foreground/80 hover:border-primary/60 hover:text-foreground transition"
            >
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Built by Colladome
            </a>
          </div>

          <h1
            className="text-5xl md:text-7xl lg:text-[5.5rem] leading-[1.05] tracking-tight font-normal"
            style={serifStyle}
          >
            One Platform.
            <br />
            Every Process.
            <br />
            <span className="text-primary">Total Clarity.</span>
          </h1>

          <figure className="mt-10 max-w-2xl mx-auto">
            <blockquote
              className="text-lg md:text-xl text-foreground/80 leading-relaxed"
              style={{ ...serifStyle, fontStyle: "italic" }}
            >
              "Pulse brings everything our team needs into one place — so we can focus on growing
              the business, not chasing updates."
            </blockquote>
            <figcaption className="mt-4 text-xs uppercase tracking-[0.25em] text-muted-foreground">
              — Colladome Leadership
            </figcaption>
          </figure>

          <div className="mt-12 flex flex-wrap gap-3 items-center justify-center">
            <Link to={pulsePath}>
              <Button size="lg" className="text-base px-8 py-6">{pulseLabel}</Button>
            </Link>
            <Link to={isSignedIn ? "/dashboard" : "/auth"}>
              <Button variant="outline" size="lg" className="text-base px-8 py-6">
                {isSignedIn ? "Open dashboard" : "Sign in"}
              </Button>
            </Link>
          </div>
        </div>

        {/* Floating product visual */}
        <div className="relative z-10 mt-16 md:mt-20 px-2 md:px-4">
          <HeroProductVisual />
        </div>
      </section>

      {/* ================= WHAT IS PULSE ================= */}
      <section className="relative px-6 md:px-16 py-24 md:py-32 border-t border-border/60 bg-surface-2/40">
        <div className="max-w-6xl mx-auto">
          <div className="grid gap-10 md:grid-cols-[1fr_2fr] items-start">
            <p className="uppercase tracking-[0.25em] text-xs text-primary font-semibold">
              What is Colladome Pulse?
            </p>
            <div className="space-y-5 max-w-2xl">
              <p className="text-2xl md:text-3xl leading-snug" style={serifStyle}>
                A unified operating system for how your company actually runs.
              </p>
              <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
                Pulse ties tasks, attendance, learning, finance, and meetings into a single portal —
                so managers stop chasing updates, employees stop hopping between tools, and leadership
                gets one clear source of truth across every function.
              </p>
            </div>
          </div>

          <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <Card
                key={title}
                className="border-border/60 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_50px_-20px_color-mix(in_oklab,var(--primary)_35%,transparent)] hover:border-primary/40"
              >
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

      {/* ================= GALLERY ================= */}
      <section className="relative px-6 md:px-16 py-24 md:py-32 border-t border-border/60">
        <div className="max-w-6xl mx-auto">
          <div className="mb-14 max-w-3xl">
            <p className="uppercase tracking-[0.25em] text-xs text-primary font-semibold mb-4">
              A quick tour
            </p>
            <h2 className="text-4xl md:text-5xl leading-tight tracking-tight" style={serifStyle}>
              All your work. <span className="text-primary">One place.</span>
            </h2>
            <p className="mt-4 text-muted-foreground">
              A glimpse of what employees, managers, and leadership see day-to-day inside Pulse.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            {GALLERY.map((g) => (
              <Card
                key={g.title}
                className="border-border/60 overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_25px_60px_-25px_rgba(0,0,0,0.25)] hover:border-primary/40"
              >
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

      {/* ================= JOIN COLLADOME ================= */}
      <section className="relative px-6 md:px-16 py-24 border-t border-border/60">
        <div className="max-w-5xl mx-auto">
          <div
            className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-background to-background px-8 py-14 md:px-16 md:py-20"
          >
            <div
              aria-hidden
              className="pointer-events-none absolute -top-24 -right-24 h-80 w-80 rounded-full blur-3xl opacity-60"
              style={{ background: "radial-gradient(circle, color-mix(in oklab, var(--primary-glow) 60%, transparent), transparent 70%)" }}
            />
            <div className="relative grid gap-8 md:grid-cols-[2fr_1fr] items-center">
              <div>
                <p className="uppercase tracking-[0.25em] text-xs text-primary font-semibold mb-4">
                  Careers & training
                </p>
                <h2 className="text-4xl md:text-5xl leading-tight tracking-tight" style={serifStyle}>
                  Want to join <span className="text-primary">Colladome?</span>
                </h2>
                <p className="mt-4 text-base md:text-lg text-muted-foreground max-w-xl">
                  We're always looking for people who want to build with us. Apply and our team
                  will be in touch.
                </p>
              </div>
              <div className="flex md:justify-end">
                <Link to="/apply">
                  <Button size="lg" className="text-base px-8 py-6">
                    Apply now <ArrowRight className="ml-1 h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================= CLOSING BANNER ================= */}
      <section className="relative px-6 md:px-16 py-24 md:py-28 bg-sidebar text-sidebar-foreground">
        <div className="max-w-5xl mx-auto text-center space-y-4">
          <h2 className="text-4xl md:text-6xl leading-tight tracking-tight" style={serifStyle}>
            Built to reduce operational chaos.
          </h2>
          <p className="text-lg md:text-xl text-sidebar-foreground/80 max-w-3xl mx-auto">
            So we can focus on what truly matters — growing the business.
          </p>

          <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
            {CLOSER_ITEMS.map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex flex-col items-center gap-2 rounded-lg border border-sidebar-border/60 bg-sidebar-accent/40 px-4 py-5 transition-all duration-300 hover:-translate-y-1 hover:bg-sidebar-accent/60"
              >
                <Icon className="h-5 w-5 text-sidebar-primary" />
                <div className="text-sm font-medium">{label}</div>
              </div>
            ))}
          </div>

          <div className="pt-12">
            <Link to={pulsePath}>
              <Button size="lg" className="text-base px-10 py-6">{pulseLabel}</Button>
            </Link>
          </div>
        </div>
      </section>

      <LandingFooter />
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
