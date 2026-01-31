import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface TypingState {
  isTyping: boolean;
  contactName: string | null;
  lastTypingAt: number | null;
}

const TYPING_TIMEOUT_MS = 5000; // Clear typing after 5 seconds of no updates

/**
 * Hook to manage typing indicator state for a chat.
 * Listens to ephemeral typing events via Supabase Realtime broadcast.
 */
export function useTypingIndicator(chatId: string | null) {
  const [typingState, setTypingState] = useState<TypingState>({
    isTyping: false,
    contactName: null,
    lastTypingAt: null,
  });

  // Clear typing indicator after timeout
  useEffect(() => {
    if (!typingState.isTyping || !typingState.lastTypingAt) return;

    const timeout = setTimeout(() => {
      setTypingState({
        isTyping: false,
        contactName: null,
        lastTypingAt: null,
      });
    }, TYPING_TIMEOUT_MS);

    return () => clearTimeout(timeout);
  }, [typingState.isTyping, typingState.lastTypingAt]);

  // Subscribe to typing events for this chat
  useEffect(() => {
    if (!chatId) return;

    const channel = supabase
      .channel(`typing:${chatId}`)
      .on("broadcast", { event: "typing" }, (payload) => {
        const { contactName, isTyping } = payload.payload as {
          contactName: string;
          isTyping: boolean;
        };

        if (isTyping) {
          setTypingState({
            isTyping: true,
            contactName,
            lastTypingAt: Date.now(),
          });
        } else {
          setTypingState({
            isTyping: false,
            contactName: null,
            lastTypingAt: null,
          });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chatId]);

  // Manual method to broadcast our own typing status
  const sendTypingStatus = useCallback(
    async (isTyping: boolean) => {
      if (!chatId) return;

      await supabase.channel(`typing:${chatId}`).send({
        type: "broadcast",
        event: "typing",
        payload: { isTyping, contactName: "Ik" },
      });
    },
    [chatId]
  );

  return {
    isContactTyping: typingState.isTyping,
    typingContactName: typingState.contactName,
    sendTypingStatus,
  };
}
