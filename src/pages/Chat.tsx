import { useEffect, useRef, useState } from "react";
import { useParams, Link, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Send, MessageCircle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Message {
  id: string;
  appointment_id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

interface AppointmentInfo {
  id: string;
  appointment_date: string;
  start_time: string;
  status: string;
  doctor_id: string;
  patient_user_id: string | null;
  patient_name: string;
  doctor_name: string;
}

export default function Chat() {
  const { appointmentId } = useParams<{ appointmentId: string }>();
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();
  const [appointment, setAppointment] = useState<AppointmentInfo | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [denied, setDenied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!appointmentId || !user) return;

    const load = async () => {
      setLoading(true);
      const { data: appt, error } = await supabase
        .from("appointments")
        .select("id, appointment_date, start_time, status, doctor_id, patient_id")
        .eq("id", appointmentId)
        .maybeSingle();

      if (error || !appt) {
        setDenied(true);
        setLoading(false);
        return;
      }
      const [{ data: patient }, { data: docProfile }] = await Promise.all([
        supabase.from("patients").select("user_id, full_name").eq("id", appt.patient_id).maybeSingle(),
        supabase.from("profiles").select("full_name").eq("user_id", appt.doctor_id).maybeSingle(),
      ]);

      // Authorization check (RLS on messages enforces this server-side too).
      // Admins may read the conversation but not take part in it.
      if (user.id !== appt.doctor_id && user.id !== patient?.user_id && !isAdmin) {
        setDenied(true);
        setLoading(false);
        return;
      }

      setAppointment({
        id: appt.id,
        appointment_date: appt.appointment_date,
        start_time: appt.start_time,
        status: appt.status,
        doctor_id: appt.doctor_id,
        patient_user_id: patient?.user_id ?? null,
        patient_name: patient?.full_name ?? "Patient",
        doctor_name: docProfile?.full_name ?? "Doctor",
      });

      const { data: msgs } = await supabase
        .from("messages")
        .select("*")
        .eq("appointment_id", appointmentId)
        .order("created_at", { ascending: true });
      setMessages(msgs ?? []);
      setLoading(false);
    };

    load();

    const channel = supabase
      .channel(`messages-${appointmentId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `appointment_id=eq.${appointmentId}` },
        (payload) => setMessages((prev) => [...prev, payload.new as Message])
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [appointmentId, user, isAdmin]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  if (denied) return <Navigate to="/appointments" replace />;

  // Messages can only be sent by the doctor and patient while the appointment is scheduled;
  // afterwards the conversation stays available as read-only history.
  const isParticipant = !!appointment && (user?.id === appointment.doctor_id || user?.id === appointment.patient_user_id);
  const canSend = isParticipant && appointment?.status === "scheduled";

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim() || !user || !appointmentId) return;
    setSending(true);
    const { error } = await supabase.from("messages").insert({
      appointment_id: appointmentId,
      sender_id: user.id,
      content: draft.trim(),
    });
    setSending(false);
    if (error) {
      toast({ title: "Could not send", description: error.message, variant: "destructive" });
    } else {
      setDraft("");
    }
  };

  return (
    <AppLayout>
      <div className="space-y-4 max-w-3xl mx-auto">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link to="/appointments"><ArrowLeft className="h-4 w-4 mr-1" /> Back to appointments</Link>
        </Button>

        <Card className="flex flex-col h-[calc(100vh-12rem)]">
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2 text-lg">
              <MessageCircle className="h-5 w-5 text-primary" />
              {appointment ? (
                <>
                  Chat — {appointment.patient_name} ↔ {appointment.doctor_name}
                  <span className="text-xs font-normal text-muted-foreground ml-auto">
                    {appointment.appointment_date} · {appointment.start_time?.slice(0, 5)}
                  </span>
                </>
              ) : "Loading..."}
            </CardTitle>
          </CardHeader>

          <CardContent ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : messages.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">No messages yet. Say hello 👋</p>
            ) : (
              messages.map((m) => {
                const mine = m.sender_id === user?.id;
                return (
                  <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${mine ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                      <p className="whitespace-pre-wrap break-words">{m.content}</p>
                      <p className={`text-[10px] mt-1 ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                        {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>

          {loading || canSend ? (
            <form onSubmit={send} className="border-t p-3 flex gap-2">
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Type a message..."
                disabled={sending || loading}
              />
              <Button type="submit" disabled={sending || loading || !draft.trim()}>
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </form>
          ) : (
            <p className="border-t p-3 text-center text-xs text-muted-foreground">
              {isParticipant
                ? `This appointment is ${appointment?.status.replace("_", " ")}. The conversation is read-only.`
                : "You are viewing this conversation as an administrator (read-only)."}
            </p>
          )}
        </Card>
      </div>
    </AppLayout>
  );
}
