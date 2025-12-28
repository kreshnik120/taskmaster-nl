import { useState, useEffect } from "react";
import { X, Lightbulb, ThumbsUp, ThumbsDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";

interface FeedbackReminderBannerProps {
  messagesWithoutFeedback: number;
  onDismiss: () => void;
}

export const FeedbackReminderBanner = ({
  messagesWithoutFeedback,
  onDismiss,
}: FeedbackReminderBannerProps) => {
  const [isVisible, setIsVisible] = useState(false);

  // Show banner when user has seen 3+ AI messages without giving feedback
  useEffect(() => {
    if (messagesWithoutFeedback >= 3) {
      // Small delay to not interrupt the flow
      const timeout = setTimeout(() => setIsVisible(true), 1000);
      return () => clearTimeout(timeout);
    }
  }, [messagesWithoutFeedback]);

  const handleDismiss = () => {
    setIsVisible(false);
    onDismiss();
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="mx-3 mb-2"
        >
          <div className="relative p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDismiss}
              className="absolute top-1 right-1 h-6 w-6 p-0 hover:bg-amber-500/20"
            >
              <X className="h-3 w-3" />
            </Button>
            
            <div className="flex items-start gap-2 pr-6">
              <Lightbulb className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-foreground">
                  Tip: Geef feedback om de AI te verbeteren
                </p>
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  Gebruik <ThumbsUp className="h-3 w-3 inline" /> of <ThumbsDown className="h-3 w-3 inline" /> onder elk antwoord
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
