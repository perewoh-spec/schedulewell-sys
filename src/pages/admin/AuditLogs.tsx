import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Activity, Loader2, Search } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

const PAGE_SIZE = 100;
const TABLES = ["appointments", "appointment_requests", "medical_records", "patients", "user_roles"];

type LogRow = Tables<"audit_logs"> & { user_name?: string };

export default function AuditLogs() {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [table, setTable] = useState("all");
  const [search, setSearch] = useState("");

  // Fetches one page of logs and looks up who performed each action.
  const fetchPage = async (offset: number): Promise<LogRow[]> => {
    let query = supabase.from("audit_logs").select("*").order("created_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    if (table !== "all") query = query.eq("table_name", table);
    const { data } = await query;
    const rows = data ?? [];
    setHasMore(rows.length === PAGE_SIZE);

    const userIds = [...new Set(rows.map((l) => l.user_id).filter(Boolean))] as string[];
    const { data: profiles } = userIds.length
      ? await supabase.from("profiles").select("user_id, full_name, email").in("user_id", userIds)
      : { data: [] as { user_id: string; full_name: string; email: string }[] };
    const names = Object.fromEntries((profiles ?? []).map((p) => [p.user_id, p.full_name || p.email]));
    return rows.map((l) => ({ ...l, user_name: l.user_id ? names[l.user_id] ?? "Unknown user" : "System" }));
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setLogs(await fetchPage(0));
      setLoading(false);
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table]);

  const loadMore = async () => {
    setLoadingMore(true);
    const more = await fetchPage(logs.length);
    setLogs((prev) => [...prev, ...more]);
    setLoadingMore(false);
  };

  const q = search.trim().toLowerCase();
  const filtered = q
    ? logs.filter((l) => [l.action, l.user_name, l.details ? JSON.stringify(l.details) : ""].some((v) => v?.toLowerCase().includes(q)))
    : logs;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" /> Audit Logs
          </h1>
          <p className="text-muted-foreground">System activity and change history</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search action, user or details" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={table} onValueChange={setTable}>
            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tables</SelectItem>
              {TABLES.map((t) => <SelectItem key={t} value={t}>{t.replace("_", " ")}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Table</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No audit logs found</TableCell></TableRow>
                ) : (
                  filtered.map(l => (
                    <TableRow key={l.id}>
                      <TableCell className="font-medium whitespace-nowrap">{new Date(l.created_at).toLocaleString()}</TableCell>
                      <TableCell>{l.user_name}</TableCell>
                      <TableCell className="capitalize">{l.action.replace(/_/g, " ")}</TableCell>
                      <TableCell>{l.table_name || "—"}</TableCell>
                      <TableCell className="max-w-[300px] truncate text-muted-foreground" title={l.details ? JSON.stringify(l.details) : undefined}>
                        {l.details ? JSON.stringify(l.details) : "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {!loading && hasMore && (
          <div className="flex justify-center">
            <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
              {loadingMore && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Load more
            </Button>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
