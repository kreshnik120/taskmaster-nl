-- Create application_notes table
CREATE TABLE IF NOT EXISTS public.application_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES public.professional_applications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  is_pinned BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.application_notes ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Org members can view notes"
  ON public.application_notes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.professional_applications pa
      JOIN public.user_organizations uo ON uo.org_id = pa.org_id
      WHERE pa.id = application_notes.application_id
      AND uo.user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can create notes"
  ON public.application_notes
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM public.professional_applications pa
      JOIN public.user_organizations uo ON uo.org_id = pa.org_id
      WHERE pa.id = application_notes.application_id
      AND uo.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own notes"
  ON public.application_notes
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own notes"
  ON public.application_notes
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create updated_at trigger
CREATE TRIGGER update_application_notes_updated_at
  BEFORE UPDATE ON public.application_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster queries
CREATE INDEX idx_application_notes_application_id ON public.application_notes(application_id);
CREATE INDEX idx_application_notes_user_id ON public.application_notes(user_id);

-- Enable realtime for professional_applications
ALTER PUBLICATION supabase_realtime ADD TABLE public.professional_applications;