-- Add columns for forecast generator and task enrichment
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'todo';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS estimated_hours NUMERIC;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_forecast BOOLEAN DEFAULT false;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS forecast_metadata JSONB DEFAULT '{}'::jsonb;

-- Add index for forecast tasks for better query performance
CREATE INDEX IF NOT EXISTS idx_tasks_is_forecast ON tasks(is_forecast) WHERE is_forecast = true;
CREATE INDEX IF NOT EXISTS idx_tasks_category ON tasks(category) WHERE category IS NOT NULL;