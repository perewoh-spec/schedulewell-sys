import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Shield, Pencil, Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import type { Database } from "@/integrations/supabase/types";
import { errorMessage } from "@/lib/utils";

type AppRole = Database["public"]["Enums"]["app_role"];
const ALL_ROLES: AppRole[] = ["admin", "doctor", "nurse", "patient"];

interface UserRow {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  created_at: string;
  roles: AppRole[];
}

export default function UserManagement() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<AppRole[]>([]);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const { toast } = useToast();
  const { user: currentUser, refreshProfile } = useAuth();

  const fetchUsers = async () => {
    setLoading(true);
    const [{ data: profiles }, { data: allRoles }] = await Promise.all([
      supabase.from("profiles").select("*"),
      supabase.from("user_roles").select("*"),
    ]);

    const roleMap: Record<string, AppRole[]> = {};
    (allRoles ?? []).forEach((r) => {
      if (!roleMap[r.user_id]) roleMap[r.user_id] = [];
      roleMap[r.user_id].push(r.role);
    });

    setUsers((profiles ?? []).map((p) => ({ ...p, roles: roleMap[p.user_id] ?? [] })));
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const openEdit = (user: UserRow) => {
    setEditing(user);
    setSelectedRoles(user.roles);
  };

  const toggleRole = (role: AppRole) => {
    setSelectedRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  };

  const saveRoles = async () => {
    if (!editing) return;
    if (selectedRoles.length === 0) {
      toast({ title: "Select at least one role", variant: "destructive" });
      return;
    }
    if (editing.user_id === currentUser?.id && editing.roles.includes("admin") && !selectedRoles.includes("admin")) {
      toast({ title: "You can't remove your own admin role", description: "Ask another administrator to do it.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const toAdd = selectedRoles.filter((r) => !editing.roles.includes(r));
      const toRemove = editing.roles.filter((r) => !selectedRoles.includes(r));

      if (toRemove.length > 0) {
        const { error } = await supabase
          .from("user_roles")
          .delete()
          .eq("user_id", editing.user_id)
          .in("role", toRemove);
        if (error) throw error;
      }
      if (toAdd.length > 0) {
        const { error } = await supabase
          .from("user_roles")
          .insert(toAdd.map((role) => ({ user_id: editing.user_id, role })));
        if (error) throw error;
      }

      toast({ title: "Roles updated", description: `Updated roles for ${editing.full_name || editing.email}` });
      if (editing.user_id === currentUser?.id) await refreshProfile();
      setEditing(null);
      await fetchUsers();
    } catch (error) {
      toast({ title: "Error", description: errorMessage(error), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const q = search.trim().toLowerCase();
  const filteredUsers = q
    ? users.filter((u) => [u.full_name, u.email].some((v) => v?.toLowerCase().includes(q)))
    : users;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" /> User Management
          </h1>
          <p className="text-muted-foreground">Manage system users and assign roles</p>
          <p className="text-xs text-muted-foreground mt-1">
            To add a doctor or nurse, ask them to sign up on the login page, then give them the role here.
          </p>
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search by name or email" value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                ) : filteredUsers.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No users found</TableCell></TableRow>
                ) : (
                  filteredUsers.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.full_name || "—"}</TableCell>
                      <TableCell>{u.email}</TableCell>
                      <TableCell>{u.phone || "—"}</TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {u.roles.length === 0 ? (
                            <span className="text-xs text-muted-foreground">No roles</span>
                          ) : (
                            u.roles.map((r) => (
                              <Badge key={r} variant="secondary" className="capitalize text-xs">{r}</Badge>
                            ))
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{new Date(u.created_at).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(u)}>
                          <Pencil className="h-3.5 w-3.5 mr-1" /> Edit Roles
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User Roles</DialogTitle>
            <DialogDescription>
              {editing?.full_name || editing?.email} — select all roles that apply.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {ALL_ROLES.map((role) => (
              <label key={role} className="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-muted">
                <Checkbox
                  checked={selectedRoles.includes(role)}
                  onCheckedChange={() => toggleRole(role)}
                  disabled={role === "admin" && editing?.user_id === currentUser?.id && editing?.roles.includes("admin")}
                />
                <span className="capitalize font-medium">{role}</span>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>Cancel</Button>
            <Button onClick={saveRoles} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
