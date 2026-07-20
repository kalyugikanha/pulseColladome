import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import logo from "@/assets/colladome-logo.png.asset.json";

export const Route = createFileRoute("/auth")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) throw redirect({ to: "/dashboard" });
  },
  component: AuthPage,
});

function AuthPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleGoogle() {
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: `${window.location.origin}/auth/callback`,
      extraParams: { prompt: "select_account" },
    });
    if (result.error) {
      const msg = result.error.message || "Google sign-in failed";
      toast.error(msg);
      setLoading(false);
      return;
    }
    if (result.redirected) return;
    router.navigate({ to: "/dashboard", replace: true });
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      <div className="hidden lg:flex relative overflow-hidden gradient-surface p-12 flex-col justify-between border-r border-border">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-black shadow-glow overflow-hidden">
            <img src={logo.url} alt="Colladome" className="h-10 w-10 object-contain" />
          </div>
          <div>
            <div className="font-display text-lg font-bold">Colladome Pulse</div>
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Internal Team OS</div>
          </div>
        </div>
        <div className="space-y-4">
          <h1 className="font-display text-4xl font-bold leading-tight">Where the team's day runs.</h1>
          <p className="text-muted-foreground max-w-md">Punch in, log the work, track leave, and keep every project in view — the internal operating system for Colladome.</p>
          <div className="grid grid-cols-3 gap-3 pt-4 max-w-md">
            {["Attendance", "Tasks", "Leave"].map((t) => (
              <div key={t} className="rounded-lg border border-border bg-surface p-3">
                <div className="text-xs text-muted-foreground">Module</div>
                <div className="text-sm font-medium">{t}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="text-xs text-muted-foreground">ISO 9001 · CMMI Level 3 · AI Shift</div>
        <div aria-hidden className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
      </div>

      <div className="flex items-center justify-center p-6">
        <Card className="w-full max-w-md shadow-elevated">
          <CardHeader>
            <CardTitle className="font-display">Sign in to Pulse</CardTitle>
            <CardDescription>Sign in with the Google account your admin registered for you.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
              Accounts are invite-only. If your Google account hasn't been registered yet, please contact your administrator.
            </div>
            <Button variant="outline" className="w-full" onClick={handleGoogle} disabled={loading}>
              <svg className="mr-2 h-4 w-4" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
              Continue with Google
            </Button>
            <p className="text-xs text-muted-foreground">
              Google Calendar sync is connected separately from the Team Calendar page.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
