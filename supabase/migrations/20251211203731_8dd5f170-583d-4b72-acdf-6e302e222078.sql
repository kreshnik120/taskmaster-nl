-- Allow service role to manage application_sublocation_matches
CREATE POLICY "Service role can manage all matches" 
ON public.application_sublocation_matches 
FOR ALL 
USING (true) 
WITH CHECK (true);