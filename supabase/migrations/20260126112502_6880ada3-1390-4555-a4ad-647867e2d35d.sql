-- =====================================================
-- NOTULEN MODULE - FASE 1: Database Schema
-- =====================================================

-- Create meeting_minutes table (1:1 linked to tasks)
CREATE TABLE public.meeting_minutes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE UNIQUE NOT NULL,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  meeting_type TEXT CHECK (meeting_type IN ('team', 'board', 'project', 'klant', 'overig')) DEFAULT 'team',
  location TEXT,
  meeting_link TEXT,
  agenda_items JSONB DEFAULT '[]'::jsonb,
  decisions JSONB DEFAULT '[]'::jsonb,
  content TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'approved', 'archived')),
  approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  next_meeting_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_meeting_minutes_task ON public.meeting_minutes(task_id);
CREATE INDEX idx_meeting_minutes_org ON public.meeting_minutes(org_id);
CREATE INDEX idx_meeting_minutes_status ON public.meeting_minutes(status);
CREATE INDEX idx_meeting_minutes_created ON public.meeting_minutes(created_at DESC);

-- Create meeting_attendees table
CREATE TABLE public.meeting_attendees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.meeting_minutes(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  external_name TEXT,
  external_email TEXT,
  role TEXT DEFAULT 'deelnemer' CHECK (role IN ('voorzitter', 'notulist', 'deelnemer', 'afwezig')),
  attended BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for lookups
CREATE INDEX idx_meeting_attendees_meeting ON public.meeting_attendees(meeting_id);
CREATE INDEX idx_meeting_attendees_user ON public.meeting_attendees(user_id);

-- Enable RLS
ALTER TABLE public.meeting_minutes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_attendees ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- RLS POLICIES: meeting_minutes
-- =====================================================

CREATE POLICY "Org members can view meeting minutes"
ON public.meeting_minutes FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_organizations
    WHERE user_organizations.org_id = meeting_minutes.org_id
    AND user_organizations.user_id = auth.uid()
  )
);

CREATE POLICY "Org members can insert meeting minutes"
ON public.meeting_minutes FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_organizations
    WHERE user_organizations.org_id = meeting_minutes.org_id
    AND user_organizations.user_id = auth.uid()
  )
);

CREATE POLICY "Org members can update meeting minutes"
ON public.meeting_minutes FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_organizations
    WHERE user_organizations.org_id = meeting_minutes.org_id
    AND user_organizations.user_id = auth.uid()
  )
);

CREATE POLICY "Org members can delete meeting minutes"
ON public.meeting_minutes FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_organizations
    WHERE user_organizations.org_id = meeting_minutes.org_id
    AND user_organizations.user_id = auth.uid()
  )
);

-- =====================================================
-- RLS POLICIES: meeting_attendees (via parent meeting)
-- =====================================================

CREATE POLICY "Org members can view attendees"
ON public.meeting_attendees FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.meeting_minutes mm
    JOIN public.user_organizations uo ON uo.org_id = mm.org_id
    WHERE mm.id = meeting_attendees.meeting_id
    AND uo.user_id = auth.uid()
  )
);

CREATE POLICY "Org members can insert attendees"
ON public.meeting_attendees FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.meeting_minutes mm
    JOIN public.user_organizations uo ON uo.org_id = mm.org_id
    WHERE mm.id = meeting_attendees.meeting_id
    AND uo.user_id = auth.uid()
  )
);

CREATE POLICY "Org members can update attendees"
ON public.meeting_attendees FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.meeting_minutes mm
    JOIN public.user_organizations uo ON uo.org_id = mm.org_id
    WHERE mm.id = meeting_attendees.meeting_id
    AND uo.user_id = auth.uid()
  )
);

CREATE POLICY "Org members can delete attendees"
ON public.meeting_attendees FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.meeting_minutes mm
    JOIN public.user_organizations uo ON uo.org_id = mm.org_id
    WHERE mm.id = meeting_attendees.meeting_id
    AND uo.user_id = auth.uid()
  )
);

-- =====================================================
-- TRIGGER: Auto-update updated_at
-- =====================================================

CREATE TRIGGER update_meeting_minutes_updated_at
BEFORE UPDATE ON public.meeting_minutes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();