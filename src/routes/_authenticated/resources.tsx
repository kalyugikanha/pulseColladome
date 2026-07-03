import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { BookOpen, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/resources")({
  component: ResourcesPage,
});

function ResourcesPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-bold">Resource Hub</h1>
        <p className="text-muted-foreground text-sm mt-1">Company policies, playbooks, onboarding — all coming soon.</p>
      </header>
      <Card className="overflow-hidden shadow-elevated">
        <CardContent className="p-12 text-center relative gradient-surface">
          <div aria-hidden className="absolute inset-0 opacity-30" />
          <div className="relative">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl gradient-primary shadow-glow mb-6">
              <BookOpen className="h-8 w-8 text-primary-foreground" />
            </div>
            <h2 className="font-display text-2xl font-bold">Coming soon</h2>
            <p className="text-muted-foreground max-w-md mx-auto mt-2">This is where onboarding docs, HR policies, brand assets, and internal playbooks will live. Scaffold ready — content next.</p>
            <div className="mt-6 inline-flex items-center gap-2 text-xs text-muted-foreground"><Sparkles className="h-3 w-3" /> Roadmap · Q3</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
