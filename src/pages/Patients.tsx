import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Users, Plus, Search, Pencil } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { formatDate } from "@/lib/utils";

const EMPTY_FORM = {
  full_name: "", date_of_birth: "", gender: "", phone: "", email: "", address: "",
  emergency_contact: "", emergency_phone: "", blood_type: "", genotype: "",
};

export default function Patients() {
  const { toast } = useToast();
  const [patients, setPatients] = useState<Tables<"patients">[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const fetchPatients = async () => {
    setLoading(true);
    const { data } = await supabase.from("patients").select("*").order("created_at", { ascending: false });
    setPatients(data ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchPatients(); }, []);

  const openNew = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setOpen(true);
  };

  const openEdit = (p: Tables<"patients">) => {
    setEditingId(p.id);
    setForm({
      full_name: p.full_name, date_of_birth: p.date_of_birth ?? "", gender: p.gender ?? "", phone: p.phone ?? "",
      email: p.email ?? "", address: p.address ?? "", emergency_contact: p.emergency_contact ?? "",
      emergency_phone: p.emergency_phone ?? "", blood_type: p.blood_type ?? "", genotype: p.genotype ?? "",
    });
    setOpen(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const values = {
      ...form,
      email: form.email.trim() || null,
      gender: form.gender || null,
      blood_type: form.blood_type || null,
      genotype: form.genotype || null,
      date_of_birth: form.date_of_birth || null,
    };
    const { error } = editingId
      ? await supabase.from("patients").update(values).eq("id", editingId)
      : await supabase.from("patients").insert(values);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else {
      toast({ title: editingId ? "Patient updated" : "Patient added" });
      setOpen(false);
      setEditingId(null);
      setForm({ ...EMPTY_FORM });
      fetchPatients();
    }
  };

  const q = search.trim().toLowerCase();
  const filtered = q
    ? patients.filter(p => [p.full_name, p.email, p.phone].some(v => v?.toLowerCase().includes(q)))
    : patients;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Users className="h-6 w-6 text-primary" /> Patients
            </h1>
            <p className="text-muted-foreground">Manage patient records</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={(e) => { e.preventDefault(); openNew(); }}><Plus className="mr-2 h-4 w-4" /> Add Patient</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{editingId ? "Edit Patient" : "Register Patient"}</DialogTitle></DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Full Name *</Label>
                    <Input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Date of Birth</Label>
                    <Input type="date" value={form.date_of_birth} onChange={e => setForm(f => ({ ...f, date_of_birth: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Gender</Label>
                    <Select value={form.gender} onValueChange={v => setForm(f => ({ ...f, gender: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="male">Male</SelectItem>
                        <SelectItem value="female">Female</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Blood Type</Label>
                    <Select value={form.blood_type} onValueChange={v => setForm(f => ({ ...f, blood_type: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        {["A+","A-","B+","B-","AB+","AB-","O+","O-"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Genotype</Label>
                    <Select value={form.genotype} onValueChange={v => setForm(f => ({ ...f, genotype: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        {["AA", "AS", "AC", "SS", "SC"].map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Phone</Label>
                    <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
                  </div>
                  <div className="space-y-2 col-span-2">
                    <Label>Email</Label>
                    <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Address</Label>
                  <Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Emergency Contact</Label>
                    <Input value={form.emergency_contact} onChange={e => setForm(f => ({ ...f, emergency_contact: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Emergency Phone</Label>
                    <Input value={form.emergency_phone} onChange={e => setForm(f => ({ ...f, emergency_phone: e.target.value }))} />
                  </div>
                </div>
                {!editingId && (
                  <p className="text-xs text-muted-foreground">
                    If this patient later signs up with the same email and confirms it, their account is linked to this record automatically.
                  </p>
                )}
                <Button type="submit" className="w-full">{editingId ? "Save Changes" : "Register Patient"}</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search by name, email or phone" value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>DOB</TableHead>
                  <TableHead>Gender</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Blood / Genotype</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No patients found</TableCell></TableRow>
                ) : (
                  filtered.map(p => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">
                        {p.full_name}
                        {p.user_id && <Badge variant="secondary" className="ml-2 text-[10px]">Account linked</Badge>}
                      </TableCell>
                      <TableCell>{formatDate(p.date_of_birth)}</TableCell>
                      <TableCell className="capitalize">{p.gender || "—"}</TableCell>
                      <TableCell>{p.phone || "—"}</TableCell>
                      <TableCell>{p.email || "—"}</TableCell>
                      <TableCell className="space-x-1">
                        {p.blood_type && <Badge variant="outline">{p.blood_type}</Badge>}
                        {p.genotype && <Badge variant="outline">{p.genotype}</Badge>}
                        {!p.blood_type && !p.genotype && "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(p)}><Pencil className="h-3.5 w-3.5 mr-1" /> Edit</Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
