import { createFileRoute, Outlet, redirect, Link, useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger, Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter } from "@/components/ui/sidebar";
import { LayoutDashboard, Clock, ListChecks, FolderKanban, CalendarRange, CalendarDays, BookOpen, Users, LogOut, Shield, Wallet, Flame, Handshake } from "lucide-react";
import { TopBar } from "@/components/top-bar";
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
  { title: "Projects", url: "/projects", icon: FolderKanban },
  { title: "Leave", url: "/leave", icon: CalendarRange },
  { title: "Team Calendar", url: "/calendar", icon: CalendarDays },
  { title: "Resource Hub", url: "/resources", icon: BookOpen },
] as const;

function AppSidebar({ isAdmin, isSuperAdmin, isFinanceAdmin, fullName, email }: { isAdmin: boolean; isSuperAdmin: boolean; isFinanceAdmin: boolean; fullName: string | null; email: string | null }) {
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
        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname.startsWith("/team")}>
                    <Link to="/team"><Users /><span>Team</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                {isFinanceAdmin && (
                  <>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild isActive={pathname.startsWith("/finances")}>
                        <Link to="/finances"><Wallet /><span>Finances</span></Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild isActive={pathname.startsWith("/project-burn")}>
                        <Link to="/project-burn"><Flame /><span>Project Burn</span></Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </>
                )}
                {isSuperAdmin && (
                  <>
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

              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <div className="flex items-center gap-2 px-1 py-1">
          <Avatar className="h-8 w-8"><AvatarFallback className="bg-primary/20 text-xs">{initials}</AvatarFallback></Avatar>
          <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <div className="truncate text-xs font-medium">{fullName ?? "Member"}</div>
            <div className="truncate text-[10px] text-muted-foreground">{email}</div>
          </div>
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
    if (user?.mustChangePassword && pathname !== "/change-password") {
      router.navigate({ to: "/change-password", replace: true });
    }
  }, [user, pathname, router]);

  if (isLoading || !user) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading workspace…</div>;
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar isAdmin={user.isAdmin} isSuperAdmin={user.isSuperAdmin} isFinanceAdmin={user.isFinanceAdmin} fullName={user.fullName} email={user.email} />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center gap-3 border-b border-border bg-surface/60 backdrop-blur px-4 sticky top-0 z-10">
            <SidebarTrigger />
            <div className="flex-1" />
            <TopBar realUserId={user.realId} isSuperAdmin={user.realIsSuperAdmin} viewingAs={user.viewingAs} />
          </header>
          <main className="flex-1 p-4 md:p-8 max-w-[1400px] w-full mx-auto"><Outlet /></main>
        </div>
      </div>
    </SidebarProvider>
  );
}
