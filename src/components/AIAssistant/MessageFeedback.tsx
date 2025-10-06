import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface MessageFeedbackProps {
  messageContent: string;
  messageId?: string;
  usedKnowledge?: string[];
}

export const MessageFeedback = ({ messageContent, messageId, usedKnowledge }: MessageFeedbackProps) => {
  const [feedback, setFeedback] = useState<'positive' | 'negative' | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  // Check if feedback already exists for this message
  useEffect(() => {
    const checkExistingFeedback = async () => {
      if (!messageId) return;
      
      try {
        const { data, error } = await supabase
          .from('message_feedback')
          .select('feedback_type')
          .eq('message_id', messageId)
          .maybeSingle();
        
        if (!error && data) {
          setFeedback(data.feedback_type as 'positive' | 'negative');
        }
      } catch (error) {
        console.error('Error checking existing feedback:', error);
      }
    };
    
    checkExistingFeedback();
  }, [messageId]);

  const handleFeedback = async (type: 'positive' | 'negative') => {
    if (feedback || isLoading || !messageId) return;
    
    setIsLoading(true);
    setFeedback(type);

    try {
      // Call process-feedback edge function with messageId
      const { data, error } = await supabase.functions.invoke('process-feedback', {
        body: {
          messageId: messageId,
          feedback: type,
          context: {
            message: messageContent
          }
        }
      });

      if (error) throw error;

      toast({
        title: type === 'positive' ? '👍 Bedankt!' : '👎 Feedback ontvangen',
        description: data?.message || 'De AI leert van je feedback.',
      });
    } catch (error) {
      console.error('Failed to save feedback:', error);
      setFeedback(null);
      toast({
        title: 'Fout bij opslaan feedback',
        description: 'Probeer het opnieuw',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-1 mt-1">
      <Button
        variant="ghost"
        size="sm"
        className={`h-6 w-6 p-0 ${feedback === 'positive' ? 'text-green-600' : 'text-muted-foreground'}`}
        onClick={() => handleFeedback('positive')}
        disabled={feedback !== null || isLoading}
      >
        <ThumbsUp className="h-3 w-3" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className={`h-6 w-6 p-0 ${feedback === 'negative' ? 'text-red-600' : 'text-muted-foreground'}`}
        onClick={() => handleFeedback('negative')}
        disabled={feedback !== null || isLoading}
      >
        <ThumbsDown className="h-3 w-3" />
      </Button>
    </div>
  );
};
