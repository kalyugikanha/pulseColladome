import { useEffect, useRef } from "react";
import confetti from "canvas-confetti";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

export function WelcomeOverlay({ name, onDismiss }: { name: string | null; onDismiss: () => void }) {
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;

    const duration = 6000;
    const end = Date.now() + duration;
    const colors = ["#f59e0b", "#8b5cf6", "#ec4899", "#22d3ee", "#34d399", "#f43f5e"];

    (function frame() {
      confetti({ particleCount: 4, angle: 60, spread: 70, origin: { x: 0, y: 0.7 }, colors });
      confetti({ particleCount: 4, angle: 120, spread: 70, origin: { x: 1, y: 0.7 }, colors });
      if (Date.now() < end) requestAnimationFrame(frame);
    })();

    confetti({ particleCount: 160, spread: 100, origin: { y: 0.4 }, colors });

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prevOverflow; };
  }, []);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-md animate-fade-in">
      <div className="relative mx-4 max-w-3xl w-full rounded-2xl border border-white/10 bg-gradient-to-br from-indigo-950 via-purple-950 to-fuchsia-950 p-8 md:p-12 text-center shadow-2xl animate-scale-in overflow-hidden">
        <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-fuchsia-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-indigo-500/20 blur-3xl" />

        <div className="relative flex flex-col items-center gap-6">
          <div className="flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-4 py-1.5 text-xs uppercase tracking-[0.2em] text-white/80">
            <Sparkles className="h-3.5 w-3.5" /> A little something new
          </div>

          <h1 className="font-display text-4xl md:text-6xl font-bold bg-gradient-to-r from-amber-200 via-fuchsia-300 to-cyan-300 bg-clip-text text-transparent leading-tight">
            Welcome{name ? `, ${name.split(" ")[0]}` : ""}, to the world of AI
          </h1>

          <p className="text-lg md:text-xl text-white/90 max-w-2xl">
            To organize you better and make you more productive — an initiative by the
            <span className="font-semibold text-white"> Admin team @ Colladome</span>.
          </p>

          <p className="text-sm md:text-base text-white/70 max-w-2xl italic">
            Thanks for the ideas from <span className="text-white/90 font-medium">Kanishka, Sarita, Sweksha &amp; Aarti</span>. Let&apos;s get rolling! 🚀
          </p>

          <Button
            size="lg"
            onClick={onDismiss}
            className="mt-4 bg-white text-indigo-950 hover:bg-white/90 font-semibold px-8"
          >
            Let&apos;s go
          </Button>
        </div>
      </div>
    </div>
  );
}
