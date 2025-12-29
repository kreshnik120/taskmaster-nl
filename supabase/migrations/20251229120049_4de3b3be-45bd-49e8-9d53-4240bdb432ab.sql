
-- Add Fast Path tracking columns to message_feedback table
ALTER TABLE public.message_feedback 
ADD COLUMN IF NOT EXISTS is_fast_path boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS fast_path_log_id uuid REFERENCES public.fast_path_usage_log(id),
ADD COLUMN IF NOT EXISTS pattern_id uuid REFERENCES public.fast_path_patterns(id);

-- Create index for faster Fast Path feedback queries
CREATE INDEX IF NOT EXISTS idx_message_feedback_fast_path ON public.message_feedback(fast_path_log_id) WHERE fast_path_log_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_message_feedback_pattern ON public.message_feedback(pattern_id) WHERE pattern_id IS NOT NULL;

COMMENT ON COLUMN public.message_feedback.is_fast_path IS 'Whether this feedback is for a Fast Path response';
COMMENT ON COLUMN public.message_feedback.fast_path_log_id IS 'Reference to the fast_path_usage_log entry';
COMMENT ON COLUMN public.message_feedback.pattern_id IS 'Reference to the fast_path_pattern if dynamic pattern was used';
