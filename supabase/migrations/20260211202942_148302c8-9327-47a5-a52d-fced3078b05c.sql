
-- ============================================================
-- DIENSTEN PLANNING MODULE — Database Fundament
-- 3 tabellen + 2 triggers + RLS + indexes + realtime
-- ============================================================

-- ==================== TABEL 1: diensten ====================
CREATE TABLE public.diensten (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  sublocation_id UUID NOT NULL REFERENCES public.client_sublocations(id),
  titel TEXT NOT NULL,
  datum DATE NOT NULL,
  start_tijd TIME NOT NULL,
  eind_tijd TIME NOT NULL,
  pauze_minuten INTEGER DEFAULT 0,
  netto_uren NUMERIC(5,2) GENERATED ALWAYS AS (
    ROUND(EXTRACT(EPOCH FROM (eind_tijd - start_tijd)) / 3600 - pauze_minuten / 60.0, 2)
  ) STORED,
  gevraagd_functie_niveau TEXT,
  gevraagd_aantal INTEGER DEFAULT 1,
  werkvorm TEXT,
  dienst_type TEXT DEFAULT 'dag' CHECK (dienst_type IN ('dag', 'avond', 'nacht', 'weekend')),
  tarief_per_uur NUMERIC(10,2),
  prive_opmerking TEXT,
  publieke_opmerking TEXT,
  status TEXT DEFAULT 'concept' CHECK (status IN ('concept', 'open', 'deels_bezet', 'volledig_bezet', 'voltooid', 'geannuleerd')),
  accepteerbaar BOOLEAN DEFAULT true,
  herhaling TEXT DEFAULT 'geen' CHECK (herhaling IN ('geen', 'dagelijks', 'wekelijks', 'tweewekelijks')),
  herhaling_eind_datum DATE,
  herhaling_parent_id UUID REFERENCES public.diensten(id),
  bron TEXT DEFAULT 'handmatig' CHECK (bron IN ('handmatig', 'gekopieerd', 'herhaling', 'geimporteerd')),
  aangemaakt_door UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_diensten_datum ON public.diensten(datum);
CREATE INDEX idx_diensten_org ON public.diensten(org_id);
CREATE INDEX idx_diensten_sublocation ON public.diensten(sublocation_id);
CREATE INDEX idx_diensten_status ON public.diensten(status);
CREATE INDEX idx_diensten_datum_status ON public.diensten(datum, status);

CREATE TRIGGER update_diensten_updated_at
  BEFORE UPDATE ON public.diensten
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.diensten ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_select" ON public.diensten FOR SELECT USING (
  org_id IN (SELECT org_id FROM public.user_organizations WHERE user_id = auth.uid())
);
CREATE POLICY "org_insert" ON public.diensten FOR INSERT WITH CHECK (
  org_id IN (SELECT org_id FROM public.user_organizations WHERE user_id = auth.uid())
);
CREATE POLICY "org_update" ON public.diensten FOR UPDATE USING (
  org_id IN (SELECT org_id FROM public.user_organizations WHERE user_id = auth.uid())
);
CREATE POLICY "org_delete" ON public.diensten FOR DELETE USING (
  org_id IN (SELECT org_id FROM public.user_organizations WHERE user_id = auth.uid())
);

ALTER PUBLICATION supabase_realtime ADD TABLE public.diensten;

-- ==================== TABEL 2: dienst_toewijzingen ====================
CREATE TABLE public.dienst_toewijzingen (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  dienst_id UUID NOT NULL REFERENCES public.diensten(id) ON DELETE CASCADE,
  professional_id UUID NOT NULL REFERENCES public.professionals(id),
  status TEXT DEFAULT 'voorgesteld' CHECK (status IN (
    'voorgesteld', 'positief', 'misschien', 'bevestigd', 'afgewezen', 'no_show', 'voltooid'
  )),
  reactie_op TIMESTAMPTZ,
  reactie_door TEXT,
  toewijzing_notities TEXT,
  toegewezen_door UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(dienst_id, professional_id)
);

CREATE INDEX idx_dt_dienst ON public.dienst_toewijzingen(dienst_id);
CREATE INDEX idx_dt_professional ON public.dienst_toewijzingen(professional_id);
CREATE INDEX idx_dt_status ON public.dienst_toewijzingen(status);

CREATE TRIGGER update_dienst_toewijzingen_updated_at
  BEFORE UPDATE ON public.dienst_toewijzingen
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.dienst_toewijzingen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "via_dienst_org_select" ON public.dienst_toewijzingen FOR SELECT USING (
  dienst_id IN (SELECT id FROM public.diensten WHERE org_id IN (
    SELECT org_id FROM public.user_organizations WHERE user_id = auth.uid()
  ))
);
CREATE POLICY "via_dienst_org_insert" ON public.dienst_toewijzingen FOR INSERT WITH CHECK (
  dienst_id IN (SELECT id FROM public.diensten WHERE org_id IN (
    SELECT org_id FROM public.user_organizations WHERE user_id = auth.uid()
  ))
);
CREATE POLICY "via_dienst_org_update" ON public.dienst_toewijzingen FOR UPDATE USING (
  dienst_id IN (SELECT id FROM public.diensten WHERE org_id IN (
    SELECT org_id FROM public.user_organizations WHERE user_id = auth.uid()
  ))
);
CREATE POLICY "via_dienst_org_delete" ON public.dienst_toewijzingen FOR DELETE USING (
  dienst_id IN (SELECT id FROM public.diensten WHERE org_id IN (
    SELECT org_id FROM public.user_organizations WHERE user_id = auth.uid()
  ))
);

ALTER PUBLICATION supabase_realtime ADD TABLE public.dienst_toewijzingen;

-- ==================== TABEL 3: dienst_filter_presets ====================
CREATE TABLE public.dienst_filter_presets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  naam TEXT NOT NULL,
  filters JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.dienst_filter_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_presets" ON public.dienst_filter_presets FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ==================== TRIGGER: Overlap Check ====================
CREATE OR REPLACE FUNCTION public.check_dienst_overlap()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.dienst_toewijzingen dt
    JOIN public.diensten d1 ON d1.id = dt.dienst_id
    JOIN public.diensten d2 ON d2.id = NEW.dienst_id
    WHERE dt.professional_id = NEW.professional_id
      AND dt.status IN ('bevestigd', 'positief')
      AND d1.datum = d2.datum
      AND d1.id != d2.id
      AND d1.start_tijd < d2.eind_tijd
      AND d1.eind_tijd > d2.start_tijd
  ) THEN
    RAISE EXCEPTION 'Professional heeft al een overlappende dienst op deze datum/tijd';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_overlap
  BEFORE INSERT OR UPDATE ON public.dienst_toewijzingen
  FOR EACH ROW EXECUTE FUNCTION public.check_dienst_overlap();

-- ==================== TRIGGER: Auto Status Update ====================
CREATE OR REPLACE FUNCTION public.update_dienst_status()
RETURNS TRIGGER AS $$
DECLARE
  v_dienst_id UUID;
  v_gevraagd INTEGER;
  v_bezet INTEGER;
BEGIN
  v_dienst_id := COALESCE(NEW.dienst_id, OLD.dienst_id);

  SELECT gevraagd_aantal INTO v_gevraagd FROM public.diensten WHERE id = v_dienst_id;

  SELECT COUNT(*) INTO v_bezet FROM public.dienst_toewijzingen
    WHERE dienst_id = v_dienst_id AND status IN ('bevestigd', 'positief');

  UPDATE public.diensten SET
    status = CASE
      WHEN v_bezet = 0 THEN 'open'
      WHEN v_bezet >= v_gevraagd THEN 'volledig_bezet'
      ELSE 'deels_bezet'
    END,
    updated_at = now()
  WHERE id = v_dienst_id AND status NOT IN ('concept', 'voltooid', 'geannuleerd');

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_update_dienst_status
  AFTER INSERT OR UPDATE OR DELETE ON public.dienst_toewijzingen
  FOR EACH ROW EXECUTE FUNCTION public.update_dienst_status();
