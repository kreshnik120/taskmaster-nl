-- Update werkvorm_tarieven constraint to include Detachering and Beide
ALTER TABLE werkvorm_tarieven 
DROP CONSTRAINT IF EXISTS werkvorm_tarieven_werkvorm_check;

ALTER TABLE werkvorm_tarieven 
ADD CONSTRAINT werkvorm_tarieven_werkvorm_check 
CHECK (werkvorm IN ('ZZP', 'Uitzendkracht', 'ABCito constructie', 'Detachering', 'Beide'));