import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ThumbsUp, ThumbsDown, Sparkles, Flame, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { logger } from "@/lib/logger";
import { useFeedbackStats } from "@/hooks/useFeedbackStats";
import { motion } from "framer-motion";

const log = logger.create('MessageFeedback');

interface MessageFeedbackProps {
  messageContent: string;
  messageId?: string;
  usedKnowledge?: string[];
  isNewMessage?: boolean;
  // 🆕 Fast Path feedback support
  isFastPath?: boolean;
  fastPathLogId?: string;
  patternId?: string;
}

export const MessageFeedback = ({ 
  messageContent, 
  messageId, 
  usedKnowledge,
  isNewMessage = false,
  isFastPath = false,
  fastPathLogId,
  patternId
}: MessageFeedbackProps) => {
  const [feedback, setFeedback] = useState<'positive' | 'negative' | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showThankYou, setShowThankYou] = useState(false);
  const [shouldPulse, setShouldPulse] = useState(isNewMessage);
  const { toast } = useToast();
  const { weeklyCount, streak, refresh: refreshStats } = useFeedbackStats();

  // Don't render if messageId is missing
  if (!messageId) {
    log.warn('No messageId provided, hiding feedback buttons');
    return null;
  }

  // Stop pulse animation after 10 seconds
  useEffect(() => {
    if (isNewMessage) {
      setShouldPulse(true);
      const timeout = setTimeout(() => setShouldPulse(false), 10000);
      return () => clearTimeout(timeout);
    }
  }, [isNewMessage]);

  // Check if feedback already exists for this message
  useEffect(() => {
    const checkExistingFeedback = async () => {
      if (!messageId) return;
      
      try {
        // Check regular message feedback
        const { data, error } = await supabase
          .from('message_feedback')
          .select('feedback_type')
          .eq('message_id', messageId)
          .maybeSingle();
        
        if (!error && data) {
          setFeedback(data.feedback_type as 'positive' | 'negative');
          return;
        }
        
        // 🆕 Also check Fast Path feedback if applicable
        if (isFastPath && fastPathLogId) {
          const { data: fpData } = await supabase
            .from('fast_path_usage_log')
            .select('feedback_type')
            .eq('id', fastPathLogId)
            .maybeSingle();
          
          if (fpData?.feedback_type) {
            setFeedback(fpData.feedback_type === 'helpful' ? 'positive' : 'negative');
          }
        }
      } catch (error) {
        log.error('Error checking existing feedback:', error);
      }
    };
    
    checkExistingFeedback();
  }, [messageId, isFastPath, fastPathLogId]);

  const handleFeedback = async (type: 'positive' | 'negative') => {
    if (feedback || isLoading) return;
    
    log.log('Submitting feedback:', { type, messageId, isFastPath, fastPathLogId, patternId });
    
    setIsLoading(true);
    setFeedback(type);

    try {
      // 🆕 Include Fast Path metadata in feedback call
      const { data, error } = await supabase.functions.invoke('process-feedback', {
        body: {
          messageId: messageId,
          feedback: type,
          context: {
            message: messageContent,
            usedKnowledge: usedKnowledge || [],
            // Fast Path specific fields
            isFastPath: isFastPath,
            fastPathLogId: fastPathLogId,
            patternId: patternId
          }
        }
      });

      if (error) {
        log.error('Edge function error:', error);
        throw error;
      }

      log.log('Feedback saved successfully:', data);
      setShowThankYou(true);
      refreshStats();
      
      // Hide thank you after 5 seconds
      setTimeout(() => setShowThankYou(false), 5000);
      
    } catch (error: any) {
      log.error('Failed to save feedback:', error);
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

  // Thank you state with gamification
  if (showThankYou && feedback) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className="mt-3 p-3 rounded-lg bg-primary/10 border border-primary/20"
      >
        <div className="flex items-center gap-2 text-sm">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="font-medium text-foreground">
            {feedback === 'positive' ? 'Bedankt voor je positieve feedback!' : 'Bedankt voor je feedback!'}
          </span>
          {/* 🆕 Show Fast Path indicator */}
          {isFastPath && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
              <Zap className="h-3 w-3 text-yellow-500" />
              Fast Path
            </span>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <ThumbsUp className="h-3 w-3" />
            {weeklyCount + 1} deze week
          </span>
          {streak > 0 && (
            <span className="flex items-center gap-1 text-orange-500">
              <Flame className="h-3 w-3" />
              {streak} dagen streak!
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {isFastPath 
            ? 'Jouw feedback verbetert snelle antwoorden direct.'
            : 'Jouw feedback helpt de AI om beter te worden.'}
        </p>
      </motion.div>
    );
  }

  // Already gave feedback (persistent state)
  if (feedback && !showThankYou) {
    return (
      <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          {feedback === 'positive' ? (
            <ThumbsUp className="h-3 w-3 text-green-500" />
          ) : (
            <ThumbsDown className="h-3 w-3 text-red-500" />
          )}
          Feedback gegeven
        </span>
        {isFastPath && (
          <span className="flex items-center gap-1 text-xs bg-muted/50 px-1.5 py-0.5 rounded">
            <Zap className="h-3 w-3 text-yellow-500" />
          </span>
        )}
      </div>
    );
  }

  // Main feedback UI
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={`mt-3 p-3 rounded-lg border transition-all ${
        shouldPulse 
          ? 'bg-primary/5 border-primary/30 animate-pulse' 
          : 'bg-muted/30 border-border/50 hover:bg-muted/50'
      }`}
    >
      <p className="text-sm text-muted-foreground mb-2 flex items-center gap-1">
        💬 Was dit antwoord nuttig?
        {/* 🆕 Fast Path indicator */}
        {isFastPath && (
          <span className="ml-1 flex items-center gap-1 text-xs bg-yellow-500/10 text-yellow-600 px-1.5 py-0.5 rounded">
            <Zap className="h-3 w-3" />
            Snel antwoord
          </span>
        )}
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleFeedback('positive')}
          disabled={isLoading}
          className={`flex-1 h-9 gap-2 transition-all hover:bg-green-500/10 hover:border-green-500/50 hover:text-green-600 ${
            shouldPulse ? 'ring-2 ring-primary/20' : ''
          }`}
        >
          <ThumbsUp className="h-4 w-4" />
          <span className="font-medium">Nuttig</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleFeedback('negative')}
          disabled={isLoading}
          className={`flex-1 h-9 gap-2 transition-all hover:bg-red-500/10 hover:border-red-500/50 hover:text-red-600 ${
            shouldPulse ? 'ring-2 ring-primary/20' : ''
          }`}
        >
          <ThumbsDown className="h-4 w-4" />
          <span className="font-medium">Niet nuttig</span>
        </Button>
      </div>
    </motion.div>
  );
};
