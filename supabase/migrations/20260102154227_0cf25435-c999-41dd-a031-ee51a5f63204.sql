-- Table: recruiter_notifications
-- Persistent notifications for recruiters with realtime support

CREATE TABLE public.recruiter_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  user_id UUID REFERENCES auth.users(id), -- NULL = broadcast to all recruiters in org
  
  -- Notification content
  notification_type TEXT NOT NULL, -- 'diploma_upgrade', 'vog_verified', etc.
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  
  -- Related entities
  application_id UUID REFERENCES professional_applications(id) ON DELETE CASCADE,
  professional_id UUID REFERENCES professionals(id) ON DELETE SET NULL,
  
  -- Notification state
  read_at TIMESTAMP WITH TIME ZONE,
  dismissed_at TIMESTAMP WITH TIME ZONE,
  email_sent_at TIMESTAMP WITH TIME ZONE,
  
  -- Metadata for extra context
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Indexes for efficient queries
CREATE INDEX idx_recruiter_notifications_org_unread 
ON recruiter_notifications(org_id, created_at DESC) 
WHERE read_at IS NULL AND dismissed_at IS NULL;

CREATE INDEX idx_recruiter_notifications_user 
ON recruiter_notifications(user_id, created_at DESC);

CREATE INDEX idx_recruiter_notifications_type 
ON recruiter_notifications(notification_type);

-- Enable realtime for toast notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.recruiter_notifications;

-- RLS policies
ALTER TABLE recruiter_notifications ENABLE ROW LEVEL SECURITY;

-- Users can read notifications for their org (broadcast) or specifically assigned to them
CREATE POLICY "Users can read org or personal notifications"
ON recruiter_notifications FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_organizations uo
    WHERE uo.user_id = auth.uid()
    AND uo.org_id = recruiter_notifications.org_id
  )
  OR user_id = auth.uid()
);

-- Users can update (mark as read/dismissed) their own or broadcast notifications
CREATE POLICY "Users can update notifications"
ON recruiter_notifications FOR UPDATE
USING (
  user_id = auth.uid() 
  OR (
    user_id IS NULL 
    AND EXISTS (
      SELECT 1 FROM user_organizations uo
      WHERE uo.user_id = auth.uid()
      AND uo.org_id = recruiter_notifications.org_id
    )
  )
);

-- Service role can insert notifications (from edge functions)
CREATE POLICY "Service role can insert notifications"
ON recruiter_notifications FOR INSERT
WITH CHECK (true);