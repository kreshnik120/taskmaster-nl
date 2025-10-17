-- Make chat_messages view writable with INSTEAD OF triggers

-- Create function to handle inserts on chat_messages view
CREATE OR REPLACE FUNCTION public.insert_chat_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.ai_chat_messages (
    user_id,
    org_id,
    conversation_id,
    role,
    content,
    used_knowledge,
    confidence_score
  ) VALUES (
    NEW.user_id,
    NEW.org_id,
    NEW.conversation_id,
    NEW.role,
    NEW.content,
    -- Extract used_knowledge from metadata if it's provided
    COALESCE(
      (NEW.metadata->>'knowledge_ids_for_feedback')::jsonb,
      (NEW.metadata->>'usedKnowledge')::jsonb,
      NEW.used_knowledge,
      '[]'::jsonb
    ),
    NEW.confidence_score
  );
  RETURN NEW;
END;
$$;

-- Create INSTEAD OF INSERT trigger on chat_messages view
DROP TRIGGER IF EXISTS chat_messages_insert_trigger ON public.chat_messages;
CREATE TRIGGER chat_messages_insert_trigger
INSTEAD OF INSERT ON public.chat_messages
FOR EACH ROW
EXECUTE FUNCTION public.insert_chat_message();

-- Create function to handle updates on chat_messages view
CREATE OR REPLACE FUNCTION public.update_chat_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.ai_chat_messages
  SET
    role = NEW.role,
    content = NEW.content,
    used_knowledge = COALESCE(
      (NEW.metadata->>'knowledge_ids_for_feedback')::jsonb,
      (NEW.metadata->>'usedKnowledge')::jsonb,
      NEW.used_knowledge,
      used_knowledge
    ),
    confidence_score = NEW.confidence_score
  WHERE id = OLD.id;
  RETURN NEW;
END;
$$;

-- Create INSTEAD OF UPDATE trigger on chat_messages view
DROP TRIGGER IF EXISTS chat_messages_update_trigger ON public.chat_messages;
CREATE TRIGGER chat_messages_update_trigger
INSTEAD OF UPDATE ON public.chat_messages
FOR EACH ROW
EXECUTE FUNCTION public.update_chat_message();

-- Create function to handle deletes on chat_messages view
CREATE OR REPLACE FUNCTION public.delete_chat_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.ai_chat_messages WHERE id = OLD.id;
  RETURN OLD;
END;
$$;

-- Create INSTEAD OF DELETE trigger on chat_messages view
DROP TRIGGER IF EXISTS chat_messages_delete_trigger ON public.chat_messages;
CREATE TRIGGER chat_messages_delete_trigger
INSTEAD OF DELETE ON public.chat_messages
FOR EACH ROW
EXECUTE FUNCTION public.delete_chat_message();