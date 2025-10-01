import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface MessageFeedbackProps {
  messageContent: string;
  messageIndex: number;
}

export const MessageFeedback = ({ messageContent, messageIndex }: MessageFeedbackProps) => {
  const [feedback, setFeedback] = useState<'positive' | 'negative' | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleFeedback = async (type: 'positive' | 'negative') => {
    if (feedback || isLoading) return;
    
    setIsLoading(true);
    setFeedback(type);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Get user's org
      const { data: userOrg } = await supabase
        .from('user_organizations')
        .select('org_id')
        .eq('user_id', user.id)
        .single();

      if (!userOrg?.org_id) throw new Error('No organization found');

      // Log the feedback as a learning event
      const { error } = await supabase
        .from('ai_learning_events')
        .insert({
          user_id: user.id,
          org_id: userOrg.org_id,
          event_type: type === 'positive' ? 'feedback_positive' : 'feedback_negative',
          context: {
            message_content: messageContent.substring(0, 500),
            message_index: messageIndex,
            timestamp: new Date().toISOString()
          },
          outcome: type === 'positive' ? 'success' : 'failure',
          learning_score: type === 'positive' ? 0.8 : 0.3,
          ai_response: {
            content: messageContent
          },
          user_action: {
            feedback_type: type,
            provided_at: new Date().toISOString()
          }
        });

      if (error) throw error;

      toast({
        title: type === 'positive' ? '👍 Bedankt voor je feedback!' : '👎 Feedback ontvangen',
        description: 'De AI leert van je feedback om beter te worden.',
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
