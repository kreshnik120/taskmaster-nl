-- Drop the problematic trigger that tries to update 'updated_at' 
-- when the table uses 'last_updated_at'
DROP TRIGGER IF EXISTS update_business_intel_updated_at ON public.business_intelligence;