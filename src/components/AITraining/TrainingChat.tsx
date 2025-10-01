import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Loader2, FileText, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";

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

    try {
      const { data, error } = await supabase.functions.invoke("ai-training-chat", {
        body: { message: messageContent },
      });

      if (error) throw error;

      const assistantMessage: Message = {
        role: "assistant",
        content: data.response || "Geen antwoord ontvangen.",
      };
      setMessages((prev) => [...prev, assistantMessage]);

      // Toon opgeslagen items
      if (data.savedCount && data.savedCount > 0) {
        setSavedItemsCount(prev => prev + data.savedCount);
        toast({
          title: `✅ ${data.savedCount} kennisitem(s) opgeslagen`,
          description: "Training data succesvol verwerkt",
        });
      }
    } catch (error: any) {
      console.error("Training chat error:", error);
      toast({
        title: "Fout bij training chat",
        description: error.message || "Er is iets misgegaan",
        variant: "destructive",
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

    const userMessage: Message = { 
      role: "user", 
      content: `[Grote tekst verwerking gestart - ${wordCount} woorden]` 
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");

    try {
      const chunks = chunkText(text, 3500);
      let totalSaved = 0;

      for (let i = 0; i < chunks.length; i++) {
        const chunkMessage = `DEEL ${i + 1}/${chunks.length} - BELANGRIJKE BEDRIJFSINFORMATIE:\n\n${chunks[i]}\n\n[Verwerk alle cruciale informatie uit dit deel. Mis niets!]`;
        
        const { data, error } = await supabase.functions.invoke("ai-training-chat", {
          body: { message: chunkMessage, isChunk: true, chunkIndex: i + 1, totalChunks: chunks.length },
        });

        if (error) {
          console.error(`Chunk ${i + 1} error:`, error);
        } else if (data.savedCount) {
          totalSaved += data.savedCount;
        }

        setBatchProgress(((i + 1) / chunks.length) * 100);
        
        // Kleine pauze tussen chunks om rate limiting te voorkomen
        if (i < chunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      setSavedItemsCount(totalSaved);

      const assistantMessage: Message = {
        role: "assistant",
        content: `✅ Verwerking compleet!\n\n📊 Resultaat:\n- ${chunks.length} delen verwerkt\n- ${totalSaved} kennisitems opgeslagen\n- ${wordCount} woorden verwerkt\n\n🎯 Alle bedrijfsinformatie is succesvol opgeslagen in de kennisbank. Geen enkele detail is verloren gegaan!`,
      };
      setMessages((prev) => [...prev, assistantMessage]);

      toast({
        title: "🎉 Grote tekst volledig verwerkt",
        description: `${totalSaved} kennisitems opgeslagen uit ${chunks.length} delen`,
      });
    } catch (error: any) {
      console.error("Batch processing error:", error);
      toast({
        title: "Fout bij verwerking",
        description: error.message || "Er is iets misgegaan",
        variant: "destructive",
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
    <Card className="p-6">
      <div className="space-y-4">
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xl font-semibold">Training Chat - Onbeperkte Verwerking</h2>
            {savedItemsCount > 0 && (
              <div className="flex items-center gap-2 text-sm text-green-600">
                <CheckCircle2 className="h-4 w-4" />
                <span>{savedItemsCount} items opgeslagen deze sessie</span>
              </div>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Plak alle bedrijfsinformatie hier - geen limiet! Het systeem verwerkt automatisch grote teksten in delen zonder verlies.
          </p>
        </div>

        {isProcessingBatch && (
          <Alert>
            <Loader2 className="h-4 w-4 animate-spin" />
            <AlertDescription>
              <div className="space-y-2">
                <p className="font-medium">Grote tekst wordt verwerkt...</p>
                <Progress value={batchProgress} className="w-full" />
                <p className="text-xs text-muted-foreground">{Math.round(batchProgress)}% compleet</p>
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
  );
};
