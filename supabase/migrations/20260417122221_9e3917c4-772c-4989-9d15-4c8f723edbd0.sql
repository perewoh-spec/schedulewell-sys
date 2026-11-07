
CREATE TYPE public.appointment_request_status AS ENUM ('pending', 'approved', 'declined');

CREATE TABLE public.appointment_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  preferred_date DATE NOT NULL,
  preferred_time TIME NOT NULL,
  reason TEXT,
  notes TEXT,
  status public.appointment_request_status NOT NULL DEFAULT 'pending',
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  reviewed_by UUID,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  decline_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.appointment_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Patients can view own requests"
ON public.appointment_requests FOR SELECT TO authenticated
USING (patient_id IN (SELECT id FROM public.patients WHERE user_id = auth.uid()));

CREATE POLICY "Staff can view all requests"
ON public.appointment_requests FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'doctor')
  OR public.has_role(auth.uid(), 'nurse')
);

CREATE POLICY "Patients can create own requests"
ON public.appointment_requests FOR INSERT TO authenticated
WITH CHECK (patient_id IN (SELECT id FROM public.patients WHERE user_id = auth.uid()));

CREATE POLICY "Staff can update requests"
ON public.appointment_requests FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'doctor')
  OR public.has_role(auth.uid(), 'nurse')
);

CREATE POLICY "Patients can cancel own pending requests"
ON public.appointment_requests FOR UPDATE TO authenticated
USING (
  patient_id IN (SELECT id FROM public.patients WHERE user_id = auth.uid())
  AND status = 'pending'
);

CREATE TRIGGER update_appointment_requests_updated_at
BEFORE UPDATE ON public.appointment_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_appointment_requests_patient ON public.appointment_requests(patient_id);
CREATE INDEX idx_appointment_requests_status ON public.appointment_requests(status);
