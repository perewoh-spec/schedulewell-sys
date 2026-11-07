import { useEffect, useState } from "react";
import {
  LayoutDashboard, Calendar, FileText, Users, Shield, Bell, LogOut, Activity, BarChart3, Heart, UserCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { user, hasRole, isAdmin, isStaff, profile, signOut } = useAuth();
  const location = useLocation();
  const [unread, setUnread] = useState(0);

  // Unread notification count, kept live through Supabase realtime.
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true })
        .eq("user_id", user.id).eq("is_read", false);
      setUnread(count ?? 0);
    };
    load();
    const channel = supabase
      .channel(`sidebar-notifications-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // Nurses have no access to medical records, so the page would always be empty for them.
  const canViewRecords = !isStaff || hasRole("doctor") || isAdmin;

  const mainItems = [
    { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, show: true },
    { title: "Appointments", url: "/appointments", icon: Calendar, show: true },
    { title: "Medical Records", url: "/records", icon: FileText, show: canViewRecords },
    { title: "Patients", url: "/patients", icon: Users, show: isStaff },
    { title: "Notifications", url: "/notifications", icon: Bell, show: true, badge: unread },
    { title: "My Profile", url: "/profile", icon: UserCircle, show: true },
  ];

  const adminItems = [
    { title: "User Management", url: "/admin/users", icon: Shield, show: isAdmin },
    { title: "Audit Logs", url: "/admin/audit", icon: Activity, show: isAdmin },
    { title: "Reports", url: "/admin/reports", icon: BarChart3, show: isAdmin },
  ];

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>
            <div className="flex items-center gap-2">
              <Heart className="h-4 w-4 text-sidebar-primary" />
              {!collapsed && <span className="font-bold tracking-tight">Harmony Health Hub</span>}
            </div>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.filter(i => i.show).map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink to={item.url} end={item.url === "/dashboard"} className="hover:bg-sidebar-accent/50" activeClassName="bg-sidebar-accent text-sidebar-primary font-medium">
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span className="flex-1">{item.title}</span>}
                      {!collapsed && !!item.badge && (
                        <span className="ml-auto rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold leading-none text-primary-foreground">
                          {item.badge > 99 ? "99+" : item.badge}
                        </span>
                      )}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>{!collapsed && "Administration"}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminItems.filter(i => i.show).map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink to={item.url} className="hover:bg-sidebar-accent/50" activeClassName="bg-sidebar-accent text-sidebar-primary font-medium">
                        <item.icon className="mr-2 h-4 w-4" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter>
        <div className="p-2">
          {!collapsed && profile && (
            <p className="text-xs text-sidebar-foreground/60 mb-2 truncate">{profile.full_name || profile.email}</p>
          )}
          <Button variant="ghost" size="sm" onClick={signOut} className="w-full justify-start text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent">
            <LogOut className="h-4 w-4 mr-2" />
            {!collapsed && "Sign Out"}
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
