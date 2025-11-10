-- ============================================
-- RLS POLICY HARDENING: ai_knowledge_base
-- ============================================
-- Critical Security Fix: Voeg granulaire RLS policies toe

-- STAP 1: INSERT policy voor reguliere users
CREATE POLICY "Users can insert knowledge in their org"
ON public.ai_knowledge_base
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_organizations
    WHERE user_organizations.org_id = ai_knowledge_base.org_id
    AND user_organizations.user_id = auth.uid()
  )
  AND user_id = auth.uid()
  AND deleted_at IS NULL
  AND deleted_by IS NULL
);

-- STAP 2: UPDATE policy voor reguliere users (content updates only)
CREATE POLICY "Users can update their own knowledge content"
ON public.ai_knowledge_base
FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM user_organizations
    WHERE user_organizations.org_id = ai_knowledge_base.org_id
    AND user_organizations.user_id = auth.uid()
  )
  AND deleted_at IS NULL
)
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM user_organizations
    WHERE user_organizations.org_id = ai_knowledge_base.org_id
    AND user_organizations.user_id = auth.uid()
  )
  AND deleted_at IS NULL
);

-- STAP 3: SOFT-DELETE policy voor admins/managers
CREATE POLICY "Admins can soft-delete knowledge"
ON public.ai_knowledge_base
FOR UPDATE
TO authenticated
USING (
  (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))
  AND EXISTS (
    SELECT 1 FROM user_organizations
    WHERE user_organizations.org_id = ai_knowledge_base.org_id
    AND user_organizations.user_id = auth.uid()
  )
  AND deleted_at IS NULL
)
WITH CHECK (
  deleted_at IS NOT NULL
  AND deleted_by = auth.uid()::text
);

-- STAP 4: Performance indexes
CREATE INDEX IF NOT EXISTS idx_ai_knowledge_base_user_org_deleted 
ON public.ai_knowledge_base(user_id, org_id, deleted_at)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ai_knowledge_base_deleted_audit
ON public.ai_knowledge_base(deleted_at, deleted_by)
WHERE deleted_at IS NOT NULL;

-- Security documentatie
COMMENT ON TABLE public.ai_knowledge_base IS 
'SECURITY: Geen DELETE policies - gebruik SOFT DELETE via deleted_at. Hard deletes alleen via migrations.';