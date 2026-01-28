-- Add linked_professional_id to whatsapp_chats for direct professional linking
ALTER TABLE public.whatsapp_chats
ADD COLUMN linked_professional_id UUID REFERENCES public.professionals(id) ON DELETE SET NULL;

-- Index for efficient queries on linked professionals
CREATE INDEX idx_whatsapp_chats_linked_professional 
ON public.whatsapp_chats(linked_professional_id);