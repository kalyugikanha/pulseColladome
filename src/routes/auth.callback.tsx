import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

function sanitizeNext(next: string | undefined | null): string | null {
  if (!next) return null;
  if (!next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}

export const Route = createFileRoute("/auth/callback")({
  validateSearch: (s: Record<string, unknown>): { next?: string } => {
    return typeof s.next === "string" ? { next: s.next } : {};
  },
  component: AuthCallback,
});

function AuthCallback() {
  const router = useRouter();
  const { next } = Route.useSearch();

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 10; // ~2s total

    async function poll() {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) {
        let stored: string | null = null;
        try { stored = sessionStorage.getItem("pulse:auth:next"); } catch { /* ignore */ }
        try { sessionStorage.removeItem("pulse:auth:next"); } catch { /* ignore */ }
        const target = sanitizeNext(next) ?? sanitizeNext(stored) ?? "/dashboard";
        router.navigate({ href: target, replace: true });
        return;
      }
      attempts += 1;
      if (attempts >= maxAttempts) {
        toast.error("Sign-in didn't complete — please try again.");
        router.navigate({ to: "/auth", replace: true });
        return;
      }
      setTimeout(poll, 200);
    }

    void poll();
    return () => {
      cancelled = true;
    };
  }, [router, next]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <Card className="w-full max-w-sm shadow-elevated">
        <CardContent className="flex flex-col items-center gap-4 py-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <div className="text-sm text-muted-foreground">Signing you in…</div>
        </CardContent>
      </Card>
    </div>
  );
}
