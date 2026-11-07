import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Calendar, Users, FileText, Clock, Activity, Shield, Bell, Settings, ArrowRight, UserCog, ClipboardList, BarChart3,
} from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import type { Tables } from "@/integrations/supabase/types";
import { formatDate, todayLocal } from "@/lib/utils";

type Appointment = Tables<"appointments">;

interface AdminStats {
  totalUsers: number;
  totalPatients: number;
  totalAppointments: number;
  todayAppointments: number;
  totalRecords: number;
  pendingRequests: number;
  roleCounts: Record<string, number>;
  recentLogs: Tables<"audit_logs">[];
}

interface PatientData {
  upcoming: Appointment[];
  upcomingCount: number;
  recentRecords: Tables<"medical_records">[];
  totalRecords: number;
  unreadNotifications: number;
  pendingRequests: number;
}

interface StaffData {
  today: (Appointment & { patient_name: string })[];
  upcomingCount: number;
  pendingRequests: number;
  unreadNotifications: number;
}

export default function Dashboard() {
  const { profile, user, isAdmin, isStaff, hasRole } = useAuth();
  const isDoctor = hasRole("doctor");
  const [adminStats, setAdminStats] = useState<AdminStats | null>(null);
  const [patientData, setPatientData] = useState<PatientData | null>(null);
  const [staffData, setStaffData] = useState<StaffData | null>(null);

  useEffect(() => {
    if (!user) return;

    const fetchAdmin = async () => {
      const today = todayLocal();
      const [users, patients, appts, todayAppts, records, allRoles, logs, pending] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("patients").select("id", { count: "exact", head: true }),
        supabase.from("appointments").select("id", { count: "exact", head: true }),
        supabase.from("appointments").select("id", { count: "exact", head: true }).eq("appointment_date", today),
        supabase.from("medical_records").select("id", { count: "exact", head: true }),
        supabase.from("user_roles").select("role"),
        supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(5),
        supabase.from("appointment_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
      ]);

      const roleCounts: Record<string, number> = {};
      (allRoles.data ?? []).forEach((r) => {
        roleCounts[r.role] = (roleCounts[r.role] ?? 0) + 1;
      });

      setAdminStats({
        totalUsers: users.count ?? 0,
        totalPatients: patients.count ?? 0,
        totalAppointments: appts.count ?? 0,
        todayAppointments: todayAppts.count ?? 0,
        totalRecords: records.count ?? 0,
        pendingRequests: pending.count ?? 0,
        roleCounts,
        recentLogs: logs.data ?? [],
      });
    };

    const fetchPatient = async () => {
      const { data: patient } = await supabase
        .from("patients").select("id").eq("user_id", user.id).maybeSingle();

      const today = todayLocal();
      // Counts come from the database; the lists below only show the first 5 items.
      const [upcoming, records, notifs, pendingReqs] = await Promise.all([
        patient
          ? supabase.from("appointments").select("*", { count: "exact" }).eq("patient_id", patient.id)
              .gte("appointment_date", today).eq("status", "scheduled")
              .order("appointment_date").order("start_time").limit(5)
          : Promise.resolve({ data: [], count: 0 }),
        patient
          ? supabase.from("medical_records").select("*", { count: "exact" }).eq("patient_id", patient.id)
              .order("record_date", { ascending: false }).limit(5)
          : Promise.resolve({ data: [], count: 0 }),
        supabase.from("notifications").select("id", { count: "exact", head: true })
          .eq("user_id", user.id).eq("is_read", false),
        patient
          ? supabase.from("appointment_requests").select("id", { count: "exact", head: true })
              .eq("patient_id", patient.id).eq("status", "pending")
          : Promise.resolve({ count: 0 }),
      ]);

      setPatientData({
        upcoming: upcoming.data ?? [],
        upcomingCount: upcoming.count ?? 0,
        recentRecords: records.data ?? [],
        totalRecords: records.count ?? 0,
        unreadNotifications: notifs.count ?? 0,
        pendingRequests: pendingReqs.count ?? 0,
      });
    };

    const fetchStaff = async () => {
      const today = todayLocal();
      // Doctors see their own schedule; nurses see the whole clinic's day.
      let todayQuery = supabase.from("appointments").select("*")
        .eq("appointment_date", today).eq("status", "scheduled").order("start_time");
      let upcomingQuery = supabase.from("appointments").select("id", { count: "exact", head: true })
        .gte("appointment_date", today).eq("status", "scheduled");
      if (isDoctor) {
        todayQuery = todayQuery.eq("doctor_id", user.id);
        upcomingQuery = upcomingQuery.eq("doctor_id", user.id);
      }
      const [todayRes, upcomingRes, pending, notifs] = await Promise.all([
        todayQuery,
        upcomingQuery,
        supabase.from("appointment_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("notifications").select("id", { count: "exact", head: true })
          .eq("user_id", user.id).eq("is_read", false),
      ]);

      const appts = todayRes.data ?? [];
      const patientIds = [...new Set(appts.map((a) => a.patient_id))];
      const { data: pats } = patientIds.length
        ? await supabase.from("patients").select("id, full_name").in("id", patientIds)
        : { data: [] as { id: string; full_name: string }[] };
      const patMap = Object.fromEntries((pats ?? []).map((p) => [p.id, p.full_name]));

      setStaffData({
        today: appts.map((a) => ({ ...a, patient_name: patMap[a.patient_id] ?? "—" })),
        upcomingCount: upcomingRes.count ?? 0,
        pendingRequests: pending.count ?? 0,
        unreadNotifications: notifs.count ?? 0,
      });
    };

    if (isAdmin) fetchAdmin();
    else if (isStaff) fetchStaff();
    else fetchPatient();
  }, [user, isAdmin, isStaff, isDoctor]);

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {greeting()}, {profile?.full_name || "User"}
          </h1>
          <p className="text-muted-foreground">
            {isAdmin ? "System Administrator Dashboard" : isStaff ? "Staff Dashboard" : "Patient Portal"}
          </p>
        </div>

        {isAdmin ? (
          adminStats ? <AdminDashboard stats={adminStats} /> : <DashboardLoading />
        ) : isStaff ? (
          staffData ? <StaffDashboard data={staffData} isDoctor={isDoctor} /> : <DashboardLoading />
        ) : (
          patientData ? <PatientDashboard data={patientData} /> : <DashboardLoading />
        )}
      </div>
    </AppLayout>
  );
}

function AdminDashboard({ stats }: { stats: AdminStats }) {
  const cards = [
    { title: "Total Users", value: stats.totalUsers, icon: Users, color: "text-primary" },
    { title: "Total Patients", value: stats.totalPatients, icon: UserCog, color: "text-info" },
    { title: "Pending Requests", value: stats.pendingRequests, icon: ClipboardList, color: "text-warning", to: "/appointments" },
    { title: "Today's Appointments", value: stats.todayAppointments, icon: Clock, color: "text-success" },
    { title: "Total Appointments", value: stats.totalAppointments, icon: Calendar, color: "text-success" },
    { title: "Medical Records", value: stats.totalRecords, icon: FileText, color: "text-warning" },
  ];

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
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

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="h-4 w-4 text-primary" /> Role Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(["admin", "doctor", "nurse", "patient"] as const).map((role) => (
              <div key={role} className="flex items-center justify-between">
                <span className="capitalize text-sm font-medium">{role}</span>
                <Badge variant="secondary">{stats.roleCounts[role] ?? 0}</Badge>
              </div>
            ))}
            <Button asChild variant="outline" size="sm" className="w-full mt-3">
              <Link to="/admin/users">Manage Users <ArrowRight className="h-3.5 w-3.5 ml-1" /></Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-warning" /> Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {stats.recentLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recent activity</p>
            ) : (
              stats.recentLogs.map((log) => (
                <div key={log.id} className="text-xs flex justify-between gap-2 py-1 border-b border-border last:border-0">
                  <span className="font-medium">{log.action}</span>
                  <span className="text-muted-foreground">{new Date(log.created_at).toLocaleString()}</span>
                </div>
              ))
            )}
            <Button asChild variant="outline" size="sm" className="w-full mt-3">
              <Link to="/admin/audit">View All Logs <ArrowRight className="h-3.5 w-3.5 ml-1" /></Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings className="h-4 w-4 text-primary" /> Admin Tools
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Button asChild variant="outline"><Link to="/appointments"><ClipboardList className="h-4 w-4 mr-2" />Appointment Requests</Link></Button>
          <Button asChild variant="outline"><Link to="/admin/users"><Shield className="h-4 w-4 mr-2" />User Management</Link></Button>
          <Button asChild variant="outline"><Link to="/admin/audit"><Activity className="h-4 w-4 mr-2" />Audit Logs</Link></Button>
          <Button asChild variant="outline"><Link to="/admin/reports"><BarChart3 className="h-4 w-4 mr-2" />Reports</Link></Button>
        </CardContent>
      </Card>
    </>
  );
}

function PatientDashboard({ data }: { data: PatientData }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending Requests</CardTitle>
            <ClipboardList className="h-5 w-5 text-warning" />
          </CardHeader>
          <CardContent><div className="text-3xl font-bold">{data.pendingRequests}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Upcoming Appointments</CardTitle>
            <Calendar className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent><div className="text-3xl font-bold">{data.upcomingCount}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Medical Records</CardTitle>
            <FileText className="h-5 w-5 text-info" />
          </CardHeader>
          <CardContent><div className="text-3xl font-bold">{data.totalRecords}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Unread Notifications</CardTitle>
            <Bell className="h-5 w-5 text-warning" />
          </CardHeader>
          <CardContent><div className="text-3xl font-bold">{data.unreadNotifications}</div></CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar className="h-4 w-4 text-primary" /> Upcoming Appointments
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">No upcoming appointments</p>
            ) : (
              data.upcoming.map((a) => (
                <div key={a.id} className="text-sm flex justify-between gap-2 py-2 border-b border-border last:border-0">
                  <div>
                    <p className="font-medium">{formatDate(a.appointment_date)}</p>
                    <p className="text-xs text-muted-foreground">{a.start_time.slice(0, 5)} — {a.reason || "Consultation"}</p>
                  </div>
                  <Badge variant="secondary" className="capitalize h-fit">{a.status}</Badge>
                </div>
              ))
            )}
            <Button asChild variant="outline" size="sm" className="w-full mt-3">
              <Link to="/appointments">Request Appointment <ArrowRight className="h-3.5 w-3.5 ml-1" /></Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4 text-info" /> Recent Medical Records
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.recentRecords.length === 0 ? (
              <p className="text-sm text-muted-foreground">No medical records yet</p>
            ) : (
              data.recentRecords.map((r) => (
                <div key={r.id} className="text-sm py-2 border-b border-border last:border-0">
                  <p className="font-medium">{r.diagnosis || "Visit notes"}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(r.record_date)}</p>
                </div>
              ))
            )}
            <Button asChild variant="outline" size="sm" className="w-full mt-3">
              <Link to="/records">View All Records <ArrowRight className="h-3.5 w-3.5 ml-1" /></Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function DashboardLoading() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <Card key={i}><CardContent className="h-[104px] animate-pulse" /></Card>
      ))}
    </div>
  );
}

function StaffDashboard({ data, isDoctor }: { data: StaffData; isDoctor: boolean }) {
  const cards = [
    { title: isDoctor ? "My Appointments Today" : "Appointments Today", value: data.today.length, icon: Clock, color: "text-success" },
    { title: isDoctor ? "My Upcoming Appointments" : "Upcoming Appointments", value: data.upcomingCount, icon: Calendar, color: "text-primary" },
    { title: "Pending Requests", value: data.pendingRequests, icon: ClipboardList, color: "text-warning" },
    { title: "Unread Notifications", value: data.unreadNotifications, icon: Bell, color: "text-info" },
  ];

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{c.title}</CardTitle>
              <c.icon className={`h-5 w-5 ${c.color}`} />
            </CardHeader>
            <CardContent><div className="text-3xl font-bold">{c.value}</div></CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4 text-success" /> {isDoctor ? "My Schedule Today" : "Today's Schedule"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.today.length === 0 ? (
            <p className="text-sm text-muted-foreground">No appointments scheduled for today</p>
          ) : (
            data.today.map((a) => (
              <div key={a.id} className="text-sm flex justify-between items-center gap-2 py-2 border-b border-border last:border-0">
                <div>
                  <p className="font-medium">{a.start_time.slice(0, 5)} – {a.end_time.slice(0, 5)} · {a.patient_name}</p>
                  <p className="text-xs text-muted-foreground">{a.reason || "Consultation"}</p>
                </div>
                {isDoctor && (
                  <Button asChild variant="outline" size="sm"><Link to={`/chat/${a.id}`}>Chat</Link></Button>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4 text-primary" /> Quick Actions
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-3">
          <Button asChild variant="outline"><Link to="/appointments"><Calendar className="h-4 w-4 mr-2" />Appointments</Link></Button>
          <Button asChild variant="outline"><Link to="/patients"><Users className="h-4 w-4 mr-2" />Patients</Link></Button>
          {isDoctor && (
            <Button asChild variant="outline"><Link to="/records"><FileText className="h-4 w-4 mr-2" />Medical Records</Link></Button>
          )}
        </CardContent>
      </Card>
    </>
  );
}
