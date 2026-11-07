import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bell, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";

export default function Notifications() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<Tables<"notifications">[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = async () => {
    setLoading(true);
    const { data } = await supabase.from("notifications").select("*").order("created_at", { ascending: false });
    setNotifications(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    fetch();
    if (!user) return;
    // New notifications appear without reloading the page.
    const channel = supabase
      .channel(`notifications-page-${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, () => fetch())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const markRead = async (id: string) => {
    const { error } = await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    fetch();
  };

  const markAllRead = async () => {
    const { error } = await supabase.from("notifications").update({ is_read: true }).eq("user_id", user!.id).eq("is_read", false);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    fetch();
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Bell className="h-6 w-6 text-primary" /> Notifications
            </h1>
            <p className="text-muted-foreground">Stay updated on appointments and records</p>
          </div>
          {notifications.some(n => !n.is_read) && (
            <Button variant="outline" size="sm" onClick={markAllRead}><Check className="mr-2 h-4 w-4" /> Mark all read</Button>
          )}
        </div>

        <div className="space-y-3">
          {loading ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">Loading...</CardContent></Card>
          ) : notifications.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">No notifications</CardContent></Card>
          ) : (
            notifications.map(n => (
              <Card key={n.id} className={n.is_read ? "opacity-60" : ""}>
                <CardContent className="flex items-center justify-between py-4">
                  <div>
                    <p className="font-medium">{n.title}</p>
                    <p className="text-sm text-muted-foreground">{n.message}</p>
                    <p className="text-xs text-muted-foreground mt-1">{new Date(n.created_at).toLocaleString()}</p>
                  </div>
                  {!n.is_read && (
                    <Button variant="ghost" size="sm" onClick={() => markRead(n.id)}>
                      <Check className="h-4 w-4" />
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </AppLayout>
  );
}
