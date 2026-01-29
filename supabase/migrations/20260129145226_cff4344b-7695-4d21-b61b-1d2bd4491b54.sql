-- Add push_name and profile_picture_url columns to whatsapp_contacts
ALTER TABLE public.whatsapp_contacts 
ADD COLUMN IF NOT EXISTS push_name TEXT,
ADD COLUMN IF NOT EXISTS profile_picture_url TEXT;