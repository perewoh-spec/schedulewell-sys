import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Plus, Calendar, Loader2, Check, X, MessageCircle } from "lucide-react";
import { Link } from "react-router-dom";
import type { Database } from "@/integrations/supabase/types";
import { errorMessage, todayLocal } from "@/lib/utils";

type AppointmentStatus = Database["public"]["Enums"]["appointment_status"];
type RequestStatus = Database["public"]["Enums"]["appointment_request_status"];

type UnifiedRow = {
  id: string;
  kind: "request" | "appointment";
  date: string;
  time: string;
  end_time?: string;
  reason: string | null;
  status: AppointmentStatus | RequestStatus;
  submitted: string;
  patient_id: string;
  patient_name?: string;
  doctor_name?: string;
  decline_reason?: string | null;
  rawId: string;
  doctorId?: string;
  notes?: string | null;
};

const REQUEST_FIELDS = {
  full_name: "",
  date_of_birth: "",
  gender: "",
  genotype: "",
  blood_type: "",
  phone: "",
  case_issue: "",
  urgency: "normal",
  notes: "",
};

// Whole years between a YYYY-MM-DD birth date and today.
function ageFrom(dob: string): string {
  if (!dob) return "";
  const [y, m, d] = dob.split("-").map(Number);
  const now = new Date();
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age--;
  return String(Math.max(0, age));
}

export default function Appointments() {
  const { user, isStaff, isAdmin, hasRole } = useAuth();
  // The assigned doctor, nurses and admins can update an appointment; other doctors can't.
  const canManage = (r: UnifiedRow) => user?.id === r.doctorId || isAdmin || hasRole("nurse");
  const { toast } = useToast();
  const [rows, setRows] = useState<UnifiedRow[]>([]);
  const [doctors, setDoctors] = useState<{ user_id: string; full_name: string }[]>([]);
  const [patients, setPatients] = useState<{ id: string; full_name: string }[]>([]);
  const [patientId, setPatientId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Patient request dialog
  const [openRequest, setOpenRequest] = useState(false);
  const [reqForm, setReqForm] = useState({ ...REQUEST_FIELDS });

  // Staff direct create
  const [openCreate, setOpenCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    patient_id: "", doctor_id: "", appointment_date: "", start_time: "", end_time: "", reason: "",
  });

  // Approve / decline
  const [reviewing, setReviewing] = useState<UnifiedRow | null>(null);
  const [scheduleForm, setScheduleForm] = useState({ doctor_id: "", appointment_date: "", start_time: "", end_time: "" });
  const [declining, setDeclining] = useState<UnifiedRow | null>(null);
  const [declineReason, setDeclineReason] = useState("");

  // Cancel an appointment (patient or staff)
  const [cancelling, setCancelling] = useState<UnifiedRow | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const fetchData = async () => {
    setLoading(true);

    const [apptRes, reqRes] = await Promise.all([
      supabase.from("appointments").select("*").order("appointment_date", { ascending: false }),
      supabase.from("appointment_requests").select("*").order("created_at", { ascending: false }),
    ]);

    if (apptRes.error || reqRes.error) {
      toast({ title: "Could not load appointments", description: errorMessage(apptRes.error ?? reqRes.error), variant: "destructive" });
    }
    const appts = apptRes.data ?? [];
    const reqs = reqRes.data ?? [];

    const patientIds = [...new Set([...appts.map(a => a.patient_id), ...reqs.map(r => r.patient_id)])];
    const doctorIds = [...new Set(appts.map(a => a.doctor_id))];

    const [pats, docs] = await Promise.all([
      patientIds.length ? supabase.from("patients").select("id, full_name").in("id", patientIds) : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
      doctorIds.length ? supabase.from("profiles").select("user_id, full_name").in("user_id", doctorIds) : Promise.resolve({ data: [] as { user_id: string; full_name: string }[] }),
    ]);
    const patMap = Object.fromEntries((pats.data ?? []).map((p) => [p.id, p.full_name]));
    const docMap = Object.fromEntries((docs.data ?? []).map((d) => [d.user_id, d.full_name]));

    // Hide approved requests (they appear as scheduled appointments instead)
    const requestRows: UnifiedRow[] = reqs
      .filter(r => r.status !== "approved")
      .map(r => ({
        id: `req-${r.id}`,
        kind: "request",
        date: r.preferred_date ?? "",
        time: r.preferred_time ?? "",
        reason: r.reason,
        status: r.status as RequestStatus,
        submitted: r.created_at,
        patient_id: r.patient_id,
        patient_name: patMap[r.patient_id] || "—",
        decline_reason: r.decline_reason,
        rawId: r.id,
        notes: r.notes,
      }));

    const apptRows: UnifiedRow[] = appts.map(a => ({
      id: `appt-${a.id}`,
      kind: "appointment",
      date: a.appointment_date,
      time: a.start_time,
      end_time: a.end_time,
      reason: a.reason,
      status: a.status as AppointmentStatus,
      submitted: a.created_at,
      patient_id: a.patient_id,
      patient_name: patMap[a.patient_id] || "—",
      doctor_name: docMap[a.doctor_id] || "—",
      rawId: a.id,
      doctorId: a.doctor_id,
      notes: a.notes,
    }));

    const combined = [...requestRows, ...apptRows].sort(
      (a, b) => new Date(b.submitted).getTime() - new Date(a.submitted).getTime()
    );
    setRows(combined);

    if (!isStaff && user) {
      const { data: p } = await supabase.from("patients").select("id, full_name, date_of_birth, gender, blood_type, genotype, phone")
        .eq("user_id", user.id).maybeSingle();
      setPatientId(p?.id ?? null);
      if (p) {
        setReqForm(f => ({
          ...f,
          full_name: p.full_name || "",
          date_of_birth: p.date_of_birth || "",
          gender: p.gender || "",
          blood_type: p.blood_type || "",
          genotype: p.genotype || "",
          phone: p.phone || "",
        }));
      }
    }

    if (isStaff) {
      const [pRes, dRolesRes] = await Promise.all([
        supabase.from("patients").select("id, full_name"),
        supabase.from("user_roles").select("user_id").eq("role", "doctor"),
      ]);
      setPatients(pRes.data ?? []);
      const ids = (dRolesRes.data ?? []).map(r => r.user_id);
      if (ids.length) {
        const { data: d } = await supabase.from("profiles").select("user_id, full_name").in("user_id", ids);
        setDoctors(d ?? []);
      }
    }

    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [user, isStaff]);

  const submitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast({ title: "Please sign in to request an appointment", variant: "destructive" });
      return;
    }
    setSubmitting(true);

    // Auto-create patient profile if missing so anyone signed in can submit
    let pid = patientId;
    if (!pid) {
      const { data: existing } = await supabase.from("patients").select("id").eq("user_id", user.id).maybeSingle();
      if (existing?.id) {
        pid = existing.id;
      } else {
        const { data: created, error: createErr } = await supabase.from("patients").insert({
          user_id: user.id,
          full_name: reqForm.full_name || user.email || "Patient",
          email: user.email || null,
          date_of_birth: reqForm.date_of_birth || null,
          gender: reqForm.gender || null,
          blood_type: reqForm.blood_type || null,
          genotype: reqForm.genotype || null,
          phone: reqForm.phone || null,
        }).select("id").single();
        if (createErr || !created) {
          setSubmitting(false);
          toast({ title: "Error", description: createErr?.message ?? "Could not create patient profile", variant: "destructive" });
          return;
        }
        pid = created.id;
        setPatientId(pid);
      }
    } else {
      // Keep the patient's record up to date with what they entered on the form.
      const { error: updErr } = await supabase.from("patients").update({
        full_name: reqForm.full_name,
        date_of_birth: reqForm.date_of_birth || null,
        gender: reqForm.gender || null,
        blood_type: reqForm.blood_type || null,
        genotype: reqForm.genotype || null,
        phone: reqForm.phone || null,
      }).eq("id", pid);
      if (updErr) {
        setSubmitting(false);
        toast({ title: "Error", description: updErr.message, variant: "destructive" });
        return;
      }
    }

    const reasonLine = reqForm.case_issue
      ? `${reqForm.case_issue}${reqForm.urgency !== "normal" ? ` (urgency: ${reqForm.urgency})` : ""}`
      : null;

    const detailLines = [
      `Name: ${reqForm.full_name}`,
      reqForm.date_of_birth && `Age: ${ageFrom(reqForm.date_of_birth)} (born ${reqForm.date_of_birth})`,
      reqForm.gender && `Gender: ${reqForm.gender}`,
      reqForm.genotype && `Genotype: ${reqForm.genotype}`,
      reqForm.blood_type && `Blood type: ${reqForm.blood_type}`,
      reqForm.phone && `Phone: ${reqForm.phone}`,
      reqForm.notes && `Notes: ${reqForm.notes}`,
    ].filter(Boolean).join("\n");

    const { data: insertedReq, error } = await supabase.from("appointment_requests").insert({
      patient_id: pid,
      preferred_date: null,
      preferred_time: null,
      reason: reasonLine,
      notes: detailLines,
    }).select("id").single();

    if (error) {
      setSubmitting(false);
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    // Admin notifications are sent automatically via database trigger.

    setSubmitting(false);
    toast({ title: "Request submitted", description: "An admin will review and schedule your appointment." });
    setOpenRequest(false);
    setReqForm(f => ({ ...REQUEST_FIELDS, full_name: f.full_name, date_of_birth: f.date_of_birth, gender: f.gender, blood_type: f.blood_type, genotype: f.genotype, phone: f.phone }));
    fetchData();
  };

  const handleStaffCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.patient_id || !createForm.doctor_id) {
      toast({ title: "Select a patient and a doctor", variant: "destructive" });
      return;
    }
    if (createForm.end_time <= createForm.start_time) {
      toast({ title: "End time must be after start time", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("appointments").insert({ ...createForm, reason: createForm.reason || null, created_by: user?.id });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Appointment created" });
      setOpenCreate(false);
      setCreateForm({ patient_id: "", doctor_id: "", appointment_date: "", start_time: "", end_time: "", reason: "" });
      fetchData();
    }
  };

  const openSchedule = (r: UnifiedRow) => {
    setReviewing(r);
    setScheduleForm({
      doctor_id: "",
      appointment_date: r.date || todayLocal(),
      start_time: "09:00",
      end_time: "09:30",
    });
  };

  const approveRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewing || !user) return;
    if (scheduleForm.end_time <= scheduleForm.start_time) {
      toast({ title: "End time must be after start time", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    // One database call creates the appointment, marks the request approved and notifies
    // the patient and doctor together, so a failure can't leave things half done.
    const { error } = await supabase.rpc("approve_appointment_request", {
      _request_id: reviewing.rawId,
      _doctor_id: scheduleForm.doctor_id,
      _date: scheduleForm.appointment_date,
      _start: scheduleForm.start_time,
      _end: scheduleForm.end_time,
    });
    setSubmitting(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Request approved", description: "Patient and doctor notified." });
    setReviewing(null);
    fetchData();
  };

  const submitDecline = async () => {
    if (!declining || !user) return;
    setSubmitting(true);
    const { error } = await supabase.rpc("decline_appointment_request", {
      _request_id: declining.rawId,
      _reason: declineReason,
    });
    setSubmitting(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Request declined" });
    setDeclining(null);
    setDeclineReason("");
    fetchData();
  };

  const withdrawRequest = async (r: UnifiedRow) => {
    if (!window.confirm("Withdraw this appointment request?")) return;
    const { error } = await supabase.rpc("cancel_appointment_request", { _request_id: r.rawId });
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else {
      toast({ title: "Request withdrawn" });
      fetchData();
    }
  };

  const submitCancel = async () => {
    if (!cancelling || !user) return;
    setSubmitting(true);
    let error: { message: string } | null = null;
    if (isStaff) {
      const note = `Cancelled by staff${cancelReason ? `: ${cancelReason}` : ""}`;
      ({ error } = await supabase.from("appointments")
        .update({ status: "cancelled", notes: cancelling.notes ? `${cancelling.notes}\n${note}` : note })
        .eq("id", cancelling.rawId));
      if (!error) {
        const { data: patient } = await supabase.from("patients").select("user_id").eq("id", cancelling.patient_id).maybeSingle();
        if (patient?.user_id) {
          await supabase.from("notifications").insert({
            user_id: patient.user_id,
            title: "Appointment Cancelled",
            message: `Your appointment on ${cancelling.date} at ${cancelling.time.slice(0, 5)} was cancelled${cancelReason ? `: ${cancelReason}` : "."} Please request a new one if needed.`,
            type: "warning",
          });
        }
      }
    } else {
      ({ error } = await supabase.rpc("cancel_my_appointment", { _appointment_id: cancelling.rawId, _reason: cancelReason }));
    }
    setSubmitting(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Appointment cancelled" });
    setCancelling(null);
    setCancelReason("");
    fetchData();
  };

  const handleStatusChange = async (id: string, status: AppointmentStatus) => {
    const { error } = await supabase.from("appointments").update({ status }).eq("id", id);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else fetchData();
  };

  const statusColor = (s: string) => {
    switch (s) {
      case "scheduled": return "bg-info/10 text-info border-info/20";
      case "completed": return "bg-success/10 text-success border-success/20";
      case "cancelled":
      case "declined": return "bg-destructive/10 text-destructive border-destructive/20";
      case "no_show":
      case "pending": return "bg-warning/10 text-warning border-warning/20";
      case "approved": return "bg-success/10 text-success border-success/20";
      default: return "";
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Calendar className="h-6 w-6 text-primary" /> Appointments
            </h1>
            <p className="text-muted-foreground">
              {isStaff ? "Manage appointments and review patient requests" : "View your appointments and request new ones"}
            </p>
          </div>
          {isStaff ? (
            <Dialog open={openCreate} onOpenChange={setOpenCreate}>
              <DialogTrigger asChild>
                <Button><Plus className="mr-2 h-4 w-4" /> New Appointment</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Schedule Appointment</DialogTitle></DialogHeader>
                <form onSubmit={handleStaffCreate} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Patient</Label>
                    <Select value={createForm.patient_id} onValueChange={(v) => setCreateForm(f => ({ ...f, patient_id: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select patient" /></SelectTrigger>
                      <SelectContent>{patients.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Doctor</Label>
                    <Select value={createForm.doctor_id} onValueChange={(v) => setCreateForm(f => ({ ...f, doctor_id: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select doctor" /></SelectTrigger>
                      <SelectContent>{doctors.map(d => <SelectItem key={d.user_id} value={d.user_id}>{d.full_name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-2"><Label>Date</Label><Input type="date" value={createForm.appointment_date} onChange={e => setCreateForm(f => ({ ...f, appointment_date: e.target.value }))} required /></div>
                    <div className="space-y-2"><Label>Start</Label><Input type="time" value={createForm.start_time} onChange={e => setCreateForm(f => ({ ...f, start_time: e.target.value }))} required /></div>
                    <div className="space-y-2"><Label>End</Label><Input type="time" value={createForm.end_time} onChange={e => setCreateForm(f => ({ ...f, end_time: e.target.value }))} required /></div>
                  </div>
                  <div className="space-y-2"><Label>Reason</Label><Textarea value={createForm.reason} onChange={e => setCreateForm(f => ({ ...f, reason: e.target.value }))} /></div>
                  <Button type="submit" className="w-full">Schedule</Button>
                </form>
              </DialogContent>
            </Dialog>
          ) : (
            <Dialog open={openRequest} onOpenChange={setOpenRequest}>
              <DialogTrigger asChild>
                <Button><Plus className="mr-2 h-4 w-4" /> Request Appointment</Button>
              </DialogTrigger>
              <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Request an Appointment</DialogTitle>
                </DialogHeader>
                <form onSubmit={submitRequest} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2 col-span-2">
                      <Label>Full Name</Label>
                      <Input value={reqForm.full_name} onChange={e => setReqForm(f => ({ ...f, full_name: e.target.value }))} required />
                    </div>
                    <div className="space-y-2">
                      <Label>Date of Birth</Label>
                      <Input type="date" max={todayLocal()} value={reqForm.date_of_birth} onChange={e => setReqForm(f => ({ ...f, date_of_birth: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Gender</Label>
                      <Select value={reqForm.gender} onValueChange={(v) => setReqForm(f => ({ ...f, gender: v }))}>
                        <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="male">Male</SelectItem>
                          <SelectItem value="female">Female</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Genotype</Label>
                      <Select value={reqForm.genotype} onValueChange={(v) => setReqForm(f => ({ ...f, genotype: v }))}>
                        <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent>
                          {["AA", "AS", "AC", "SS", "SC"].map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Blood Type</Label>
                      <Select value={reqForm.blood_type} onValueChange={(v) => setReqForm(f => ({ ...f, blood_type: v }))}>
                        <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent>
                          {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2 col-span-2">
                      <Label>Phone</Label>
                      <Input type="tel" value={reqForm.phone} onChange={e => setReqForm(f => ({ ...f, phone: e.target.value }))} />
                    </div>
                    <div className="space-y-2 col-span-2">
                      <Label>Issue / Case Description</Label>
                      <Textarea value={reqForm.case_issue} onChange={e => setReqForm(f => ({ ...f, case_issue: e.target.value }))}
                        placeholder="Describe your symptoms, condition, or reason for visit..." required />
                    </div>
                    <div className="space-y-2">
                      <Label>Urgency</Label>
                      <Select value={reqForm.urgency} onValueChange={(v) => setReqForm(f => ({ ...f, urgency: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="normal">Normal</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="urgent">Urgent</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2 col-span-2 rounded-md border bg-muted/30 p-3">
                      <p className="text-xs text-muted-foreground">
                        📅 An admin will review your request and assign a date, time, and doctor. You'll get a notification once it's scheduled and can chat with your doctor.
                      </p>
                    </div>
                    <div className="space-y-2 col-span-2">
                      <Label>Additional Notes</Label>
                      <Textarea value={reqForm.notes} onChange={e => setReqForm(f => ({ ...f, notes: e.target.value }))}
                        placeholder="Allergies, current medication, anything else the doctor should know..." />
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={submitting}>
                    {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Submit Request
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Time</TableHead>
                  {isStaff && <TableHead>Patient</TableHead>}
                  <TableHead>Doctor</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                ) : rows.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No appointments yet</TableCell></TableRow>
                ) : (
                  rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.date || <span className="text-muted-foreground italic text-xs">Pending</span>}</TableCell>
                      <TableCell>{r.time ? `${r.time.slice(0, 5)}${r.end_time ? ` – ${r.end_time.slice(0, 5)}` : ""}` : "—"}</TableCell>
                      {isStaff && <TableCell>{r.patient_name}</TableCell>}
                      <TableCell>{r.doctor_name || (r.kind === "request" ? <span className="text-muted-foreground italic text-xs">Awaiting assignment</span> : "—")}</TableCell>
                      <TableCell className="max-w-[220px] truncate">{r.reason || "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusColor(r.status)}>{r.status.replace("_", " ")}</Badge>
                        {r.status === "declined" && r.decline_reason && (
                          <p className="text-xs text-muted-foreground mt-1 max-w-[180px]">{r.decline_reason}</p>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">{new Date(r.submitted).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right">
                        {isStaff && r.kind === "request" && r.status === "pending" && (
                          <div className="flex gap-1 justify-end">
                            <Button size="sm" onClick={() => openSchedule(r)}><Check className="h-3.5 w-3.5 mr-1" /> Schedule</Button>
                            <Button size="sm" variant="outline" onClick={() => setDeclining(r)}><X className="h-3.5 w-3.5 mr-1" /> Decline</Button>
                          </div>
                        )}
                        {!isStaff && r.kind === "request" && r.status === "pending" && (
                          <Button size="sm" variant="outline" onClick={() => withdrawRequest(r)}><X className="h-3.5 w-3.5 mr-1" /> Withdraw</Button>
                        )}
                        {r.kind === "appointment" && (
                          <div className="flex gap-1 justify-end flex-wrap">
                            {(!isStaff || user?.id === r.doctorId || isAdmin) && (
                              <Button size="sm" variant="outline" asChild>
                                <Link to={`/chat/${r.rawId}`}>
                                  <MessageCircle className="h-3.5 w-3.5 mr-1" /> {r.status === "scheduled" && (!isAdmin || user?.id === r.doctorId) ? "Chat" : "History"}
                                </Link>
                              </Button>
                            )}
                            {r.status === "scheduled" && isStaff && canManage(r) && (
                              <>
                                <Button size="sm" variant="outline" onClick={() => handleStatusChange(r.rawId, "completed")}>Complete</Button>
                                <Button size="sm" variant="outline" onClick={() => handleStatusChange(r.rawId, "no_show")}>No-show</Button>
                              </>
                            )}
                            {r.status === "scheduled" && (!isStaff || canManage(r)) && (
                              <Button size="sm" variant="outline" onClick={() => setCancelling(r)}>Cancel</Button>
                            )}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Approve/schedule dialog */}
      <Dialog open={!!reviewing} onOpenChange={(o) => !o && setReviewing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Schedule Appointment</DialogTitle></DialogHeader>
          {reviewing && (
            <form onSubmit={approveRequest} className="space-y-4">
              <div className="text-sm border rounded-md p-3 bg-muted/30 space-y-1">
                <p><strong>Patient:</strong> {reviewing.patient_name}</p>
                <p><strong>Reason:</strong> {reviewing.reason || "—"}</p>
                {reviewing.notes && (
                  <pre className="whitespace-pre-wrap text-xs text-muted-foreground mt-2">{reviewing.notes}</pre>
                )}
              </div>
              <div className="space-y-2">
                <Label>Assign Doctor</Label>
                <Select value={scheduleForm.doctor_id} onValueChange={(v) => setScheduleForm(s => ({ ...s, doctor_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select doctor" /></SelectTrigger>
                  <SelectContent>
                    {doctors.length === 0
                      ? <div className="px-3 py-2 text-sm text-muted-foreground">No doctors available</div>
                      : doctors.map(d => <SelectItem key={d.user_id} value={d.user_id}>{d.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-2"><Label>Date</Label><Input type="date" value={scheduleForm.appointment_date} onChange={e => setScheduleForm(s => ({ ...s, appointment_date: e.target.value }))} required /></div>
                <div className="space-y-2"><Label>Start</Label><Input type="time" value={scheduleForm.start_time} onChange={e => setScheduleForm(s => ({ ...s, start_time: e.target.value }))} required /></div>
                <div className="space-y-2"><Label>End</Label><Input type="time" value={scheduleForm.end_time} onChange={e => setScheduleForm(s => ({ ...s, end_time: e.target.value }))} required /></div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setReviewing(null)} disabled={submitting}>Cancel</Button>
                <Button type="submit" disabled={submitting || !scheduleForm.doctor_id}>
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Approve & Schedule
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Decline dialog */}
      <Dialog open={!!declining} onOpenChange={(o) => { if (!o) { setDeclining(null); setDeclineReason(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Decline Request</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Reason (sent to patient)</Label>
            <Textarea value={declineReason} onChange={e => setDeclineReason(e.target.value)} placeholder="e.g. No availability — please pick another date." />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeclining(null); setDeclineReason(""); }} disabled={submitting}>Cancel</Button>
            <Button variant="destructive" onClick={submitDecline} disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Decline
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel appointment dialog */}
      <Dialog open={!!cancelling} onOpenChange={(o) => { if (!o) { setCancelling(null); setCancelReason(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cancel Appointment</DialogTitle></DialogHeader>
          {cancelling && (
            <p className="text-sm text-muted-foreground">
              {cancelling.date} at {cancelling.time.slice(0, 5)}{isStaff ? ` with ${cancelling.patient_name}` : ` with ${cancelling.doctor_name}`}
            </p>
          )}
          <div className="space-y-2">
            <Label>Reason (optional, shared with the {isStaff ? "patient" : "doctor"})</Label>
            <Textarea value={cancelReason} onChange={e => setCancelReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCancelling(null); setCancelReason(""); }} disabled={submitting}>Keep Appointment</Button>
            <Button variant="destructive" onClick={submitCancel} disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Cancel Appointment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
