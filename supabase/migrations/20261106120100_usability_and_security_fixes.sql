-- ============================================================
-- 1. Role helpers run as SECURITY DEFINER again.
--    They read user_roles / appointments, whose own policies call has_role();
--    as SECURITY INVOKER that risks policy recursion and slows every query.
-- ============================================================
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_appointment_participant(_appointment_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.appointments a
    LEFT JOIN public.patients p ON p.id = a.patient_id
    WHERE a.id = _appointment_id
      AND a.status = 'scheduled'
      AND (a.doctor_id = _user_id OR p.user_id = _user_id)
  )
$$;

-- Same as above but for any status: used to keep chat history readable after a visit ends.
CREATE OR REPLACE FUNCTION public.is_appointment_member(_appointment_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.appointments a
    LEFT JOIN public.patients p ON p.id = a.patient_id
    WHERE a.id = _appointment_id
      AND (a.doctor_id = _user_id OR p.user_id = _user_id)
  )
$$;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_appointment_participant(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_appointment_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_appointment_participant(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_appointment_member(uuid, uuid) TO authenticated;

-- ============================================================
-- 2. Patients can see the names of doctors who treat them
--    (appointments, chat and medical records showed "—" / "Unknown").
-- ============================================================
DROP POLICY IF EXISTS "Patients can view their doctors' profiles" ON public.profiles;
CREATE POLICY "Patients can view their doctors' profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.appointments a
      JOIN public.patients p ON p.id = a.patient_id
      WHERE a.doctor_id = profiles.user_id AND p.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.medical_records m
      JOIN public.patients p ON p.id = m.patient_id
      WHERE m.doctor_id = profiles.user_id AND p.user_id = auth.uid()
    )
  );

-- ============================================================
-- 3. Chat history stays readable after an appointment is completed or cancelled.
--    Sending is still limited to scheduled appointments.
-- ============================================================
DROP POLICY IF EXISTS "Participants can view messages" ON public.messages;
CREATE POLICY "Participants can view messages"
  ON public.messages FOR SELECT TO authenticated
  USING (
    public.is_appointment_member(appointment_id, auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );

-- ============================================================
-- 4. Appointment times: no double-booking a doctor, end after start.
--    The old unique (doctor, date, start_time) constraint also blocked re-using
--    the slot of a cancelled appointment, so it is replaced by this check.
-- ============================================================
ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS no_time_overlap;

CREATE OR REPLACE FUNCTION public.check_appointment_times()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.end_time <= NEW.start_time THEN
    RAISE EXCEPTION 'End time must be after start time';
  END IF;
  IF NEW.status = 'scheduled' AND EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.doctor_id = NEW.doctor_id
      AND a.appointment_date = NEW.appointment_date
      AND a.status = 'scheduled'
      AND a.id <> NEW.id
      AND a.start_time < NEW.end_time
      AND a.end_time > NEW.start_time
  ) THEN
    RAISE EXCEPTION 'This doctor already has an appointment that overlaps % – % on %',
      to_char(NEW.start_time, 'HH24:MI'), to_char(NEW.end_time, 'HH24:MI'), NEW.appointment_date;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_appointment_times ON public.appointments;
CREATE TRIGGER trg_check_appointment_times
BEFORE INSERT OR UPDATE OF doctor_id, appointment_date, start_time, end_time, status ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.check_appointment_times();

-- Patients book through requests that staff approve; they could previously insert
-- appointments directly through the API and skip that review.
DROP POLICY IF EXISTS "Users can create own appointments" ON public.appointments;
DROP POLICY IF EXISTS "Staff can create appointments" ON public.appointments;
CREATE POLICY "Staff can create appointments"
  ON public.appointments FOR INSERT TO authenticated
  WITH CHECK (
    (
      public.has_role(auth.uid(), 'doctor')
      OR public.has_role(auth.uid(), 'nurse')
      OR public.has_role(auth.uid(), 'admin')
    )
    AND created_by = auth.uid()
  );

-- ============================================================
-- 5. Approving / declining requests happens in one transaction,
--    so a failure can't leave an appointment with a still-pending request.
-- ============================================================
CREATE OR REPLACE FUNCTION public.approve_appointment_request(
  _request_id uuid, _doctor_id uuid, _date date, _start time, _end time
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.appointment_requests%ROWTYPE;
  v_patient public.patients%ROWTYPE;
  v_appt_id uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'doctor') OR public.has_role(auth.uid(), 'nurse')) THEN
    RAISE EXCEPTION 'Only staff can approve requests';
  END IF;
  IF NOT public.has_role(_doctor_id, 'doctor') THEN
    RAISE EXCEPTION 'The selected user is not a doctor';
  END IF;

  SELECT * INTO v_req FROM public.appointment_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF v_req.status <> 'pending' THEN RAISE EXCEPTION 'This request has already been %', v_req.status; END IF;

  INSERT INTO public.appointments (patient_id, doctor_id, appointment_date, start_time, end_time, reason, notes, created_by, status)
  VALUES (v_req.patient_id, _doctor_id, _date, _start, _end, v_req.reason, v_req.notes, auth.uid(), 'scheduled')
  RETURNING id INTO v_appt_id;

  UPDATE public.appointment_requests
  SET status = 'approved', appointment_id = v_appt_id, reviewed_by = auth.uid(), reviewed_at = now()
  WHERE id = _request_id;

  SELECT * INTO v_patient FROM public.patients WHERE id = v_req.patient_id;
  IF v_patient.user_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, message, type)
    VALUES (v_patient.user_id, 'Appointment Confirmed',
      'Your appointment has been scheduled for ' || _date || ' at ' || to_char(_start, 'HH24:MI') || '. You can now chat with your doctor.',
      'success');
  END IF;
  INSERT INTO public.notifications (user_id, title, message, type)
  VALUES (_doctor_id, 'New Patient Assigned',
    'You have been assigned to ' || COALESCE(v_patient.full_name, 'a patient') || ' on ' || _date || ' at ' || to_char(_start, 'HH24:MI') || '.',
    'info');

  RETURN v_appt_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.decline_appointment_request(_request_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.appointment_requests%ROWTYPE;
  v_user uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'doctor') OR public.has_role(auth.uid(), 'nurse')) THEN
    RAISE EXCEPTION 'Only staff can decline requests';
  END IF;

  SELECT * INTO v_req FROM public.appointment_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF v_req.status <> 'pending' THEN RAISE EXCEPTION 'This request has already been %', v_req.status; END IF;

  UPDATE public.appointment_requests
  SET status = 'declined', decline_reason = NULLIF(_reason, ''), reviewed_by = auth.uid(), reviewed_at = now()
  WHERE id = _request_id;

  SELECT user_id INTO v_user FROM public.patients WHERE id = v_req.patient_id;
  IF v_user IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, message, type)
    VALUES (v_user, 'Appointment Request Declined',
      COALESCE(NULLIF(_reason, ''), 'Your request was declined. Please submit a new one.'), 'warning');
  END IF;
END;
$$;

-- ============================================================
-- 6. Patients can withdraw their own pending request or cancel their own appointment.
--    Done through functions so patients can't change anything else on the row.
-- ============================================================
CREATE OR REPLACE FUNCTION public.cancel_appointment_request(_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.appointment_requests r
  SET status = 'cancelled'
  WHERE r.id = _request_id
    AND r.status = 'pending'
    AND r.patient_id IN (SELECT id FROM public.patients WHERE user_id = auth.uid());
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found or no longer pending';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_my_appointment(_appointment_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_appt public.appointments%ROWTYPE;
  v_name text;
BEGIN
  SELECT a.* INTO v_appt FROM public.appointments a
  JOIN public.patients p ON p.id = a.patient_id
  WHERE a.id = _appointment_id AND p.user_id = auth.uid()
  FOR UPDATE OF a;
  IF NOT FOUND THEN RAISE EXCEPTION 'Appointment not found'; END IF;
  IF v_appt.status <> 'scheduled' THEN RAISE EXCEPTION 'Only scheduled appointments can be cancelled'; END IF;

  UPDATE public.appointments
  SET status = 'cancelled',
      notes = concat_ws(E'\n', notes, 'Cancelled by patient' || COALESCE(': ' || NULLIF(_reason, ''), ''))
  WHERE id = _appointment_id;

  SELECT full_name INTO v_name FROM public.patients WHERE id = v_appt.patient_id;
  INSERT INTO public.notifications (user_id, title, message, type)
  VALUES (v_appt.doctor_id, 'Appointment Cancelled',
    COALESCE(v_name, 'A patient') || ' cancelled the appointment on ' || v_appt.appointment_date || ' at ' || to_char(v_appt.start_time, 'HH24:MI')
      || COALESCE(': ' || NULLIF(_reason, ''), '.'),
    'warning');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_appointment_request(uuid, uuid, date, time, time) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.decline_appointment_request(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cancel_appointment_request(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cancel_my_appointment(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_appointment_request(uuid, uuid, date, time, time) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_appointment_request(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_appointment_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_my_appointment(uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.check_appointment_times() FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 7. Genotype is stored on the patient record (it was only kept in free-text notes).
-- ============================================================
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS genotype TEXT;
ALTER TABLE public.patients DROP CONSTRAINT IF EXISTS patients_genotype_check;
ALTER TABLE public.patients ADD CONSTRAINT patients_genotype_check
  CHECK (genotype IS NULL OR genotype IN ('AA', 'AS', 'AC', 'SS', 'SC'));

-- ============================================================
-- 8. Every confirmed account gets a patient record, so doctors can write records for
--    patients who never requested an appointment. A record that staff registered with
--    the same email is linked instead of duplicated, but only once the email is
--    confirmed, so nobody can claim someone else's records by signing up with their email.
-- ============================================================
CREATE OR REPLACE FUNCTION public.ensure_patient_record()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match uuid;
BEGIN
  IF NEW.email_confirmed_at IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.email_confirmed_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM public.patients WHERE user_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  -- Link a staff-registered record only when exactly one unlinked record has this email,
  -- and only on a real confirmation (UPDATE), not when the project auto-confirms sign-ups.
  IF TG_OP = 'UPDATE' THEN
    SELECT id INTO v_match FROM public.patients
    WHERE user_id IS NULL AND lower(email) = lower(NEW.email);
    IF FOUND AND (SELECT count(*) FROM public.patients WHERE user_id IS NULL AND lower(email) = lower(NEW.email)) = 1 THEN
      UPDATE public.patients SET user_id = NEW.id WHERE id = v_match;
      RETURN NEW;
    END IF;
  END IF;

  INSERT INTO public.patients (user_id, full_name, email)
  VALUES (NEW.id, COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), NEW.email, 'Patient'), NEW.email);
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ensure_patient_record() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_patient_record ON auth.users;
CREATE TRIGGER on_auth_user_patient_record
AFTER INSERT OR UPDATE OF email_confirmed_at ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.ensure_patient_record();

-- Backfill: existing confirmed patient accounts without a patient record.
INSERT INTO public.patients (user_id, full_name, email)
SELECT u.id, COALESCE(NULLIF(pr.full_name, ''), u.email, 'Patient'), u.email
FROM auth.users u
LEFT JOIN public.profiles pr ON pr.user_id = u.id
WHERE u.email_confirmed_at IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.patients p WHERE p.user_id = u.id)
  AND NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = u.id AND r.role IN ('admin', 'doctor', 'nurse'));

-- ============================================================
-- 9. The system can never be left without an administrator.
-- ============================================================
CREATE OR REPLACE FUNCTION public.prevent_removing_last_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.role = 'admin'
     AND (TG_OP = 'DELETE' OR NEW.role <> 'admin' OR NEW.user_id <> OLD.user_id)
     AND NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin' AND id <> OLD.id) THEN
    RAISE EXCEPTION 'Cannot remove the last administrator';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.prevent_removing_last_admin() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_prevent_removing_last_admin ON public.user_roles;
CREATE TRIGGER trg_prevent_removing_last_admin
BEFORE UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.prevent_removing_last_admin();

-- ============================================================
-- 10. Audit trigger fix: it read OLD.status on every UPDATE, and tables without a
--     status column (patients, medical_records, user_roles) failed with
--     'record "old" has no field "status"', so editing a patient or record was impossible.
-- ============================================================
CREATE OR REPLACE FUNCTION public.log_audit_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action TEXT;
  v_record_id UUID;
  v_details JSONB;
  v_old_status TEXT;
  v_new_status TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := TG_ARGV[0] || '_created';
    v_record_id := NEW.id;
    v_details := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := TG_ARGV[0] || '_updated';
    v_record_id := NEW.id;
    -- Read status through JSON so tables without a status column work too.
    v_old_status := to_jsonb(OLD) ->> 'status';
    v_new_status := to_jsonb(NEW) ->> 'status';
    IF TG_TABLE_NAME = 'appointments' AND v_old_status IS DISTINCT FROM v_new_status THEN
      v_action := 'appointment_status_' || v_new_status;
      v_details := jsonb_build_object('old_status', v_old_status, 'new_status', v_new_status, 'appointment_id', NEW.id);
    ELSIF TG_TABLE_NAME = 'appointment_requests' AND v_old_status IS DISTINCT FROM v_new_status THEN
      v_action := 'request_' || v_new_status;
      v_details := jsonb_build_object('old_status', v_old_status, 'new_status', v_new_status, 'request_id', NEW.id);
    ELSE
      v_details := jsonb_build_object('changes',
        (SELECT jsonb_object_agg(key, value)
         FROM jsonb_each(to_jsonb(NEW))
         WHERE to_jsonb(NEW) -> key IS DISTINCT FROM to_jsonb(OLD) -> key
           AND key NOT IN ('updated_at', 'created_at'))
      );
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    v_action := TG_ARGV[0] || '_deleted';
    v_record_id := OLD.id;
    v_details := to_jsonb(OLD);
  END IF;

  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, details)
  VALUES (auth.uid(), v_action, TG_TABLE_NAME, v_record_id, v_details);

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_audit_event() FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 11. Live notification updates (unread badge in the sidebar).
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END;
$$;
