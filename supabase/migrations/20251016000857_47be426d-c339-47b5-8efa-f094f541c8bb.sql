-- Add validation streak columns to profiles table for persistent tracking
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS validation_streak INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_validation_date TIMESTAMP WITH TIME ZONE;