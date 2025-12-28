-- Enable REPLICA IDENTITY FULL voor agent_goals
-- Dit zorgt dat UPDATE events de volledige row data bevatten
ALTER TABLE public.agent_goals REPLICA IDENTITY FULL;

-- Voeg agent_goals toe aan realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_goals;