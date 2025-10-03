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

  const handleFeedback = async (type: 'positive' | 'negative') => {
    if (feedback === type) return; // Already submitted this feedback
    
    setIsSubmitting(true);
    try {
      const { error } = await supabase.functions.invoke('process-feedback', {
        body: {
          messageId,
          feedback: type,
          context: {
            message: messageContent,
            ...context
          }
        }
      });

      if (error) throw error;

      setFeedback(type);
      toast({
        title: type === 'positive' ? '👍 Bedankt!' : '👎 Bedankt voor je feedback',
        description: type === 'positive' 
          ? 'De AI leert van je positieve feedback'
          : 'We gebruiken dit om de AI te verbeteren',
      });
    } catch (error: any) {
      console.error('Error submitting feedback:', error);
      toast({
        title: 'Feedback niet verstuurd',
        description: error.message,
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