-- Security fix: Voeg search_path toe aan assignment functies
ALTER FUNCTION update_assignments_updated_at() SET search_path = public;
ALTER FUNCTION log_assignment_events() SET search_path = public;