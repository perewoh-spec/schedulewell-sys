-- ============================================================
-- Demo isolation: shared demo accounts (flagged with app_metadata.demo = true, which only
-- the server can set) see and change only placeholder data, and real accounts never see it.
-- Implemented as one RESTRICTIVE policy per table, ANDed with the existing policies.
-- ============================================================

-- Who is asking? Read from the signed login token, so users can't fake it.
CREATE OR REPLACE FUNCTION public.current_user_is_demo()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT COALESCE((auth.jwt() -> 'app_metadata' ->> 'demo')::boolean, false)
$$;

CREATE OR REPLACE FUNCTION public.user_is_demo(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE((SELECT (raw_app_meta_data ->> 'demo')::boolean FROM auth.users WHERE id = _user_id), false)
$$;

ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.patients ALTER COLUMN is_demo SET DEFAULT public.current_user_is_demo();

CREATE OR REPLACE FUNCTION public.patient_is_demo(_patient_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE((SELECT is_demo FROM public.patients WHERE id = _patient_id), false)
$$;

CREATE OR REPLACE FUNCTION public.appointment_is_demo(_appointment_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE((
    SELECT p.is_demo FROM public.appointments a JOIN public.patients p ON p.id = a.patient_id
    WHERE a.id = _appointment_id
  ), false)
$$;

REVOKE EXECUTE ON FUNCTION public.user_is_demo(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.patient_is_demo(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.appointment_is_demo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_is_demo(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.patient_is_demo(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.appointment_is_demo(uuid) TO authenticated;

ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

-- Mark existing demo accounts and their data (no-op on a fresh database).
UPDATE auth.users
SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"demo": true}'::jsonb
WHERE email IN ('demo.admin@example.com', 'demo.doctor@example.com', 'demo.patient@example.com');
UPDATE public.patients SET is_demo = true
WHERE email LIKE '%@example.com' OR public.user_is_demo(user_id);
-- Classify existing audit entries from the row they describe.
UPDATE public.audit_logs SET is_demo = CASE
  WHEN table_name = 'patients' THEN public.patient_is_demo(record_id)
    OR COALESCE((details ->> 'email') LIKE '%@example.com', false)
  WHEN details ? 'patient_id' THEN public.patient_is_demo((details ->> 'patient_id')::uuid)
  WHEN table_name = 'user_roles' THEN public.user_is_demo((details ->> 'user_id')::uuid)
  WHEN table_name = 'appointments' THEN public.appointment_is_demo(COALESCE((details ->> 'appointment_id')::uuid, record_id))
  WHEN table_name = 'appointment_requests' THEN public.patient_is_demo(
    (SELECT patient_id FROM public.appointment_requests WHERE id = COALESCE((details ->> 'request_id')::uuid, record_id)))
  ELSE false
END;

-- ------------------------------------------------------------
-- The wall: one restrictive policy per table.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Demo isolation" ON public.patients;
CREATE POLICY "Demo isolation" ON public.patients AS RESTRICTIVE FOR ALL TO authenticated
  USING (is_demo = public.current_user_is_demo())
  WITH CHECK (is_demo = public.current_user_is_demo());

DROP POLICY IF EXISTS "Demo isolation" ON public.appointments;
CREATE POLICY "Demo isolation" ON public.appointments AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.patient_is_demo(patient_id) = public.current_user_is_demo())
  WITH CHECK (public.patient_is_demo(patient_id) = public.current_user_is_demo()
              AND public.user_is_demo(doctor_id) = public.current_user_is_demo());

DROP POLICY IF EXISTS "Demo isolation" ON public.appointment_requests;
CREATE POLICY "Demo isolation" ON public.appointment_requests AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.patient_is_demo(patient_id) = public.current_user_is_demo())
  WITH CHECK (public.patient_is_demo(patient_id) = public.current_user_is_demo());

DROP POLICY IF EXISTS "Demo isolation" ON public.medical_records;
CREATE POLICY "Demo isolation" ON public.medical_records AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.patient_is_demo(patient_id) = public.current_user_is_demo())
  WITH CHECK (public.patient_is_demo(patient_id) = public.current_user_is_demo());

DROP POLICY IF EXISTS "Demo isolation" ON public.messages;
CREATE POLICY "Demo isolation" ON public.messages AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.appointment_is_demo(appointment_id) = public.current_user_is_demo())
  WITH CHECK (public.appointment_is_demo(appointment_id) = public.current_user_is_demo());

DROP POLICY IF EXISTS "Demo isolation" ON public.profiles;
CREATE POLICY "Demo isolation" ON public.profiles AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.user_is_demo(user_id) = public.current_user_is_demo())
  WITH CHECK (public.user_is_demo(user_id) = public.current_user_is_demo());

DROP POLICY IF EXISTS "Demo isolation" ON public.user_roles;
CREATE POLICY "Demo isolation" ON public.user_roles AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.user_is_demo(user_id) = public.current_user_is_demo())
  WITH CHECK (public.user_is_demo(user_id) = public.current_user_is_demo());

DROP POLICY IF EXISTS "Demo isolation" ON public.notifications;
CREATE POLICY "Demo isolation" ON public.notifications AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.user_is_demo(user_id) = public.current_user_is_demo())
  WITH CHECK (public.user_is_demo(user_id) = public.current_user_is_demo());

DROP POLICY IF EXISTS "Demo isolation" ON public.audit_logs;
CREATE POLICY "Demo isolation" ON public.audit_logs AS RESTRICTIVE FOR ALL TO authenticated
  USING (is_demo = public.current_user_is_demo())
  WITH CHECK (is_demo = public.current_user_is_demo());

-- ------------------------------------------------------------
-- Server-side functions bypass row security, so they check the wall themselves.
-- ------------------------------------------------------------
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
  IF NOT public.has_role(_doctor_id, 'doctor') OR public.user_is_demo(_doctor_id) <> public.current_user_is_demo() THEN
    RAISE EXCEPTION 'The selected user is not a doctor';
  END IF;

  SELECT * INTO v_req FROM public.appointment_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND OR public.patient_is_demo(v_req.patient_id) <> public.current_user_is_demo() THEN
    RAISE EXCEPTION 'Request not found';
  END IF;
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
  IF NOT FOUND OR public.patient_is_demo(v_req.patient_id) <> public.current_user_is_demo() THEN
    RAISE EXCEPTION 'Request not found';
  END IF;
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

-- New requests notify only the admins on the same side of the wall.
CREATE OR REPLACE FUNCTION public.notify_admins_on_appointment_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  patient_name TEXT;
BEGIN
  SELECT full_name INTO patient_name FROM public.patients WHERE id = NEW.patient_id;
  INSERT INTO public.notifications (user_id, title, message, type)
  SELECT ur.user_id,
         'New Appointment Request',
         COALESCE(patient_name, 'A patient') || ' requested an appointment' ||
           CASE WHEN NEW.reason IS NOT NULL AND NEW.reason <> '' THEN ': ' || NEW.reason ELSE '' END,
         'info'
  FROM public.user_roles ur
  WHERE ur.role = 'admin'
    AND public.user_is_demo(ur.user_id) = public.patient_is_demo(NEW.patient_id);
  RETURN NEW;
END;
$$;

-- Audit entries are tagged with the side of the wall the changed row belongs to.
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
  v_row JSONB;
  v_demo BOOLEAN;
BEGIN
  IF TG_OP = 'DELETE' THEN v_row := to_jsonb(OLD); ELSE v_row := to_jsonb(NEW); END IF;

  IF TG_OP = 'INSERT' THEN
    v_action := TG_ARGV[0] || '_created';
    v_record_id := NEW.id;
    v_details := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := TG_ARGV[0] || '_updated';
    v_record_id := NEW.id;
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

  v_demo := CASE
    WHEN TG_TABLE_NAME = 'patients' THEN (v_row ->> 'is_demo')::boolean
    WHEN v_row ? 'patient_id' THEN public.patient_is_demo((v_row ->> 'patient_id')::uuid)
    WHEN TG_TABLE_NAME = 'user_roles' THEN public.user_is_demo((v_row ->> 'user_id')::uuid)
    ELSE public.current_user_is_demo()
  END;

  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, details, is_demo)
  VALUES (auth.uid(), v_action, TG_TABLE_NAME, v_record_id, v_details, COALESCE(v_demo, false));

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- New confirmed accounts: demo accounts get demo patient records.
CREATE OR REPLACE FUNCTION public.ensure_patient_record()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match uuid;
  v_demo boolean := COALESCE((NEW.raw_app_meta_data ->> 'demo')::boolean, false);
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

  IF TG_OP = 'UPDATE' AND NOT v_demo THEN
    SELECT id INTO v_match FROM public.patients
    WHERE user_id IS NULL AND NOT is_demo AND lower(email) = lower(NEW.email);
    IF FOUND AND (SELECT count(*) FROM public.patients WHERE user_id IS NULL AND NOT is_demo AND lower(email) = lower(NEW.email)) = 1 THEN
      UPDATE public.patients SET user_id = NEW.id WHERE id = v_match;
      RETURN NEW;
    END IF;
  END IF;

  INSERT INTO public.patients (user_id, full_name, email, is_demo)
  VALUES (NEW.id, COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), NEW.email, 'Patient'), NEW.email, v_demo);
  RETURN NEW;
END;
$$;

-- "Last admin" safeguard counts real and demo admins separately, so the demo admin
-- never stands in for a real one.
CREATE OR REPLACE FUNCTION public.prevent_removing_last_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.role = 'admin'
     AND (TG_OP = 'DELETE' OR NEW.role <> 'admin' OR NEW.user_id <> OLD.user_id)
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles
       WHERE role = 'admin' AND id <> OLD.id
         AND public.user_is_demo(user_id) = public.user_is_demo(OLD.user_id)
     ) THEN
    RAISE EXCEPTION 'Cannot remove the last administrator';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_admins_on_appointment_request() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_audit_event() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ensure_patient_record() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_removing_last_admin() FROM PUBLIC, anon, authenticated;
