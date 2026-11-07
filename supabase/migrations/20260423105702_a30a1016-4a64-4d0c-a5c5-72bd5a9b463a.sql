
-- Generic audit logging function
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
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := TG_ARGV[0] || '_created';
    v_record_id := NEW.id;
    v_details := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := TG_ARGV[0] || '_updated';
    v_record_id := NEW.id;
    -- For status changes, highlight them
    IF TG_TABLE_NAME = 'appointments' AND OLD.status IS DISTINCT FROM NEW.status THEN
      v_action := 'appointment_status_' || NEW.status::text;
      v_details := jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status, 'appointment_id', NEW.id);
    ELSIF TG_TABLE_NAME = 'appointment_requests' AND OLD.status IS DISTINCT FROM NEW.status THEN
      v_action := 'request_' || NEW.status::text;
      v_details := jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status, 'request_id', NEW.id);
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

-- Appointments
DROP TRIGGER IF EXISTS trg_audit_appointments ON public.appointments;
CREATE TRIGGER trg_audit_appointments
AFTER INSERT OR UPDATE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.log_audit_event('appointment');

-- Appointment requests
DROP TRIGGER IF EXISTS trg_audit_appointment_requests ON public.appointment_requests;
CREATE TRIGGER trg_audit_appointment_requests
AFTER INSERT OR UPDATE ON public.appointment_requests
FOR EACH ROW EXECUTE FUNCTION public.log_audit_event('appointment_request');

-- Medical records
DROP TRIGGER IF EXISTS trg_audit_medical_records ON public.medical_records;
CREATE TRIGGER trg_audit_medical_records
AFTER INSERT OR UPDATE ON public.medical_records
FOR EACH ROW EXECUTE FUNCTION public.log_audit_event('medical_record');

-- Patients
DROP TRIGGER IF EXISTS trg_audit_patients ON public.patients;
CREATE TRIGGER trg_audit_patients
AFTER INSERT OR UPDATE ON public.patients
FOR EACH ROW EXECUTE FUNCTION public.log_audit_event('patient');

-- User roles
DROP TRIGGER IF EXISTS trg_audit_user_roles ON public.user_roles;
CREATE TRIGGER trg_audit_user_roles
AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.log_audit_event('user_role');
