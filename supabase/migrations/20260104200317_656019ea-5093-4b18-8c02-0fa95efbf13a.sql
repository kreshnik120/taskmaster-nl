-- Enterprise v2.6.0 - Add Detachering as valid werkvorm option
-- Step 1: Drop existing constraint
ALTER TABLE professionals DROP CONSTRAINT IF EXISTS professionals_werkvorm_check;

-- Step 2: Add new constraint with Detachering
ALTER TABLE professionals ADD CONSTRAINT professionals_werkvorm_check 
  CHECK (werkvorm IS NULL OR werkvorm IN ('ZZP', 'Uitzendkracht', 'ABCito constructie', 'Detachering', 'Beide'));

-- Step 3: Also update assignments table if it has a similar constraint
ALTER TABLE assignments DROP CONSTRAINT IF EXISTS assignments_werkvorm_check;
ALTER TABLE assignments ADD CONSTRAINT assignments_werkvorm_check 
  CHECK (werkvorm IS NULL OR werkvorm IN ('ZZP', 'Uitzendkracht', 'ABCito constructie', 'Detachering', 'Beide'));