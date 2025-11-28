-- Add soft delete and rejection tracking to professional_applications
ALTER TABLE professional_applications 
ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN deleted_by UUID REFERENCES auth.users(id) DEFAULT NULL,
ADD COLUMN rejection_reason TEXT DEFAULT NULL,
ADD COLUMN rejected_at TIMESTAMPTZ DEFAULT NULL;

-- Add index for faster deleted/archived queries
CREATE INDEX idx_professional_applications_deleted_at ON professional_applications(deleted_at);
CREATE INDEX idx_professional_applications_pipeline_stage ON professional_applications(pipeline_stage);

-- Update RLS policies to include deleted_at filter
DROP POLICY IF EXISTS "Admins and managers can view applications" ON professional_applications;
CREATE POLICY "Admins and managers can view applications"
ON professional_applications FOR SELECT
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  AND (org_id IS NULL OR EXISTS (
    SELECT 1 FROM user_organizations 
    WHERE org_id = professional_applications.org_id 
    AND user_id = auth.uid()
  ))
);

-- Add comment for clarity
COMMENT ON COLUMN professional_applications.deleted_at IS 'Soft delete timestamp - applications with this set are in archive';
COMMENT ON COLUMN professional_applications.rejection_reason IS 'Reason for rejection: niet_geschikt, geen_reactie, teruggetrokken, andere';
COMMENT ON COLUMN professional_applications.rejected_at IS 'Timestamp when application was moved to afgewezen stage';