-- Fase 7C: Notulen Assistent - Database Schema Updates

-- 1. Action items JSONB kolom voor meeting minutes (zoals decisions/agenda_items)
ALTER TABLE meeting_minutes 
ADD COLUMN action_items JSONB DEFAULT '[]'::jsonb;

-- 2. Source link van tasks naar meeting minutes
ALTER TABLE tasks 
ADD COLUMN source_meeting_minute_id UUID REFERENCES meeting_minutes(id);

-- 3. Index voor efficiënte queries op source_meeting_minute_id
CREATE INDEX idx_tasks_source_meeting_minute_id 
ON tasks(source_meeting_minute_id) 
WHERE source_meeting_minute_id IS NOT NULL;

-- 4. Commentaar voor documentatie
COMMENT ON COLUMN meeting_minutes.action_items IS 'AI-geëxtraheerde action items met classificatie (TAAK/IDEE/INFORMATIE), urgentie, en source_quote';
COMMENT ON COLUMN tasks.source_meeting_minute_id IS 'Link naar de meeting minute waaruit deze taak is aangemaakt via Notulen Assistent';