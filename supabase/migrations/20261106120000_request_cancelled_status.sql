-- Patients can withdraw a pending appointment request.
-- Kept in its own migration: a new enum value can't be used in the same transaction that adds it.
ALTER TYPE public.appointment_request_status ADD VALUE IF NOT EXISTS 'cancelled';
