-- Create role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'doctor', 'nurse', 'patient');

-- Create appointment status enum
CREATE TYPE public.appointment_status AS ENUM ('scheduled', 'completed', 'cancelled', 'no_show');

-- Update timestamp function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT DEFAULT '',
  avatar_url TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- User roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'patient',
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Security definer function for role checks
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

-- Admin can view all roles
CREATE POLICY "Admins can view all roles" ON public.user_roles FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert roles" ON public.user_roles FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update roles" ON public.user_roles FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete roles" ON public.user_roles FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Patients table
CREATE TABLE public.patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  date_of_birth DATE,
  gender TEXT CHECK (gender IN ('male', 'female', 'other')),
  phone TEXT,
  email TEXT,
  address TEXT,
  emergency_contact TEXT,
  emergency_phone TEXT,
  blood_type TEXT CHECK (blood_type IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
  allergies TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Patients can view own record" ON public.patients FOR SELECT TO authenticated
USING (auth.uid() = user_id);
CREATE POLICY "Staff can view all patients" ON public.patients FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'doctor') OR public.has_role(auth.uid(), 'nurse') OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Staff can insert patients" ON public.patients FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'doctor') OR public.has_role(auth.uid(), 'nurse') OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Staff can update patients" ON public.patients FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'doctor') OR public.has_role(auth.uid(), 'nurse') OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_patients_updated_at BEFORE UPDATE ON public.patients
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Appointments table
CREATE TABLE public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  doctor_id UUID NOT NULL REFERENCES auth.users(id),
  appointment_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  status appointment_status NOT NULL DEFAULT 'scheduled',
  reason TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT no_time_overlap UNIQUE (doctor_id, appointment_date, start_time)
);
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Patients can view own appointments" ON public.appointments FOR SELECT TO authenticated
USING (patient_id IN (SELECT id FROM public.patients WHERE user_id = auth.uid()));
CREATE POLICY "Staff can view all appointments" ON public.appointments FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'doctor') OR public.has_role(auth.uid(), 'nurse') OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated can create appointments" ON public.appointments FOR INSERT TO authenticated
WITH CHECK (true);
CREATE POLICY "Staff can update appointments" ON public.appointments FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'doctor') OR public.has_role(auth.uid(), 'nurse') OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_appointments_updated_at BEFORE UPDATE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_appointments_date ON public.appointments(appointment_date);
CREATE INDEX idx_appointments_doctor ON public.appointments(doctor_id);
CREATE INDEX idx_appointments_patient ON public.appointments(patient_id);

-- Medical records table
CREATE TABLE public.medical_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  doctor_id UUID NOT NULL REFERENCES auth.users(id),
  record_date DATE NOT NULL DEFAULT CURRENT_DATE,
  diagnosis TEXT,
  symptoms TEXT,
  treatment TEXT,
  prescription TEXT,
  notes TEXT,
  follow_up_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.medical_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Patients can view own records" ON public.medical_records FOR SELECT TO authenticated
USING (patient_id IN (SELECT id FROM public.patients WHERE user_id = auth.uid()));
CREATE POLICY "Doctors can view all records" ON public.medical_records FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'doctor') OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Doctors can create records" ON public.medical_records FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'doctor'));
CREATE POLICY "Doctors can update records" ON public.medical_records FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'doctor'));
CREATE POLICY "Nurses can view records" ON public.medical_records FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'nurse'));

CREATE TRIGGER update_medical_records_updated_at BEFORE UPDATE ON public.medical_records
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Audit logs table
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  table_name TEXT,
  record_id UUID,
  details JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view audit logs" ON public.audit_logs FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "System can insert audit logs" ON public.audit_logs FOR INSERT TO authenticated
WITH CHECK (true);

CREATE INDEX idx_audit_logs_user ON public.audit_logs(user_id);
CREATE INDEX idx_audit_logs_created ON public.audit_logs(created_at);

-- Notifications table
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info',
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own notifications" ON public.notifications FOR SELECT TO authenticated
USING (auth.uid() = user_id);
CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE TO authenticated
USING (auth.uid() = user_id);
CREATE POLICY "System can create notifications" ON public.notifications FOR INSERT TO authenticated
WITH CHECK (true);

-- Auto-create profile and role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), NEW.email);
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'patient');
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();