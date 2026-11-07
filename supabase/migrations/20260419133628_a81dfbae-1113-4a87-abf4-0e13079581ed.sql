-- Trigger to notify all admins when a new appointment request is created
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
  WHERE ur.role = 'admin';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_admins_on_appointment_request ON public.appointment_requests;
CREATE TRIGGER trg_notify_admins_on_appointment_request
AFTER INSERT ON public.appointment_requests
FOR EACH ROW
EXECUTE FUNCTION public.notify_admins_on_appointment_request();