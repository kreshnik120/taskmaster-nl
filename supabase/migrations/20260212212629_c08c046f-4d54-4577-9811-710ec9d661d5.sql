ALTER TABLE diensten ADD CONSTRAINT chk_gevraagd_aantal CHECK (gevraagd_aantal > 0);
ALTER TABLE diensten ADD CONSTRAINT chk_pauze_minuten CHECK (pauze_minuten >= 0 AND pauze_minuten <= 480);
ALTER TABLE dienst_toewijzingen ADD CONSTRAINT chk_positie_nr_positive CHECK (positie_nr > 0);