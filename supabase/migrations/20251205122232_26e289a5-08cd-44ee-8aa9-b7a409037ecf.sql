-- Add partial unique constraint to prevent duplicate active placements
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_placement 
ON assignments (professional_id, sublocation_id) 
WHERE status = 'active';

COMMENT ON INDEX idx_unique_active_placement IS 'Prevents duplicate active placements: a professional can only be actively placed once at each sublocation';