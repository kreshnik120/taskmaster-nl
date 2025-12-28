-- Source tracking voor externe sollicitaties (Citozorg, ABCzorg)
ALTER TABLE professional_applications 
ADD COLUMN IF NOT EXISTS source_project TEXT DEFAULT 'taskmaster',
ADD COLUMN IF NOT EXISTS source_label TEXT;

-- Index voor efficiënt filteren op source
CREATE INDEX IF NOT EXISTS idx_applications_source 
ON professional_applications(source_project, source_label) 
WHERE deleted_at IS NULL;

-- Commentaar
COMMENT ON COLUMN professional_applications.source_project IS 'Source project: taskmaster, citozorg, abczorg';
COMMENT ON COLUMN professional_applications.source_label IS 'Applicant type label: [UITZENDKRACHT] or [ZZP''ER]';