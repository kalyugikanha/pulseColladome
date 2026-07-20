import { createFileRoute, Outlet, redirect, Link, useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger, Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter } from "@/components/ui/sidebar";
import { LayoutDashboard, Clock, ListChecks, FolderKanban, CalendarRange, CalendarDays, BookOpen, Users, LogOut, Shield, Wallet, Flame, Handshake, TableProperties, Video, UserPlus, Repeat, Layers, IdCard, ClipboardCheck, Star, BarChart3, Briefcase, Megaphone, Workflow, Cpu, PartyPopper, ClipboardList } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { TopBar } from "@/components/top-bar";
import { ViewAsBanner } from "@/components/view-as-banner";
import { AssistantDock } from "@/components/assistant/AssistantDock";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import logo from "@/assets/colladome-logo.png.asset.json";
import { APP_VERSION, BUILD_ID } from "@/lib/version";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

type NavItem = { title: string; url: string; icon: typeof LayoutDashboard; match?: string };

function AppSidebar({ isAdmin, isSuperAdmin, isFinanceAdmin, isHrAdmin, isLearningAdmin, canManageProjects, isDepartmentHead, isReportingManager, headOfDepartments, isTrainee, userId, fullName, email }: { isAdmin: boolean; isSuperAdmin: boolean; isFinanceAdmin: boolean; isHrAdmin: boolean; isLearningAdmin: boolean; canManageProjects: boolean; isDepartmentHead: boolean; isReportingManager: boolean; headOfDepartments: string[]; isTrainee: boolean; userId: string; fullName: string | null; email: string | null }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const router = useRouter();
  const qc = useQueryClient();


  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true });
  }

  const initials = (fullName ?? email ?? "?").split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  const workspaceItems: NavItem[] = isTrainee
    ? [
        { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
        { title: "Tasks", url: "/tasks", icon: ListChecks, match: "/tasks|/board" },
        { title: "Learning", url: "/learning", icon: BookOpen, match: "/learning" },
      ]
    : [
        { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
        { title: "Tasks", url: "/tasks", icon: ListChecks, match: "/tasks|/board" },
        { title: "Stand-up", url: "/standup", icon: ClipboardList },
        { title: "Attendance", url: "/attendance", icon: Clock, match: "/attendance|/punch|/timesheet|/my-timesheet" },
        { title: "Events", url: "/events", icon: PartyPopper },
        { title: "Projects", url: "/projects", icon: FolderKanban, match: "/projects" },
        { title: "Team", url: "/team", icon: Users, match: "/team|/leave|/calendar|/directory" },
        { title: "Performance", url: "/performance", icon: Star },
        { title: "Learning", url: "/learning", icon: BookOpen, match: "/learning" },
        { title: "Resource Hub", url: "/resources", icon: Layers },
      ];

  const showAdminGroup = !isTrainee && (isAdmin || isSuperAdmin || isHrAdmin || isFinanceAdmin || isReportingManager || isLearningAdmin);
  const isActive = (item: NavItem) => {
    if (item.match) return item.match.split("|").some((p) => pathname === p || pathname.startsWith(p + "/"));
    return pathname === item.url || pathname.startsWith(item.url + "/");
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <Link to="/dashboard" className="flex items-center gap-2 px-2 py-1">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-black overflow-hidden">
            <img src={logo.url} alt="Colladome" className="h-7 w-7 object-contain" />
          </div>
          <div className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="font-display text-sm font-bold">Colladome Pulse</span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Team OS</span>
          </div>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {workspaceItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={isActive(item)}>
                    <Link to={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {showAdminGroup && (
          <SidebarGroup>
            <SidebarGroupLabel>Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {(isAdmin || isSuperAdmin || isReportingManager) && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={pathname.startsWith("/workflows")}>
                      <Link to="/workflows"><Workflow /><span>Workflows</span></Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                {isFinanceAdmin && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={pathname.startsWith("/finances")}>
                      <Link to="/finances"><Wallet /><span>Finances</span></Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                {(isSuperAdmin || isHrAdmin) && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={pathname.startsWith("/hr-admin") || pathname.startsWith("/hr/") || pathname.startsWith("/onboarding") || pathname.startsWith("/access")}>
                      <Link to="/hr-admin"><ClipboardCheck /><span>HR Admin</span></Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                {isLearningAdmin && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={pathname.startsWith("/learning-admin")}>
                      <Link to="/learning-admin"><BookOpen /><span>Learning Admin</span></Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}


                {isSuperAdmin && (
                  <>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild isActive={pathname.startsWith("/meetings")}>
                        <Link to="/meetings"><Video /><span>Team Meetings</span></Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild isActive={pathname.startsWith("/vendors")}>
                        <Link to="/vendors"><Handshake /><span>Vendors</span></Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <div className="px-2 pt-1 pb-0.5 text-[10px] uppercase tracking-wider text-muted-foreground group-data-[collapsible=icon]:hidden">
          v{APP_VERSION} · {BUILD_ID} IST
        </div>
        <div className="flex items-center gap-2 px-1 py-1">
          <Link to="/complete-onboarding" className="flex items-center gap-2 min-w-0 flex-1 rounded-md hover:bg-sidebar-accent px-1 py-1" aria-label="My profile">
            <Avatar className="h-8 w-8"><AvatarFallback className="bg-primary/20 text-xs">{initials}</AvatarFallback></Avatar>
            <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
              <div className="truncate text-xs font-medium">{fullName ?? "Member"}</div>
              <div className="truncate text-[10px] text-muted-foreground">My profile</div>
            </div>
          </Link>
          <Button variant="ghost" size="icon" onClick={signOut} className="group-data-[collapsible=icon]:hidden" aria-label="Sign out">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

function AuthenticatedLayout() {
  const { data: user, isLoading } = useCurrentUser();
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });


  useEffect(() => {
    if (!user) return;
    if (user.mustChangePassword && pathname !== "/change-password") {
      router.navigate({ to: "/change-password", replace: true });
      return;
    }
    const bypassOnboarding = user.isSuperAdmin || user.isHrAdmin;
    if (!user.mustChangePassword && !bypassOnboarding && user.onboardingGateBlocked) {
      const needsInput = user.onboardingAnyRejected || user.onboardingAnyDraft;
      const target = needsInput ? "/complete-onboarding" : "/onboarding-pending";
      if (pathname !== "/complete-onboarding" && pathname !== "/onboarding-pending" && pathname !== "/change-password") {
        router.navigate({ to: target, replace: true });
      } else if (pathname === "/onboarding-pending" && needsInput) {
        router.navigate({ to: "/complete-onboarding", replace: true });
      }
    }



  }, [user, pathname, router]);

  if (isLoading || !user) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading workspace…</div>;
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar isAdmin={user.isAdmin} isSuperAdmin={user.isSuperAdmin} isFinanceAdmin={user.isFinanceAdmin} isHrAdmin={user.isHrAdmin} isLearningAdmin={user.isLearningAdmin} canManageProjects={user.canManageProjects} isDepartmentHead={user.isDepartmentHead} isReportingManager={user.isReportingManager} headOfDepartments={user.headOfDepartments} userId={user.realId} fullName={user.fullName} email={user.email} />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center gap-3 border-b border-border bg-surface/60 backdrop-blur px-4 sticky top-0 z-10">
            <SidebarTrigger />
            <div className="flex-1" />
            <TopBar realUserId={user.realId} isSuperAdmin={user.realIsSuperAdmin} viewingAs={user.viewingAs} />
          </header>
          <ViewAsBanner />
          <main className="flex-1 p-4 md:p-8 max-w-[1400px] w-full mx-auto"><Outlet /></main>
        </div>
        <AssistantDock />
      </div>
    </SidebarProvider>
  );
}
