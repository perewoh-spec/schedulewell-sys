import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, Users, Calendar, FileText, TrendingUp } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

const chartConfig = {
  // Brand teal, validated for chart use on both the light and dark card surfaces
  // (the dark theme's brighter primary is too light for bars).
  count: { label: "Appointments", theme: { light: "hsl(168 80% 36%)", dark: "hsl(168 80% 36%)" } },
} satisfies ChartConfig;

const STATUS_LABELS: Record<string, string> = {
  scheduled: "Scheduled", completed: "Completed", cancelled: "Cancelled", no_show: "No-show",
};

// The first day of each of the last six months, oldest first, as YYYY-MM keys.
function lastSixMonths(): { key: string; label: string }[] {
  const now = new Date();
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    return {
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString(undefined, { month: "short", year: "2-digit" }),
    };
  });
}

export default function Reports() {
  const [stats, setStats] = useState({
    totalUsers: 0, totalPatients: 0, totalAppointments: 0, completedAppointments: 0,
    cancelledAppointments: 0, totalRecords: 0,
  });
  const [byStatus, setByStatus] = useState<{ status: string; count: number }[]>([]);
  const [byMonth, setByMonth] = useState<{ month: string; count: number }[]>([]);

  useEffect(() => {
    const fetchStats = async () => {
      const [users, patients, appts, completed, cancelled, records] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("patients").select("id", { count: "exact", head: true }),
        supabase.from("appointments").select("id", { count: "exact", head: true }),
        supabase.from("appointments").select("id", { count: "exact", head: true }).eq("status", "completed"),
        supabase.from("appointments").select("id", { count: "exact", head: true }).eq("status", "cancelled"),
        supabase.from("medical_records").select("id", { count: "exact", head: true }),
      ]);
      setStats({
        totalUsers: users.count ?? 0,
        totalPatients: patients.count ?? 0,
        totalAppointments: appts.count ?? 0,
        completedAppointments: completed.count ?? 0,
        cancelledAppointments: cancelled.count ?? 0,
        totalRecords: records.count ?? 0,
      });

      // Status breakdown and monthly volume for the charts.
      const months = lastSixMonths();
      const [noShow, scheduled, recent] = await Promise.all([
        supabase.from("appointments").select("id", { count: "exact", head: true }).eq("status", "no_show"),
        supabase.from("appointments").select("id", { count: "exact", head: true }).eq("status", "scheduled"),
        supabase.from("appointments").select("appointment_date").gte("appointment_date", `${months[0].key}-01`),
      ]);
      setByStatus([
        { status: STATUS_LABELS.scheduled, count: scheduled.count ?? 0 },
        { status: STATUS_LABELS.completed, count: completed.count ?? 0 },
        { status: STATUS_LABELS.cancelled, count: cancelled.count ?? 0 },
        { status: STATUS_LABELS.no_show, count: noShow.count ?? 0 },
      ]);
      const perMonth: Record<string, number> = {};
      (recent.data ?? []).forEach((a) => {
        const key = a.appointment_date.slice(0, 7);
        perMonth[key] = (perMonth[key] ?? 0) + 1;
      });
      setByMonth(months.map((m) => ({ month: m.label, count: perMonth[m.key] ?? 0 })));
    };
    fetchStats();
  }, []);

  const cards = [
    { title: "Total Users", value: stats.totalUsers, icon: Users, color: "text-primary" },
    { title: "Total Patients", value: stats.totalPatients, icon: Users, color: "text-info" },
    { title: "Total Appointments", value: stats.totalAppointments, icon: Calendar, color: "text-success" },
    { title: "Completed Appointments", value: stats.completedAppointments, icon: TrendingUp, color: "text-success" },
    { title: "Cancelled Appointments", value: stats.cancelledAppointments, icon: Calendar, color: "text-destructive" },
    { title: "Medical Records", value: stats.totalRecords, icon: FileText, color: "text-warning" },
  ];

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" /> Reports & Analytics
          </h1>
          <p className="text-muted-foreground">System-wide statistics and reports</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map(c => (
            <Card key={c.title}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{c.title}</CardTitle>
                <c.icon className={`h-5 w-5 ${c.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{c.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Appointment Completion Rate</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="flex-1 bg-muted rounded-full h-4 overflow-hidden">
                <div
                  className="bg-primary h-full rounded-full transition-all"
                  style={{ width: `${stats.totalAppointments > 0 ? (stats.completedAppointments / stats.totalAppointments * 100) : 0}%` }}
                />
              </div>
              <span className="text-sm font-medium text-muted-foreground">
                {stats.totalAppointments > 0 ? Math.round(stats.completedAppointments / stats.totalAppointments * 100) : 0}%
              </span>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-base">Appointments per Month</CardTitle></CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[240px] w-full">
                <BarChart data={byMonth} margin={{ left: -16, right: 8 }}>
                  <CartesianGrid vertical={false} strokeOpacity={0.5} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                  <ChartTooltip cursor={{ fillOpacity: 0.3 }} content={<ChartTooltipContent />} />
                  <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Appointments by Status</CardTitle></CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[240px] w-full">
                <BarChart data={byStatus} margin={{ left: -16, right: 8 }}>
                  <CartesianGrid vertical={false} strokeOpacity={0.5} />
                  <XAxis dataKey="status" tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                  <ChartTooltip cursor={{ fillOpacity: 0.3 }} content={<ChartTooltipContent />} />
                  <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
