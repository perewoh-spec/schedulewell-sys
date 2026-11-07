-- Fix appointment insert policy
DROP POLICY "Authenticated can create appointments" ON public.appointments;
CREATE POLICY "Users can create own appointments" ON public.appointments FOR INSERT TO authenticated
WITH CHECK (
  patient_id IN (SELECT id FROM public.patients WHERE user_id = auth.uid())
  OR public.has_role(auth.uid(), 'doctor')
  OR public.has_role(auth.uid(), 'nurse')
  OR public.has_role(auth.uid(), 'admin')
);

-- Fix audit log insert policy
DROP POLICY "System can insert audit logs" ON public.audit_logs;
CREATE POLICY "Authenticated can insert audit logs" ON public.audit_logs FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Fix notifications insert policy
DROP POLICY "System can create notifications" ON public.notifications;
CREATE POLICY "Staff can create notifications" ON public.notifications FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'doctor')
  OR public.has_role(auth.uid(), 'nurse')
  OR public.has_role(auth.uid(), 'admin')
);