
-- Verwijder duplicate trigger die dezelfde functie aanroept
DROP TRIGGER IF EXISTS log_assignment_events_trigger ON assignments;
