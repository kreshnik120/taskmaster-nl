
-- ============================================================
-- BENDY-SYNC-1: Bendy Sync Infrastructuur
-- ============================================================

-- DEEL 1: Nieuwe tabellen

CREATE TABLE public.bendy_sync_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  tenant TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  base_url TEXT NOT NULL,
  sync_interval_minutes INTEGER NOT NULL DEFAULT 15,
  last_full_sync_at TIMESTAMPTZ,
  last_incremental_sync_at TIMESTAMPTZ,
  sync_status TEXT NOT NULL DEFAULT 'idle' CHECK (sync_status IN ('idle', 'running', 'error')),
  error_message TEXT,
  error_count INTEGER NOT NULL DEFAULT 0,
  entities_config JSONB NOT NULL DEFAULT '{"clients": true, "users": true, "requisitions": true, "groups": true, "document_types": true, "selection_lists": true}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, tenant)
);

CREATE TABLE public.bendy_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  tenant TEXT NOT NULL,
  sync_type TEXT NOT NULL CHECK (sync_type IN ('full', 'incremental')),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('clients', 'users', 'requisitions_open', 'requisitions_assigned', 'groups', 'document_types', 'selection_lists')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  records_fetched INTEGER NOT NULL DEFAULT 0,
  records_created INTEGER NOT NULL DEFAULT 0,
  records_updated INTEGER NOT NULL DEFAULT 0,
  records_skipped INTEGER NOT NULL DEFAULT 0,
  records_failed INTEGER NOT NULL DEFAULT 0,
  errors JSONB DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'partial', 'failed')),
  duration_ms INTEGER,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.bendy_id_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  tenant TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('client', 'professional', 'dienst', 'group', 'document_type', 'selection_list')),
  bendy_id TEXT NOT NULL,
  local_id UUID NOT NULL,
  bendy_updated_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sync_status TEXT NOT NULL DEFAULT 'synced' CHECK (sync_status IN ('synced', 'conflict', 'error', 'pending')),
  conflict_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant, entity_type, bendy_id)
);

CREATE TABLE public.bendy_raw_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  tenant TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  bendy_id TEXT NOT NULL,
  raw_data JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant, entity_type, bendy_id)
);

-- DEEL 2: Kolom toevoegingen

ALTER TABLE public.client_organizations ADD COLUMN IF NOT EXISTS bendy_id TEXT;
ALTER TABLE public.professionals ADD COLUMN IF NOT EXISTS bendy_id TEXT;
ALTER TABLE public.diensten ADD COLUMN IF NOT EXISTS bendy_id TEXT;

-- DEEL 3: Indexes

CREATE INDEX IF NOT EXISTS idx_bendy_sync_config_org_tenant ON public.bendy_sync_config(org_id, tenant);
CREATE INDEX IF NOT EXISTS idx_bendy_sync_log_org_tenant ON public.bendy_sync_log(org_id, tenant);
CREATE INDEX IF NOT EXISTS idx_bendy_sync_log_started_at ON public.bendy_sync_log(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_bendy_sync_log_entity_status ON public.bendy_sync_log(entity_type, status);
CREATE INDEX IF NOT EXISTS idx_bendy_id_mapping_local ON public.bendy_id_mapping(local_id);
CREATE INDEX IF NOT EXISTS idx_bendy_id_mapping_lookup ON public.bendy_id_mapping(tenant, entity_type, bendy_id);
CREATE INDEX IF NOT EXISTS idx_bendy_id_mapping_org ON public.bendy_id_mapping(org_id);
CREATE INDEX IF NOT EXISTS idx_bendy_raw_cache_lookup ON public.bendy_raw_cache(tenant, entity_type, bendy_id);
CREATE INDEX IF NOT EXISTS idx_bendy_raw_cache_fetched ON public.bendy_raw_cache(fetched_at);
CREATE INDEX IF NOT EXISTS idx_client_organizations_bendy_id ON public.client_organizations(bendy_id) WHERE bendy_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_professionals_bendy_id ON public.professionals(bendy_id) WHERE bendy_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_diensten_bendy_id ON public.diensten(bendy_id) WHERE bendy_id IS NOT NULL;

-- DEEL 4: RLS

ALTER TABLE public.bendy_sync_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bendy_sync_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bendy_id_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bendy_raw_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own org sync config" ON public.bendy_sync_config
  FOR SELECT USING (org_id IN (SELECT org_id FROM public.user_organizations WHERE user_id = auth.uid()));

CREATE POLICY "Users can view own org sync logs" ON public.bendy_sync_log
  FOR SELECT USING (org_id IN (SELECT org_id FROM public.user_organizations WHERE user_id = auth.uid()));

CREATE POLICY "Users can view own org id mappings" ON public.bendy_id_mapping
  FOR SELECT USING (org_id IN (SELECT org_id FROM public.user_organizations WHERE user_id = auth.uid()));

CREATE POLICY "Users can view own org raw cache" ON public.bendy_raw_cache
  FOR SELECT USING (org_id IN (SELECT org_id FROM public.user_organizations WHERE user_id = auth.uid()));

-- DEEL 5: Triggers (hergebruik bestaande functie)

CREATE TRIGGER update_bendy_sync_config_updated_at
  BEFORE UPDATE ON public.bendy_sync_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_bendy_id_mapping_updated_at
  BEFORE UPDATE ON public.bendy_id_mapping
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- DEEL 6: Seed data

INSERT INTO public.bendy_sync_config (org_id, tenant, enabled, base_url, sync_interval_minutes)
SELECT id, 'citozorg', false, 'https://citozorg.bendy.nl', 15
FROM public.organizations
LIMIT 1
ON CONFLICT (org_id, tenant) DO NOTHING;
