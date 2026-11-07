import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, UserCircle } from "lucide-react";
import { errorMessage } from "@/lib/utils";
import { isDemoEmail } from "@/lib/demo";

const PATIENT_FIELDS = {
  date_of_birth: "", gender: "", blood_type: "", genotype: "", address: "", emergency_contact: "", emergency_phone: "",
};

export default function Profile() {
  const { user, isStaff, refreshProfile } = useAuth();
  const { toast } = useToast();
  const [account, setAccount] = useState({ full_name: "", phone: "" });
  const [patientId, setPatientId] = useState<string | null>(null);
  const [patient, setPatient] = useState({ ...PATIENT_FIELDS });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [passwords, setPasswords] = useState({ password: "", confirm: "" });
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);
      const [{ data: prof }, { data: pat }] = await Promise.all([
        supabase.from("profiles").select("full_name, phone").eq("user_id", user.id).maybeSingle(),
        supabase.from("patients").select("*").eq("user_id", user.id).maybeSingle(),
      ]);
      setAccount({ full_name: prof?.full_name ?? "", phone: prof?.phone ?? "" });
      if (pat) {
        setPatientId(pat.id);
        setPatient({
          date_of_birth: pat.date_of_birth ?? "",
          gender: pat.gender ?? "",
          blood_type: pat.blood_type ?? "",
          genotype: pat.genotype ?? "",
          address: pat.address ?? "",
          emergency_contact: pat.emergency_contact ?? "",
          emergency_phone: pat.emergency_phone ?? "",
        });
      }
      setLoading(false);
    };
    load();
  }, [user]);

  const showPatientDetails = !isStaff && !!patientId;

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("profiles")
        .update({ full_name: account.full_name.trim(), phone: account.phone.trim() })
        .eq("user_id", user.id);
      if (error) throw error;

      if (patientId) {
        const patientUpdate = showPatientDetails
          ? {
              full_name: account.full_name.trim(),
              phone: account.phone.trim() || null,
              date_of_birth: patient.date_of_birth || null,
              gender: patient.gender || null,
              blood_type: patient.blood_type || null,
              genotype: patient.genotype || null,
              address: patient.address || null,
              emergency_contact: patient.emergency_contact || null,
              emergency_phone: patient.emergency_phone || null,
            }
          : { full_name: account.full_name.trim() };
        const { error: patErr } = await supabase.from("patients").update(patientUpdate).eq("id", patientId);
        if (patErr) throw patErr;
      }

      await refreshProfile();
      toast({ title: "Profile saved" });
    } catch (error) {
      toast({ title: "Error", description: errorMessage(error), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwords.password !== passwords.confirm) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    setChangingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: passwords.password });
    setChangingPassword(false);
    if (error) {
      toast({ title: "Error", description: errorMessage(error), variant: "destructive" });
    } else {
      toast({ title: "Password changed" });
      setPasswords({ password: "", confirm: "" });
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <UserCircle className="h-6 w-6 text-primary" /> My Profile
          </h1>
          <p className="text-muted-foreground">Update your contact details and password</p>
        </div>

        {loading ? (
          <Card><CardContent className="py-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></CardContent></Card>
        ) : (
          <form onSubmit={saveProfile}>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Account</CardTitle>
                <CardDescription>{user?.email}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Full Name</Label>
                    <Input value={account.full_name} onChange={e => setAccount(a => ({ ...a, full_name: e.target.value }))} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Phone</Label>
                    <Input type="tel" value={account.phone} onChange={e => setAccount(a => ({ ...a, phone: e.target.value }))} />
                  </div>
                </div>

                {showPatientDetails && (
                  <>
                    <div className="grid sm:grid-cols-2 gap-4 pt-2">
                      <div className="space-y-2">
                        <Label>Date of Birth</Label>
                        <Input type="date" value={patient.date_of_birth} onChange={e => setPatient(p => ({ ...p, date_of_birth: e.target.value }))} />
                      </div>
                      <div className="space-y-2">
                        <Label>Gender</Label>
                        <Select value={patient.gender} onValueChange={v => setPatient(p => ({ ...p, gender: v }))}>
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
                        <Select value={patient.blood_type} onValueChange={v => setPatient(p => ({ ...p, blood_type: v }))}>
                          <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                          <SelectContent>
                            {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Genotype</Label>
                        <Select value={patient.genotype} onValueChange={v => setPatient(p => ({ ...p, genotype: v }))}>
                          <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                          <SelectContent>
                            {["AA", "AS", "AC", "SS", "SC"].map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Address</Label>
                      <Input value={patient.address} onChange={e => setPatient(p => ({ ...p, address: e.target.value }))} />
                    </div>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Emergency Contact</Label>
                        <Input value={patient.emergency_contact} onChange={e => setPatient(p => ({ ...p, emergency_contact: e.target.value }))} />
                      </div>
                      <div className="space-y-2">
                        <Label>Emergency Phone</Label>
                        <Input type="tel" value={patient.emergency_phone} onChange={e => setPatient(p => ({ ...p, emergency_phone: e.target.value }))} />
                      </div>
                    </div>
                  </>
                )}

                <Button type="submit" disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Changes
                </Button>
              </CardContent>
            </Card>
          </form>
        )}

        {isDemoEmail(user?.email) ? (
          <Card>
            <CardHeader><CardTitle className="text-base">Change Password</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground">Password changes are turned off for shared demo accounts.</CardContent>
          </Card>
        ) : (
        <form onSubmit={changePassword}>
          <Card>
            <CardHeader><CardTitle className="text-base">Change Password</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>New Password</Label>
                  <Input type="password" value={passwords.password} onChange={e => setPasswords(p => ({ ...p, password: e.target.value }))} required minLength={6} autoComplete="new-password" />
                </div>
                <div className="space-y-2">
                  <Label>Confirm Password</Label>
                  <Input type="password" value={passwords.confirm} onChange={e => setPasswords(p => ({ ...p, confirm: e.target.value }))} required minLength={6} autoComplete="new-password" />
                </div>
              </div>
              <Button type="submit" variant="outline" disabled={changingPassword}>
                {changingPassword && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Change Password
              </Button>
            </CardContent>
          </Card>
        </form>
        )}
      </div>
    </AppLayout>
  );
}
