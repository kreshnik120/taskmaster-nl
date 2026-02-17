-- Fix: Alle Bendy-gesyncte professionals naar 'actief' zetten
-- Bendy 'inactief' state betekent "niet op opdracht", niet "uitgeschakeld"
UPDATE public.professionals
SET status = 'actief', updated_at = now()
WHERE deleted_at IS NULL
  AND bendy_id IS NOT NULL
  AND status = 'inactief';