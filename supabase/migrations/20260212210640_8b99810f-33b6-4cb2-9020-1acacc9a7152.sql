ALTER TABLE dienst_toewijzingen ADD COLUMN positie_nr INTEGER NOT NULL DEFAULT 1;

ALTER TABLE dienst_toewijzingen DROP CONSTRAINT IF EXISTS dienst_toewijzingen_dienst_id_professional_id_key;

ALTER TABLE dienst_toewijzingen ADD CONSTRAINT dienst_toewijzingen_dienst_positie_professional_key
  UNIQUE (dienst_id, positie_nr, professional_id);

CREATE INDEX idx_dt_positie ON dienst_toewijzingen(dienst_id, positie_nr);