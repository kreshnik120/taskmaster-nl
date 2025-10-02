-- Extend professionals table for ZZP/Uitzendkracht detection
ALTER TABLE public.professionals
ADD COLUMN werkvorm TEXT CHECK (werkvorm IN ('ZZP', 'Uitzendkracht', 'Beide')),
ADD COLUMN kvk_nummer TEXT,
ADD COLUMN btw_nummer TEXT,
ADD COLUMN gewenst_uurloon NUMERIC,
ADD COLUMN cao_akkoord BOOLEAN DEFAULT false;

-- Create professional_applications table for tracking applications
CREATE TABLE public.professional_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id UUID NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  org_id UUID NOT NULL,
  email_from TEXT NOT NULL,
  email_subject TEXT,
  email_body TEXT,
  cv_file_path TEXT,
  cv_file_name TEXT,
  status TEXT NOT NULL DEFAULT 'nieuw' CHECK (status IN ('nieuw', 'in_verwerking', 'in_gesprek', 'klaar_voor_review', 'afspraak_gepland', 'afgewezen', 'geaccepteerd')),
  completeness_score NUMERIC DEFAULT 0,
  missing_info JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create application_conversations table for AI chat history
CREATE TABLE public.application_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES public.professional_applications(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create interview_appointments table for scheduled interviews
CREATE TABLE public.interview_appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id UUID NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  application_id UUID NOT NULL REFERENCES public.professional_applications(id) ON DELETE CASCADE,
  task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  org_id UUID NOT NULL,
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
  duration_min INTEGER DEFAULT 60,
  location TEXT,
  meeting_link TEXT,
  recruiter_id UUID,
  status TEXT NOT NULL DEFAULT 'gepland' CHECK (status IN ('gepland', 'bevestigd', 'geannuleerd', 'voltooid')),
  confirmation_sent_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on new tables
ALTER TABLE public.professional_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.application_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interview_appointments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for professional_applications
CREATE POLICY "Org members can view applications"
ON public.professional_applications
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_organizations
    WHERE user_organizations.org_id = professional_applications.org_id
    AND user_organizations.user_id = auth.uid()
  )
);

CREATE POLICY "Org members can insert applications"
ON public.professional_applications
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_organizations
    WHERE user_organizations.org_id = professional_applications.org_id
    AND user_organizations.user_id = auth.uid()
  )
);

CREATE POLICY "Org members can update applications"
ON public.professional_applications
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.user_organizations
    WHERE user_organizations.org_id = professional_applications.org_id
    AND user_organizations.user_id = auth.uid()
  )
);

CREATE POLICY "Org members can delete applications"
ON public.professional_applications
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.user_organizations
    WHERE user_organizations.org_id = professional_applications.org_id
    AND user_organizations.user_id = auth.uid()
  )
);

-- RLS Policies for application_conversations
CREATE POLICY "Org members can view conversations"
ON public.application_conversations
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.professional_applications pa
    JOIN public.user_organizations uo ON uo.org_id = pa.org_id
    WHERE pa.id = application_conversations.application_id
    AND uo.user_id = auth.uid()
  )
);

CREATE POLICY "Org members can insert conversations"
ON public.application_conversations
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.professional_applications pa
    JOIN public.user_organizations uo ON uo.org_id = pa.org_id
    WHERE pa.id = application_conversations.application_id
    AND uo.user_id = auth.uid()
  )
);

-- RLS Policies for interview_appointments
CREATE POLICY "Org members can view appointments"
ON public.interview_appointments
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_organizations
    WHERE user_organizations.org_id = interview_appointments.org_id
    AND user_organizations.user_id = auth.uid()
  )
);

CREATE POLICY "Org members can insert appointments"
ON public.interview_appointments
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_organizations
    WHERE user_organizations.org_id = interview_appointments.org_id
    AND user_organizations.user_id = auth.uid()
  )
);

CREATE POLICY "Org members can update appointments"
ON public.interview_appointments
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.user_organizations
    WHERE user_organizations.org_id = interview_appointments.org_id
    AND user_organizations.user_id = auth.uid()
  )
);

CREATE POLICY "Org members can delete appointments"
ON public.interview_appointments
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.user_organizations
    WHERE user_organizations.org_id = interview_appointments.org_id
    AND user_organizations.user_id = auth.uid()
  )
);

-- Create updated_at trigger for professional_applications
CREATE TRIGGER update_professional_applications_updated_at
BEFORE UPDATE ON public.professional_applications
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create updated_at trigger for interview_appointments
CREATE TRIGGER update_interview_appointments_updated_at
BEFORE UPDATE ON public.interview_appointments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();