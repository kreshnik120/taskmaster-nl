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

  // Don't render if messageId is missing
  if (!messageId) {
    console.warn('[MessageFeedback] No messageId provided, hiding feedback buttons');
    return null;
  }

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
    if (feedback || isLoading) return;
    
    console.log('[MessageFeedback] Submitting feedback:', { type, messageId, hasAuth: !!supabase.auth });
    
    setIsLoading(true);
    setFeedback(type);

    try {
      const { data, error } = await supabase.functions.invoke('process-feedback', {
        body: {
          messageId: messageId,
          feedback: type,
          context: {
            message: messageContent,
            usedKnowledge: usedKnowledge || []
          }
        }
      });

      if (error) {
        console.error('[MessageFeedback] Edge function error:', error);
        throw error;
      }

      console.log('[MessageFeedback] Feedback saved successfully:', data);
      toast({
        title: type === 'positive' ? '👍 Bedankt voor je positieve feedback!' : '👎 Bedankt voor je feedback',
        description: type === 'positive' 
          ? 'Dit helpt de AI om beter te worden.' 
          : 'We gebruiken dit om de AI te verbeteren.',
      });
    } catch (error: any) {
      console.error('[MessageFeedback] Failed to save feedback:', error);
      setFeedback(null);
      toast({
        title: 'Feedback kon niet worden opgeslagen',
        description: error.message || 'Controleer je internetverbinding en probeer het opnieuw.',
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
