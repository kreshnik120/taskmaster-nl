import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ThumbsUp, ThumbsDown, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface FeedbackButtonProps {
  messageId?: string;
  messageContent: string;
  context?: any;
}

export const FeedbackButton = ({ messageId, messageContent, context }: FeedbackButtonProps) => {
  const [feedback, setFeedback] = useState<'positive' | 'negative' | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  // Don't render if messageId is missing
  if (!messageId) {
    console.warn('[FeedbackButton] No messageId provided, hiding feedback buttons');
    return null;
  }

  const handleFeedback = async (type: 'positive' | 'negative') => {
    if (feedback === type) return;
    
    console.log('[FeedbackButton] Submitting feedback:', { type, messageId, hasAuth: !!supabase.auth });
    
    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('process-feedback', {
        body: {
          messageId,
          feedback: type,
          context: {
            message: messageContent,
            usedKnowledge: context?.knowledge_ids_for_feedback || [],
            ...context
          }
        }
      });

      if (error) {
        console.error('[FeedbackButton] Edge function error:', error);
        throw error;
      }

      console.log('[FeedbackButton] Feedback saved successfully:', data);
      setFeedback(type);
      toast({
        title: type === 'positive' ? '👍 Bedankt voor je positieve feedback!' : '👎 Bedankt voor je feedback',
        description: type === 'positive' 
          ? 'Dit helpt de AI om beter te worden.'
          : 'We gebruiken dit om de AI te verbeteren.',
      });
    } catch (error: any) {
      console.error('[FeedbackButton] Failed to save feedback:', error);
      toast({
        title: 'Feedback kon niet worden opgeslagen',
        description: error.message || 'Controleer je internetverbinding en probeer het opnieuw.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => handleFeedback('positive')}
        disabled={isSubmitting || feedback !== null}
        className={cn(
          "h-7 px-2",
          feedback === 'positive' && "text-green-600 bg-green-50 dark:bg-green-950"
        )}
      >
        {isSubmitting && feedback === null ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <ThumbsUp className="h-3 w-3" />
        )}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => handleFeedback('negative')}
        disabled={isSubmitting || feedback !== null}
        className={cn(
          "h-7 px-2",
          feedback === 'negative' && "text-red-600 bg-red-50 dark:bg-red-950"
        )}
      >
        {isSubmitting && feedback === null ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <ThumbsDown className="h-3 w-3" />
        )}
      </Button>
    </div>
  );
};