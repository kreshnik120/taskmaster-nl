import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Database, Loader2 } from "lucide-react";

export const SeedClientKnowledge = () => {
  const [isSeeding, setIsSeeding] = useState(false);
  const { toast } = useToast();

  const handleSeed = async () => {
    setIsSeeding(true);
    try {
      const { data, error } = await supabase.functions.invoke('seed-client-knowledge');

      if (error) {
        throw error;
      }

      if (data.success) {
        toast({
          title: "✅ Clients succesvol geïmporteerd",
          description: data.message,
        });
      } else {
        throw new Error(data.error || "Onbekende fout");
      }
    } catch (error) {
      console.error('Seed error:', error);
      toast({
        title: "Fout bij importeren",
        description: error instanceof Error ? error.message : "Er ging iets mis",
        variant: "destructive",
      });
    } finally {
      setIsSeeding(false);
    }
  };

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Database className="h-5 w-5" />
            Client Knowledge Importeren
          </h3>
          <p className="text-sm text-muted-foreground mt-2">
            Importeer alle bestaande client informatie naar de AI knowledge base. 
            Dit zorgt ervoor dat de AI assistant directe toegang heeft tot alle client gegevens 
            en vragen kan beantwoorden zoals "Welke klanten heeft ABCzorg?".
          </p>
        </div>

        <Button 
          onClick={handleSeed} 
          disabled={isSeeding}
          className="w-full"
        >
          {isSeeding ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Bezig met importeren...
            </>
          ) : (
            <>
              <Database className="mr-2 h-4 w-4" />
              Importeer Client Informatie
            </>
          )}
        </Button>

        <p className="text-xs text-muted-foreground">
          💡 Tip: Voer dit uit wanneer je nieuwe clients hebt toegevoegd om de AI assistant 
          up-to-date te houden met de laatste client informatie.
        </p>
      </div>
    </Card>
  );
};
