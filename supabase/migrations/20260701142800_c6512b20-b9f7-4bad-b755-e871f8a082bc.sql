
-- 1. Fix profiles exposure
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
CREATE POLICY "Users can view own or staff can view all profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'doctor'::app_role)
    OR public.has_role(auth.uid(), 'nurse'::app_role)
  );

-- 2. Remove nurses' blanket access to medical records
DROP POLICY IF EXISTS "Nurses can view records" ON public.medical_records;

-- 3. Appointments insert must record creator
DROP POLICY IF EXISTS "Users can create own appointments" ON public.appointments;
CREATE POLICY "Users can create own appointments"
  ON public.appointments FOR INSERT TO authenticated
  WITH CHECK (
    (
      patient_id IN (SELECT p.id FROM public.patients p WHERE p.user_id = auth.uid())
      AND created_by = auth.uid()
    )
    OR (
      (
        public.has_role(auth.uid(), 'doctor'::app_role)
        OR public.has_role(auth.uid(), 'nurse'::app_role)
        OR public.has_role(auth.uid(), 'admin'::app_role)
      )
      AND created_by = auth.uid()
    )
  );

-- 4. Switch helper functions to SECURITY INVOKER so they can't be misused via direct RPC
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$function$;

CREATE OR REPLACE FUNCTION public.is_appointment_participant(_appointment_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.appointments a
    LEFT JOIN public.patients p ON p.id = a.patient_id
    WHERE a.id = _appointment_id
      AND a.status = 'scheduled'
      AND (a.doctor_id = _user_id OR p.user_id = _user_id)
  )
$function$;
