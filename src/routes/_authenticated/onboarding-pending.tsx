import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock3, LogOut, Pencil } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated/onboarding-pending")({
  component: OnboardingPendingPage,
});

function OnboardingPendingPage() {
  const { data: user } = useCurrentUser();
  const router = useRouter();
  const qc = useQueryClient();

  // If already approved, jump to dashboard
  useEffect(() => {
    if (user?.onboardingApprovedAt) router.navigate({ to: "/dashboard", replace: true });
    if (user && !user.onboardingSubmittedAt && !user.onboardingApprovedAt) router.navigate({ to: "/complete-onboarding", replace: true });
  }, [user, router]);

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="max-w-2xl mx-auto py-16">
      <Card className="border-primary/30">
        <CardHeader>
          <CardTitle className="font-display text-2xl flex items-center gap-2">
            <Clock3 className="h-6 w-6 text-primary" /> Waiting for HR approval
          </CardTitle>
          <CardDescription>
            Thanks for submitting your onboarding, {user?.fullName ?? "there"}! An HR admin will review your details and screenshots and unlock your portal access.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>You'll get access to Pulse (tasks, punch, leave, calendar, etc.) as soon as HR approves your submission.</p>
          <p>If HR needs a change, they'll send it back with a note and you can edit and re-submit.</p>
          <div className="flex items-center gap-2 pt-2">
            <Button asChild variant="outline"><Link to="/complete-onboarding"><Pencil className="h-4 w-4 mr-1" /> Edit submission</Link></Button>
            <Button variant="ghost" onClick={signOut}><LogOut className="h-4 w-4 mr-1" /> Sign out</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
