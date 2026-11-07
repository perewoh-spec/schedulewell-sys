CREATE POLICY "Users can create own patient profile"
ON public.patients
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own patient profile"
ON public.patients
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);