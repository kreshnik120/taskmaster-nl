-- ===========================================
-- SHARED KNOWLEDGE ARCHITECTURE IMPLEMENTATION
-- ===========================================

-- Step 1: Add is_shared column to ai_knowledge_base
ALTER TABLE public.ai_knowledge_base 
ADD COLUMN IF NOT EXISTS is_shared BOOLEAN DEFAULT false;

-- Step 2: Create index for performance on shared knowledge queries
CREATE INDEX IF NOT EXISTS idx_ai_knowledge_base_is_shared 
ON public.ai_knowledge_base(is_shared) 
WHERE is_shared = true AND deleted_at IS NULL;

-- Step 3: Mark existing shared knowledge categories
-- These are categories that should be accessible to both ABCzorg and CitoZorg
UPDATE public.ai_knowledge_base 
SET is_shared = true
WHERE category IN (
  'wetgeving', 
  'cao', 
  'compliance', 
  'markt_financieel', 
  'ggz_markt', 
  'ghz_markt', 
  'ouderenzorg_markt', 
  'externe_inhuur_markten',
  'zorg_algemeen',
  'arbeidsrecht',
  'zorgsector_trends',
  'kwaliteitseisen',
  'certificeringen'
)
AND deleted_at IS NULL;

-- Step 4: Drop existing SELECT policy for ai_knowledge_base
DROP POLICY IF EXISTS "Users can view knowledge with ACL check" ON public.ai_knowledge_base;

-- Step 5: Create new SELECT policy that includes shared knowledge
CREATE POLICY "Users can view knowledge with ACL check" 
ON public.ai_knowledge_base 
FOR SELECT 
USING (
  (
    -- User belongs to the org that owns the knowledge
    (EXISTS ( 
      SELECT 1
      FROM user_organizations
      WHERE user_organizations.org_id = ai_knowledge_base.org_id 
        AND user_organizations.user_id = auth.uid()
    ))
    OR 
    -- OR knowledge is marked as shared (accessible to all authenticated users)
    (ai_knowledge_base.is_shared = true AND auth.uid() IS NOT NULL)
  )
  AND has_acl_access(auth.uid(), acl) 
  AND is_knowledge_valid(valid_from, valid_to) 
  AND deleted_at IS NULL
);

-- Step 6: Fill sublocation bureau-koppelingen based on parent organization
UPDATE public.client_sublocations cs
SET gekoppelde_bv_org_id = co.org_id
FROM public.client_locations cl
JOIN public.client_organizations co ON co.id = cl.client_org_id
WHERE cs.location_id = cl.id
  AND cs.gekoppelde_bv_org_id IS NULL;

-- Step 7: Add comment for documentation
COMMENT ON COLUMN public.ai_knowledge_base.is_shared IS 
'When true, this knowledge item is accessible to all authenticated users regardless of org_id. Used for shared knowledge like regulations, CAO, compliance rules that apply to both ABCzorg and CitoZorg.';