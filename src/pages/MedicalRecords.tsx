import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { FileText, Plus, Search } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { formatDate } from "@/lib/utils";

type RecordRow = Tables<"medical_records"> & { patient_name?: string; doctor_name?: string };

export default function MedicalRecords() {
  const { user, hasRole } = useAuth();
  const { toast } = useToast();
  const isDoctor = hasRole("doctor");
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [viewing, setViewing] = useState<RecordRow | null>(null);
  const [search, setSearch] = useState("");
  const [patients, setPatients] = useState<{ id: string; full_name: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    patient_id: "", diagnosis: "", symptoms: "", treatment: "", prescription: "", notes: "", follow_up_date: "",
  });

  const fetchRecords = async () => {
    setLoading(true);
    const { data } = await supabase.from("medical_records").select("*").order("record_date", { ascending: false });
    
    if (data && data.length > 0) {
      const patientIds = [...new Set(data.map(r => r.patient_id))];
      const doctorIds = [...new Set(data.map(r => r.doctor_id))];
      const [pats, docs] = await Promise.all([
        supabase.from("patients").select("id, full_name").in("id", patientIds),
        supabase.from("profiles").select("user_id, full_name").in("user_id", doctorIds),
      ]);
      const patMap = Object.fromEntries((pats.data ?? []).map(p => [p.id, p.full_name]));
      const docMap = Object.fromEntries((docs.data ?? []).map(d => [d.user_id, d.full_name]));
      setRecords(data.map(r => ({ ...r, patient_name: patMap[r.patient_id], doctor_name: docMap[r.doctor_id] })));
    } else {
      setRecords([]);
    }

    if (isDoctor) {
      const { data: pats } = await supabase.from("patients").select("id, full_name");
      setPatients(pats ?? []);
    }
    setLoading(false);
  };

  useEffect(() => { fetchRecords(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.patient_id) {
      toast({ title: "Select a patient", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("medical_records").insert({
      ...form,
      doctor_id: user!.id,
      follow_up_date: form.follow_up_date || null,
    });
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else {
      toast({ title: "Record created" });
      setOpen(false);
      setForm({ patient_id: "", diagnosis: "", symptoms: "", treatment: "", prescription: "", notes: "", follow_up_date: "" });
      fetchRecords();
    }
  };

  const q = search.trim().toLowerCase();
  const filtered = q
    ? records.filter(r => [r.patient_name, r.doctor_name, r.diagnosis].some(v => v?.toLowerCase().includes(q)))
    : records;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <FileText className="h-6 w-6 text-primary" /> Medical Records
            </h1>
            <p className="text-muted-foreground">View and manage electronic health records. Click a record to see it in full.</p>
          </div>
          {isDoctor && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="mr-2 h-4 w-4" /> New Record</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>Create Medical Record</DialogTitle></DialogHeader>
                <form onSubmit={handleCreate} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Patient</Label>
                    <Select value={form.patient_id} onValueChange={(v) => setForm(f => ({ ...f, patient_id: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select patient" /></SelectTrigger>
                      <SelectContent>{patients.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Diagnosis</Label>
                      <Input value={form.diagnosis} onChange={e => setForm(f => ({ ...f, diagnosis: e.target.value }))} required />
                    </div>
                    <div className="space-y-2">
                      <Label>Follow-up Date</Label>
                      <Input type="date" value={form.follow_up_date} onChange={e => setForm(f => ({ ...f, follow_up_date: e.target.value }))} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Symptoms</Label>
                    <Textarea value={form.symptoms} onChange={e => setForm(f => ({ ...f, symptoms: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Treatment</Label>
                    <Textarea value={form.treatment} onChange={e => setForm(f => ({ ...f, treatment: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Prescription</Label>
                    <Textarea value={form.prescription} onChange={e => setForm(f => ({ ...f, prescription: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Notes</Label>
                    <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                  </div>
                  <Button type="submit" className="w-full">Save Record</Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {records.length > 0 && (
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search by patient, doctor or diagnosis" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        )}

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Doctor</TableHead>
                  <TableHead>Diagnosis</TableHead>
                  <TableHead>Treatment</TableHead>
                  <TableHead>Prescription</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No records found</TableCell></TableRow>
                ) : (
                  filtered.map((r) => (
                    <TableRow key={r.id} className="cursor-pointer" onClick={() => setViewing(r)}>
                      <TableCell className="font-medium">{formatDate(r.record_date)}</TableCell>
                      <TableCell>{r.patient_name || "Unknown"}</TableCell>
                      <TableCell>{r.doctor_name || "Unknown"}</TableCell>
                      <TableCell>{r.diagnosis || "—"}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{r.treatment || "—"}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{r.prescription || "—"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{viewing?.diagnosis || "Medical Record"}</DialogTitle></DialogHeader>
          {viewing && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2 text-muted-foreground">
                <p><strong className="text-foreground">Date:</strong> {formatDate(viewing.record_date)}</p>
                <p><strong className="text-foreground">Follow-up:</strong> {formatDate(viewing.follow_up_date)}</p>
                <p><strong className="text-foreground">Patient:</strong> {viewing.patient_name || "Unknown"}</p>
                <p><strong className="text-foreground">Doctor:</strong> {viewing.doctor_name || "Unknown"}</p>
              </div>
              {([
                ["Symptoms", viewing.symptoms],
                ["Treatment", viewing.treatment],
                ["Prescription", viewing.prescription],
                ["Notes", viewing.notes],
              ] as const).map(([label, value]) => (
                <div key={label}>
                  <p className="font-medium">{label}</p>
                  <p className="whitespace-pre-wrap text-muted-foreground">{value || "—"}</p>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
