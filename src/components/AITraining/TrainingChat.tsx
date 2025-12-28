import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Loader2, FileText, CheckCircle2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { logger } from "@/lib/logger";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogDescription 
} from "@/components/ui/dialog";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export const TrainingChat = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);
  const [savedItemsCount, setSavedItemsCount] = useState(0);
  const [currentStatus, setCurrentStatus] = useState("");
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [lastSaveDetails, setLastSaveDetails] = useState<{categories: Record<string, number>, total: number} | null>(null);
  const { toast } = useToast();

  // Chunk grote tekst in logische segmenten
  const chunkText = (text: string, maxTokens: number = 4000): string[] => {
    const words = text.split(/\s+/);
    const chunks: string[] = [];
    let currentChunk: string[] = [];
    let currentLength = 0;

    for (const word of words) {
      // Ruw 1 token ≈ 0.75 woorden
      const wordTokens = Math.ceil(word.length / 4);
      
      if (currentLength + wordTokens > maxTokens && currentChunk.length > 0) {
        chunks.push(currentChunk.join(" "));
        // Behoud laatste 50 woorden voor context overlap
        currentChunk = currentChunk.slice(-50);
        currentLength = currentChunk.reduce((sum, w) => sum + Math.ceil(w.length / 4), 0);
      }
      
      currentChunk.push(word);
      currentLength += wordTokens;
    }

    if (currentChunk.length > 0) {
      chunks.push(currentChunk.join(" "));
    }

    return chunks;
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading || isProcessingBatch) return;

    const userMessage: Message = { role: "user", content: input };
    setMessages((prev) => [...prev, userMessage]);
    const messageContent = input;
    setInput("");
    setIsLoading(true);
    setCurrentStatus("AI analyseert de informatie...");

    try {
      const { data, error } = await supabase.functions.invoke("ai-training-chat", {
        body: { message: messageContent },
      });

      if (error) throw error;

      setCurrentStatus("Opslaan in database...");

      const assistantMessage: Message = {
        role: "assistant",
        content: data.response || "Geen antwoord ontvangen.",
      };
      setMessages((prev) => [...prev, assistantMessage]);

      // 🔄 Trigger embedding generation voor nieuwe knowledge items
      if (data.knowledgeIds && Array.isArray(data.knowledgeIds) && data.knowledgeIds.length > 0) {
        logger.log(`🔄 Generating embeddings for ${data.knowledgeIds.length} items...`);
        setCurrentStatus(`Embeddings genereren (${data.knowledgeIds.length} items)...`);
        
        // Parallel embedding generation (max 5 concurrent)
        const batchSize = 5;
        let successCount = 0;
        let errorCount = 0;
        
        for (let i = 0; i < data.knowledgeIds.length; i += batchSize) {
          const batch = data.knowledgeIds.slice(i, i + batchSize);
          
          const results = await Promise.allSettled(
            batch.map(async (knowledgeId: string) => {
              try {
                const { error } = await supabase.functions.invoke('generate-embedding', {
                  body: { knowledge_id: knowledgeId }
                });
                
                if (error) {
                  logger.error(`❌ Embedding failed for ${knowledgeId}:`, error);
                  throw error;
                } else {
                  logger.log(`✅ Embedding voor ${knowledgeId} gegenereerd`);
                }
              } catch (err) {
                logger.error(`❌ Embedding error for ${knowledgeId}:`, err);
                throw err;
              }
            })
          );
          
          // Count successes and failures
          results.forEach(result => {
            if (result.status === 'fulfilled') successCount++;
            else errorCount++;
          });
          
          // Rate limiting pause
          if (i + batchSize < data.knowledgeIds.length) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        }
        
        if (successCount > 0) {
          toast({
            title: `✅ ${successCount} embeddings gegenereerd`,
            description: errorCount > 0 ? `${errorCount} errors` : undefined,
            duration: 3000,
          });
        }
      }

      // Toon opgeslagen items met uitgebreide feedback
      if (data.savedCount && data.savedCount > 0) {
        setSavedItemsCount(prev => prev + data.savedCount);
        
        const categories = data.categories || {};
        setLastSaveDetails({ categories, total: data.savedCount });
        
        const categoryList = Object.entries(categories)
          .map(([cat, count]) => `${cat} (${count})`)
          .join(", ");

        // Grote prominente toast
        toast({
          title: `✅ ${data.savedCount} kennisitem(s) opgeslagen!`,
          description: categoryList ? `Categorieën: ${categoryList}` : "Training data succesvol verwerkt",
          duration: 8000,
          className: "bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800",
        });

        // Toon success dialog
        setShowSuccessDialog(true);
        setCurrentStatus("✅ Voltooid!");
        setTimeout(() => setCurrentStatus(""), 3000);
      }
    } catch (error: any) {
      logger.error("Training chat error:", error);
      setCurrentStatus("");
      toast({
        title: "❌ Fout bij training chat",
        description: error.message || "Er is iets misgegaan",
        variant: "destructive",
        duration: 8000,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleProcessLargeText = async () => {
    if (!input.trim() || isLoading || isProcessingBatch) return;

    const text = input;
    const wordCount = text.split(/\s+/).length;
    
    if (wordCount < 500) {
      handleSend();
      return;
    }

    setIsProcessingBatch(true);
    setBatchProgress(0);
    setSavedItemsCount(0);
    setCurrentStatus("Groot document voorbereiden...");

    const userMessage: Message = { 
      role: "user", 
      content: `[Grote tekst verwerking gestart - ${wordCount} woorden]` 
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");

    try {
      const chunks = chunkText(text, 3500);
      let totalSaved = 0;
      const allCategories: Record<string, number> = {};

      for (let i = 0; i < chunks.length; i++) {
        setCurrentStatus(`Deel ${i + 1}/${chunks.length} verwerken...`);
        const chunkMessage = `DEEL ${i + 1}/${chunks.length} - BELANGRIJKE BEDRIJFSINFORMATIE:\n\n${chunks[i]}\n\n[Verwerk alle cruciale informatie uit dit deel. Mis niets!]`;
        
        const { data, error } = await supabase.functions.invoke("ai-training-chat", {
          body: { message: chunkMessage, isChunk: true, chunkIndex: i + 1, totalChunks: chunks.length },
        });

        if (error) {
          logger.error(`Chunk ${i + 1} error:`, error);
        } else if (data.savedCount) {
          totalSaved += data.savedCount;
          
          // Verzamel categories
          if (data.categories) {
            Object.entries(data.categories).forEach(([cat, count]) => {
              allCategories[cat] = (allCategories[cat] || 0) + (count as number);
            });
          }

          // 🔄 Trigger embedding generation voor chunk knowledge items
          if (data.knowledgeIds && Array.isArray(data.knowledgeIds) && data.knowledgeIds.length > 0) {
            logger.log(`🔄 Chunk ${i + 1}: Generating ${data.knowledgeIds.length} embeddings...`);
            
            // Parallel embedding generation (max 5 concurrent)
            const batchSize = 5;
            for (let j = 0; j < data.knowledgeIds.length; j += batchSize) {
              const batch = data.knowledgeIds.slice(j, j + batchSize);
              
              await Promise.allSettled(
                batch.map(async (knowledgeId: string) => {
                  try {
                    const { error } = await supabase.functions.invoke('generate-embedding', {
                      body: { knowledge_id: knowledgeId }
                    });
                    
                    if (error) {
                      logger.error(`❌ Embedding failed for ${knowledgeId}:`, error);
                    } else {
                      logger.log(`✅ Embedding voor ${knowledgeId} gegenereerd`);
                    }
                  } catch (err) {
                    logger.error(`❌ Embedding error for ${knowledgeId}:`, err);
                  }
                })
              );
              
              // Rate limiting pause between batches
              if (j + batchSize < data.knowledgeIds.length) {
                await new Promise(resolve => setTimeout(resolve, 200));
              }
            }
          }
        }

        setBatchProgress(((i + 1) / chunks.length) * 100);
        
        // Kleine pauze tussen chunks om rate limiting te voorkomen
        if (i < chunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      setSavedItemsCount(totalSaved);
      setLastSaveDetails({ categories: allCategories, total: totalSaved });
      setCurrentStatus("✅ Verwerking compleet!");

      const assistantMessage: Message = {
        role: "assistant",
        content: `✅ Verwerking compleet!\n\n📊 Resultaat:\n- ${chunks.length} delen verwerkt\n- ${totalSaved} kennisitems opgeslagen\n- ${wordCount} woorden verwerkt\n\n🎯 Alle bedrijfsinformatie is succesvol opgeslagen in de kennisbank. Geen enkele detail is verloren gegaan!`,
      };
      setMessages((prev) => [...prev, assistantMessage]);

      const categoryList = Object.entries(allCategories)
        .map(([cat, count]) => `${cat} (${count})`)
        .join(", ");

      toast({
        title: "🎉 Grote tekst volledig verwerkt!",
        description: categoryList ? `Categorieën: ${categoryList}` : `${totalSaved} kennisitems opgeslagen uit ${chunks.length} delen`,
        duration: 10000,
        className: "bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800",
      });

      setShowSuccessDialog(true);
      setTimeout(() => setCurrentStatus(""), 3000);
    } catch (error: any) {
      logger.error("Batch processing error:", error);
      setCurrentStatus("");
      toast({
        title: "❌ Fout bij verwerking",
        description: error.message || "Er is iets misgegaan. Probeer het opnieuw.",
        variant: "destructive",
        duration: 8000,
      });
    } finally {
      setIsProcessingBatch(false);
      setBatchProgress(0);
    }
  };

  const wordCount = input.split(/\s+/).filter(w => w.length > 0).length;
  const charCount = input.length;
  const isLargeText = wordCount > 500;

  return (
    <>
      <Card className="p-6">
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xl font-semibold">Training Chat - Onbeperkte Verwerking</h2>
              {savedItemsCount > 0 && (
                <div className="flex items-center gap-2 text-sm font-semibold text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950 px-3 py-1.5 rounded-full border border-green-200 dark:border-green-800">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Vandaag opgeslagen: {savedItemsCount} kennis items</span>
                </div>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Plak alle bedrijfsinformatie hier - geen limiet! Het systeem verwerkt automatisch grote teksten in delen zonder verlies.
            </p>
          </div>

          {currentStatus && (
            <Alert className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
              <Sparkles className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <AlertDescription className="text-blue-900 dark:text-blue-100 font-medium">
                {currentStatus}
              </AlertDescription>
            </Alert>
          )}

          {isProcessingBatch && (
            <Alert className="bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800">
              <Loader2 className="h-4 w-4 animate-spin text-amber-600 dark:text-amber-400" />
              <AlertDescription>
                <div className="space-y-2">
                  <p className="font-medium text-amber-900 dark:text-amber-100">Grote tekst wordt verwerkt...</p>
                  <Progress value={batchProgress} className="w-full h-3" />
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-amber-700 dark:text-amber-300">{Math.round(batchProgress)}% compleet</span>
                    <span className="text-amber-700 dark:text-amber-300">{savedItemsCount} items opgeslagen</span>
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          )}

        <ScrollArea className="h-[500px] w-full border rounded-lg p-4">
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <p>Start een gesprek om het AI systeem te trainen...</p>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg p-3 ${
                      message.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-lg p-3">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{wordCount} woorden • {charCount} karakters</span>
            {isLargeText && (
              <span className="flex items-center gap-1 text-amber-600">
                <FileText className="h-3 w-3" />
                Grote tekst - gebruik batch verwerking
              </span>
            )}
          </div>
          
          <div className="flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Plak hier alle bedrijfsinformatie - geen limiet! Alles wordt volledig verwerkt..."
              className="min-h-[500px] font-mono text-sm resize-none"
              disabled={isLoading || isProcessingBatch}
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.ctrlKey && !isLargeText) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <div className="flex flex-col gap-2">
              {isLargeText ? (
                <Button
                  onClick={handleProcessLargeText}
                  disabled={isLoading || isProcessingBatch || !input.trim()}
                  className="whitespace-nowrap"
                >
                  {isProcessingBatch ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <FileText className="h-4 w-4 mr-2" />
                  )}
                  Verwerk Groot Document
                </Button>
              ) : (
                <Button
                  onClick={handleSend}
                  disabled={isLoading || isProcessingBatch || !input.trim()}
                  size="icon"
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              )}
            </div>
          </div>
          
          <p className="text-xs text-muted-foreground">
            {isLargeText 
              ? "💡 Gebruik 'Verwerk Groot Document' voor optimale verwerking van grote teksten"
              : "💡 Druk Ctrl+Enter om te verzenden, of gebruik de knop"
            }
          </p>
        </div>
      </div>
    </Card>

    <Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-green-600 dark:text-green-400">
            <CheckCircle2 className="h-5 w-5" />
            Succesvol Opgeslagen!
          </DialogTitle>
          <DialogDescription>
            Je training data is volledig verwerkt en opgeslagen in de kennisbank.
          </DialogDescription>
        </DialogHeader>
        
        {lastSaveDetails && (
          <div className="space-y-4">
            <div className="bg-green-50 dark:bg-green-950 p-4 rounded-lg border border-green-200 dark:border-green-800">
              <p className="text-2xl font-bold text-green-600 dark:text-green-400 mb-1">
                {lastSaveDetails.total} items
              </p>
              <p className="text-sm text-muted-foreground">Opgeslagen in kennisbank</p>
            </div>

            {Object.keys(lastSaveDetails.categories).length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-2">Categorieën:</h4>
                <div className="space-y-2">
                  {Object.entries(lastSaveDetails.categories).map(([category, count]) => (
                    <div key={category} className="flex items-center justify-between text-sm bg-muted p-2 rounded">
                      <span className="font-medium capitalize">{category.replace(/_/g, ' ')}</span>
                      <span className="text-muted-foreground">{count} items</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Button 
              onClick={() => setShowSuccessDialog(false)} 
              className="w-full"
            >
              Geweldig!
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
    </>
  );
};
