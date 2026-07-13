import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallback,
});

function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 10; // ~2s total

    async function poll() {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) {
        router.navigate({ to: "/dashboard", replace: true });
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
  }, [router]);

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
