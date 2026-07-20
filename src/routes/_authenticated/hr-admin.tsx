import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useCurrentUser } from "@/hooks/use-current-user";
import { HrLeavePage } from "./hr.leave";
import { HrOnboardingPage } from "./hr.onboarding";
import { OnboardingPage } from "./onboarding";
import { AccessPage } from "./access";
import { HrTraineeApplicationsPage } from "@/components/hr/trainee-applications-panel";

const searchSchema = z.object({
  tab: fallback(z.string(), "leaves").default("leaves"),
});

export const Route = createFileRoute("/_authenticated/hr-admin")({
  validateSearch: zodValidator(searchSchema),
  beforeLoad: () => {
    // Auth is enforced by parent _authenticated route; per-panel role checks still run inside components.
  },
  component: HrAdminPage,
});

const VALID = ["leaves", "approvals", "onboarding", "trainees", "access"] as const;

function HrAdminPage() {
  const { data: me } = useCurrentUser();
  const { tab } = Route.useSearch();
  const navigate = useNavigate({ from: "/hr-admin" });

  if (me && !me.isSuperAdmin && !me.isHrAdmin) throw redirect({ to: "/dashboard" });

  const canAccess = !!me?.isSuperAdmin;
  const canTrainees = !!(me?.isSuperAdmin || me?.isHrAdmin);
  const active = (VALID as readonly string[]).includes(tab) ? tab : "leaves";
  const effective = active === "access" && !canAccess ? "leaves" : active;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">HR Admin</h1>
        <p className="text-sm text-muted-foreground">Leaves, onboarding, and access management.</p>
      </div>
      <Tabs
        value={effective}
        onValueChange={(v) => navigate({ search: { tab: v }, replace: true })}
      >
        <TabsList>
          <TabsTrigger value="leaves">Leaves</TabsTrigger>
          <TabsTrigger value="approvals">Onboarding Approvals</TabsTrigger>
          <TabsTrigger value="onboarding">Onboarding</TabsTrigger>
          {canTrainees && <TabsTrigger value="trainees">Trainee Applications</TabsTrigger>}
          {canAccess && <TabsTrigger value="access">Access &amp; Roles</TabsTrigger>}
        </TabsList>
        <TabsContent value="leaves" className="mt-4"><HrLeavePage /></TabsContent>
        <TabsContent value="approvals" className="mt-4"><HrOnboardingPage /></TabsContent>
        <TabsContent value="onboarding" className="mt-4"><OnboardingPage /></TabsContent>
        {canTrainees && <TabsContent value="trainees" className="mt-4"><HrTraineeApplicationsPage /></TabsContent>}
        {canAccess && <TabsContent value="access" className="mt-4"><AccessPage /></TabsContent>}
      </Tabs>

    </div>
  );
}
