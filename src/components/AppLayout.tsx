import { ReactNode } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { isDemoEmail } from "@/lib/demo";

export function AppLayout({ children }: { children: ReactNode }) {
  const { roles, profile, user } = useAuth();
  const isDemo = isDemoEmail(user?.email);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center border-b bg-card px-4 gap-3">
            <SidebarTrigger />
            <div className="flex-1" />
            <div className="flex items-center gap-2">
              {roles.map((role) => (
                <Badge key={role} variant="secondary" className="capitalize text-xs">
                  {role}
                </Badge>
              ))}
              <span className="text-sm text-muted-foreground">{profile?.full_name || profile?.email}</span>
            </div>
          </header>
          {isDemo && (
            <div className="border-b bg-warning/10 px-4 py-1.5 text-center text-xs text-foreground">
              <strong>Demo mode:</strong> everything here is placeholder data, and no real accounts or records are shown. This account is
              shared, so other visitors can see your changes. Sign out to try another role.
            </div>
          )}
          <main className="flex-1 p-6 overflow-auto animate-fade-in">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
