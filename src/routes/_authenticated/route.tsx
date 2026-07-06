import { createFileRoute, Outlet, redirect, Link, useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger, Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter } from "@/components/ui/sidebar";
import { LayoutDashboard, Clock, ListChecks, FolderKanban, CalendarRange, CalendarDays, BookOpen, Users, LogOut, Shield, Wallet, Flame, Handshake, TableProperties, Video, UserPlus, Repeat, Layers, IdCard, ClipboardCheck } from "lucide-react";
import { TopBar } from "@/components/top-bar";
import { ViewAsBanner } from "@/components/view-as-banner";
import { AssistantDock } from "@/components/assistant/AssistantDock";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import logo from "@/assets/colladome-logo.png.asset.json";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

const employeeItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Punch In/Out", url: "/punch", icon: Clock },
  { title: "My Tasks", url: "/tasks", icon: ListChecks },
  { title: "My Timesheet", url: "/my-timesheet", icon: TableProperties },
  { title: "Projects", url: "/projects", icon: FolderKanban },
  { title: "Leave", url: "/leave", icon: CalendarRange },
  { title: "Team Calendar", url: "/calendar", icon: CalendarDays },
  { title: "Resource Hub", url: "/resources", icon: BookOpen },
] as const;

function AppSidebar({ isAdmin, isSuperAdmin, isFinanceAdmin, isHrAdmin, canManageProjects, isDepartmentHead, isReportingManager, fullName, email }: { isAdmin: boolean; isSuperAdmin: boolean; isFinanceAdmin: boolean; isHrAdmin: boolean; canManageProjects: boolean; isDepartmentHead: boolean; isReportingManager: boolean; fullName: string | null; email: string | null }) {
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
              {employeeItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={pathname === item.url || pathname.startsWith(item.url + "/")}>
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
        {(isAdmin || canManageProjects || isHrAdmin || isDepartmentHead || isReportingManager) && (
          <SidebarGroup>
            <SidebarGroupLabel>Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {(isAdmin || isDepartmentHead || isReportingManager) && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={pathname.startsWith("/attendance")}>
                      <Link to="/attendance"><Users /><span>Attendance</span></Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                {(isSuperAdmin || isHrAdmin || isDepartmentHead || isReportingManager) && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={pathname.startsWith("/directory")}>
                      <Link to="/directory"><IdCard /><span>Employee Directory</span></Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                {isFinanceAdmin && (
                  <>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild isActive={pathname.startsWith("/finances")}>
                        <Link to="/finances"><Wallet /><span>Finances</span></Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </>
                )}
                {(isFinanceAdmin || isDepartmentHead || isReportingManager) && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={pathname.startsWith("/project-burn")}>
                      <Link to="/project-burn"><Flame /><span>Project Burn</span></Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                {(canManageProjects || isDepartmentHead || isReportingManager) && (
                  <>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild isActive={pathname.startsWith("/timesheet")}>
                        <Link to="/timesheet"><TableProperties /><span>Timesheet</span></Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild isActive={pathname.startsWith("/tasks-overview")}>
                        <Link to="/tasks-overview"><ListChecks /><span>Task Overview</span></Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild isActive={pathname.startsWith("/task-templates")}>
                        <Link to="/task-templates"><Repeat /><span>Task Templates</span></Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </>
                )}

                {(isSuperAdmin || isHrAdmin) && (
                  <>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild isActive={pathname.startsWith("/hr/leave")}>
                        <Link to="/hr/leave"><CalendarRange /><span>HR Leaves</span></Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild isActive={pathname.startsWith("/hr/onboarding")}>
                        <Link to="/hr/onboarding"><ClipboardCheck /><span>Onboarding approvals</span></Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild isActive={pathname.startsWith("/onboarding")}>
                        <Link to="/onboarding"><UserPlus /><span>Onboarding</span></Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </>
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
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild isActive={pathname.startsWith("/access")}>
                        <Link to="/access"><Shield /><span>Access & Roles</span></Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </>
                )}
                {(isSuperAdmin || isDepartmentHead || isReportingManager) && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={pathname.startsWith("/admin/taxonomy")}>
                      <Link to="/admin/taxonomy"><Layers /><span>Taxonomy</span></Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}



              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
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
    if (!user.mustChangePassword && !bypassOnboarding && user.onboardingRequired && !user.onboardingApprovedAt) {
      if (!user.onboardingSubmittedAt) {
        if (pathname !== "/complete-onboarding" && pathname !== "/change-password") {
          router.navigate({ to: "/complete-onboarding", replace: true });
        }
      } else {
        if (pathname !== "/onboarding-pending" && pathname !== "/complete-onboarding" && pathname !== "/change-password") {
          router.navigate({ to: "/onboarding-pending", replace: true });
        }
      }
    }
  }, [user, pathname, router]);

  if (isLoading || !user) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading workspace…</div>;
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar isAdmin={user.isAdmin} isSuperAdmin={user.isSuperAdmin} isFinanceAdmin={user.isFinanceAdmin} isHrAdmin={user.isHrAdmin} canManageProjects={user.canManageProjects} isDepartmentHead={user.isDepartmentHead} isReportingManager={user.isReportingManager} fullName={user.fullName} email={user.email} />
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
