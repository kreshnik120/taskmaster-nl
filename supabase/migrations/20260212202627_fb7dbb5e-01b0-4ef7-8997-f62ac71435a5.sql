
CREATE TABLE dienst_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  naam TEXT NOT NULL,
  template_data JSONB NOT NULL DEFAULT '{}',
  aangemaakt_door UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_dienst_templates_org ON dienst_templates(org_id);
CREATE INDEX idx_dienst_templates_user ON dienst_templates(aangemaakt_door);

ALTER TABLE dienst_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dienst_templates_select" ON dienst_templates FOR SELECT USING (
  org_id IN (SELECT org_id FROM user_organizations WHERE user_id = auth.uid())
);
CREATE POLICY "dienst_templates_insert" ON dienst_templates FOR INSERT WITH CHECK (
  org_id IN (SELECT org_id FROM user_organizations WHERE user_id = auth.uid())
);
CREATE POLICY "dienst_templates_update" ON dienst_templates FOR UPDATE USING (
  aangemaakt_door = auth.uid()
);
CREATE POLICY "dienst_templates_delete" ON dienst_templates FOR DELETE USING (
  aangemaakt_door = auth.uid()
);

CREATE TRIGGER update_dienst_templates_updated_at
  BEFORE UPDATE ON dienst_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE dienst_templates;
