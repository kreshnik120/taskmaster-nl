-- ============================================================
-- 1. Restrict factuur access to admin + finance only
-- ============================================================
DROP POLICY IF EXISTS factuur_select_org_members ON public.factuur;
DROP POLICY IF EXISTS factuur_insert_org_members ON public.factuur;
DROP POLICY IF EXISTS factuur_update_org_members ON public.factuur;
DROP POLICY IF EXISTS factuur_delete_concept_only ON public.factuur;

CREATE POLICY factuur_select_finance_admin ON public.factuur
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_organizations uo
    WHERE uo.org_id = factuur.tenant_id AND uo.user_id = auth.uid()
  )
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'))
);

CREATE POLICY factuur_insert_finance_admin ON public.factuur
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_organizations uo
    WHERE uo.org_id = factuur.tenant_id AND uo.user_id = auth.uid()
  )
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'))
  AND status::text = 'CONCEPT'
);

CREATE POLICY factuur_update_finance_admin ON public.factuur
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_organizations uo
    WHERE uo.org_id = factuur.tenant_id AND uo.user_id = auth.uid()
  )
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'))
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_organizations uo
    WHERE uo.org_id = factuur.tenant_id AND uo.user_id = auth.uid()
  )
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'))
);

CREATE POLICY factuur_delete_finance_admin ON public.factuur
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_organizations uo
    WHERE uo.org_id = factuur.tenant_id AND uo.user_id = auth.uid()
  )
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finance'))
  AND status::text = 'CONCEPT'
);

-- ============================================================
-- 2. Pin search_path on user-defined functions
-- ============================================================
ALTER FUNCTION public.check_dienst_overlap() SET search_path = public;
ALTER FUNCTION public.handle_recurring_task() SET search_path = public;
ALTER FUNCTION public.increment_lock_version() SET search_path = public;
ALTER FUNCTION public.log_attachment_added() SET search_path = public;
ALTER FUNCTION public.log_attachment_removed() SET search_path = public;
ALTER FUNCTION public.log_subtask_status_change() SET search_path = public;
ALTER FUNCTION public.notify_task_assignment() SET search_path = public;
ALTER FUNCTION public.update_dienst_status() SET search_path = public;
ALTER FUNCTION public.update_whatsapp_updated_at() SET search_path = public;