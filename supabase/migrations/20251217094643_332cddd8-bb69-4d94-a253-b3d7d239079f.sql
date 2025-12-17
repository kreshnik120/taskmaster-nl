
-- Tijdelijk trigger uitschakelen, extracted_data fixen, trigger weer inschakelen
ALTER TABLE professional_applications DISABLE TRIGGER auto_recalculate_matches;

UPDATE professional_applications 
SET extracted_data = extracted_data - 'full_name'
WHERE extracted_data->>'full_name' = 'Voor- en achternaam';

ALTER TABLE professional_applications ENABLE TRIGGER auto_recalculate_matches;
