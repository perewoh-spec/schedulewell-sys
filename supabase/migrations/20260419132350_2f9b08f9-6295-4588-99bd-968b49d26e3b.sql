-- Make preferred_date optional
ALTER TABLE public.appointment_requests ALTER COLUMN preferred_date DROP NOT NULL;
ALTER TABLE public.appointment_requests ALTER COLUMN preferred_time DROP NOT NULL;

-- Messages table for doctor<->patient chat tied to a scheduled appointment
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  content text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_appointment ON public.messages(appointment_id, created_at);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Helper: is the current user a participant of this appointment?
CREATE OR REPLACE FUNCTION public.is_appointment_participant(_appointment_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.appointments a
    LEFT JOIN public.patients p ON p.id = a.patient_id
    WHERE a.id = _appointment_id
      AND a.status = 'scheduled'
      AND (a.doctor_id = _user_id OR p.user_id = _user_id)
  )
$$;

CREATE POLICY "Participants can view messages"
ON public.messages FOR SELECT TO authenticated
USING (
  public.is_appointment_participant(appointment_id, auth.uid())
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Participants can send messages"
ON public.messages FOR INSERT TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND public.is_appointment_participant(appointment_id, auth.uid())
);

CREATE POLICY "Participants can mark messages read"
ON public.messages FOR UPDATE TO authenticated
USING (public.is_appointment_participant(appointment_id, auth.uid()));

-- Realtime
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;