import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const QUOTES: { text: string; author: string }[] = [
  { text: "The best way to predict the future is to build it.", author: "Alan Kay" },
  { text: "In a world reshaped by AI, the brave don't wait — they ship.", author: "Colladome" },
  { text: "Adaptation is the new intelligence.", author: "Colladome" },
  { text: "The people who are crazy enough to think they can change the world are the ones who do.", author: "Steve Jobs" },
  { text: "Do not go where the path may lead; go instead where there is no path and leave a trail.", author: "Ralph Waldo Emerson" },
  { text: "We shape our tools, and thereafter our tools shape us.", author: "Marshall McLuhan" },
  { text: "The future belongs to those who learn more skills and combine them in creative ways.", author: "Robert Greene" },
  { text: "Ideas are easy. Execution is everything.", author: "John Doerr" },
  { text: "If you're not embarrassed by v1, you shipped too late.", author: "Reid Hoffman" },
  { text: "Progress is impossible without change; and those who cannot change their minds cannot change anything.", author: "George Bernard Shaw" },
  { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
  { text: "Fall in love with the problem, not the solution.", author: "Uri Levine" },
  { text: "Speed is the ultimate weapon in business.", author: "Andrew Carnegie" },
  { text: "Great things are done by a series of small things brought together.", author: "Vincent Van Gogh" },
  { text: "Don't watch the clock; do what it does. Keep going.", author: "Sam Levenson" },
  { text: "The obstacle is the way.", author: "Ryan Holiday" },
  { text: "Machines think faster. Humans think braver.", author: "Colladome" },
  { text: "Every era's winners are those who trusted the new tools first.", author: "Colladome" },
  { text: "You don't rise to the level of your goals; you fall to the level of your systems.", author: "James Clear" },
  { text: "Build the thing you wish existed.", author: "Colladome" },
  { text: "The cost of being wrong is less than the cost of doing nothing.", author: "Seth Godin" },
  { text: "Innovation distinguishes between a leader and a follower.", author: "Steve Jobs" },
  { text: "Momentum beats motivation.", author: "Colladome" },
  { text: "The future is already here — it's just not evenly distributed.", author: "William Gibson" },
  { text: "What you do every day matters more than what you do once in a while.", author: "Gretchen Rubin" },
  { text: "Ship. Learn. Ship again.", author: "Colladome" },
  { text: "Bet on curiosity. It compounds.", author: "Colladome" },
  { text: "Discipline is choosing between what you want now and what you want most.", author: "Abraham Lincoln" },
  { text: "In the age of AI, taste is the new competitive edge.", author: "Colladome" },
  { text: "You are the average of the courage in the room. Raise it.", author: "Colladome" },
  { text: "Do the work. The doors will open.", author: "Colladome" },
];

function useDailyQuote() {
  return useMemo(() => {
    const now = new Date();
    const start = Date.UTC(now.getFullYear(), 0, 0);
    const day = Math.floor((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - start) / 86400000);
    const idx = day % QUOTES.length;
    const dateLabel = now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
    return { ...QUOTES[idx], dateLabel };
  }, []);
}

function LandingPage() {
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);
  const quote = useDailyQuote();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard" });
      else setChecked(true);
    });
  }, [navigate]);

  if (!checked) {
    return <div className="min-h-screen bg-background" />;
  }

  return (
    <main className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* Hero */}
      <section className="relative min-h-screen flex flex-col justify-center px-6 md:px-16 py-24">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            background:
              "radial-gradient(1200px 600px at 20% 10%, color-mix(in oklab, var(--primary-glow) 35%, transparent), transparent 60%), radial-gradient(900px 500px at 90% 90%, color-mix(in oklab, var(--primary) 25%, transparent), transparent 60%)",
          }}
        />
        <nav className="relative z-10 flex items-center justify-between mb-16">
          <div className="font-semibold tracking-tight text-lg">Colladome<span className="text-primary">.</span>Pulse</div>
          <div className="flex gap-3">
            <Link to="/auth">
              <Button variant="ghost" size="sm">Sign in</Button>
            </Link>
          </div>
        </nav>

        <div className="relative z-10 max-w-5xl animate-in fade-in slide-in-from-bottom-4 duration-1000">
          <p className="uppercase tracking-[0.25em] text-xs md:text-sm text-primary font-semibold mb-6">
            A note from the founder
          </p>
          <h1
            className="text-5xl md:text-7xl lg:text-8xl leading-[1.05] tracking-tight font-normal"
            style={{ fontFamily: '"Instrument Serif", ui-serif, Georgia, serif' }}
          >
            The world is being <em className="text-primary">rewritten</em> by AI.
            <br />
            We're not watching — we're the ones <em className="text-primary">holding the pen</em>.
          </h1>
          <p className="mt-10 max-w-2xl text-lg md:text-xl text-muted-foreground leading-relaxed">
            Everything is changing. The tools, the rules, the pace. At Colladome, we don't wait for the future to arrive —
            we adapt first, build in the open, and advocate for the shift. This is where that work lives.
          </p>

          <div className="mt-12 flex flex-wrap gap-4">
            <Link to="/auth">
              <Button size="lg" className="text-base px-8 py-6">Enter Pulse →</Button>
            </Link>
            <a href="#manifesto">
              <Button size="lg" variant="outline" className="text-base px-8 py-6">Read the vision</Button>
            </a>
          </div>
        </div>

        <div className="relative z-10 mt-24 text-xs uppercase tracking-[0.3em] text-muted-foreground">
          Scroll ↓
        </div>
      </section>

      {/* Daily Quote */}
      <section className="relative px-6 md:px-16 py-32 border-t border-border/60">
        <div className="max-w-5xl mx-auto">
          <p className="uppercase tracking-[0.25em] text-xs text-primary font-semibold mb-8">
            Quote of the day · {quote.dateLabel}
          </p>
          <blockquote
            className="text-4xl md:text-6xl lg:text-7xl leading-[1.15] tracking-tight"
            style={{ fontFamily: '"Instrument Serif", ui-serif, Georgia, serif', fontStyle: "italic" }}
          >
            <span className="text-primary/60 mr-2">"</span>
            {quote.text}
            <span className="text-primary/60 ml-1">"</span>
          </blockquote>
          <p className="mt-8 text-sm md:text-base text-muted-foreground tracking-wide">
            — {quote.author}
          </p>
        </div>
      </section>

      {/* Manifesto */}
      <section id="manifesto" className="relative px-6 md:px-16 py-32 border-t border-border/60 bg-surface-2/40">
        <div className="max-w-5xl mx-auto space-y-10">
          <p className="uppercase tracking-[0.25em] text-xs text-primary font-semibold">The Colladome manifesto</p>

          <p className="text-3xl md:text-5xl leading-tight" style={{ fontFamily: '"Instrument Serif", ui-serif, Georgia, serif' }}>
            We believe the next decade belongs to the <em className="text-primary">brave, curious, and fast</em>.
          </p>
          <p className="text-2xl md:text-4xl leading-tight max-w-3xl md:ml-16" style={{ fontFamily: '"Instrument Serif", ui-serif, Georgia, serif' }}>
            We adopt AI not to replace people, but to <em className="text-primary">amplify</em> them.
          </p>
          <p className="text-2xl md:text-4xl leading-tight max-w-3xl md:ml-32" style={{ fontFamily: '"Instrument Serif", ui-serif, Georgia, serif' }}>
            We ship early, learn loud, and share what we learn — because the future is a <em className="text-primary">team sport</em>.
          </p>
          <p className="text-2xl md:text-4xl leading-tight max-w-3xl md:ml-48" style={{ fontFamily: '"Instrument Serif", ui-serif, Georgia, serif' }}>
            We are not chasing the future. We are <em className="text-primary">building it</em>.
          </p>

          <p className="pt-8 text-sm uppercase tracking-[0.3em] text-muted-foreground">— Founder, Colladome</p>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="relative px-6 md:px-16 py-32 border-t border-border/60 text-center">
        <h2
          className="text-4xl md:text-6xl leading-tight tracking-tight max-w-3xl mx-auto"
          style={{ fontFamily: '"Instrument Serif", ui-serif, Georgia, serif' }}
        >
          Build the future <em className="text-primary">with us</em>.
        </h2>
        <div className="mt-10">
          <Link to="/auth">
            <Button size="lg" className="text-base px-10 py-6">Enter Pulse</Button>
          </Link>
        </div>
        <p className="mt-16 text-xs uppercase tracking-[0.3em] text-muted-foreground">
          © {new Date().getFullYear()} Colladome
        </p>
      </section>
    </main>
  );
}

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Colladome Pulse — Build the future with AI" },
      {
        name: "description",
        content:
          "A founder's note from Colladome: in a world rewritten by AI, we adapt first and build the future. Enter Pulse — our internal operating system.",
      },
      { property: "og:title", content: "Colladome Pulse — Build the future with AI" },
      {
        property: "og:description",
        content:
          "In a world rewritten by AI, we don't watch — we hold the pen. A daily dose of vision from Colladome.",
      },
    ],
  }),
  component: LandingPage,
});
