-- Update column names to Dutch
UPDATE columns SET name = 'Klaar' WHERE status = 'READY';
UPDATE columns SET name = 'Bezig' WHERE status = 'DOING';
UPDATE columns SET name = 'Geblokkeerd' WHERE status = 'BLOCKED';
UPDATE columns SET name = 'Afgerond' WHERE status = 'DONE';