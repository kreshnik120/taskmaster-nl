-- Delete corrupt ai_chat_messages with combined "2 professionals" + "3 professionals" responses
-- These messages contain duplicate tool call results that were incorrectly combined
DELETE FROM public.ai_chat_messages 
WHERE id IN ('a91765ac-878c-48da-bc02-1ebc00336a20', '43f1cb1c-e225-4ed2-9f93-a5a4e64aa936');