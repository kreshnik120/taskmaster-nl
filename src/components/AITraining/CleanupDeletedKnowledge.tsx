import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Trash2, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function CleanupDeletedKnowledge() {
  const [lastCleanup, setLastCleanup] = useState<{
    cleaned: number;
    categories: Record<string, number>;
    timestamp: Date;
  } | null>(null);

  const cleanupMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('cleanup-deleted-knowledge', {
        body: {}
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data.cleaned > 0) {
        toast.success(`${data.cleaned} oude items permanent verwijderd`, {
          description: `Uitvoeringstijd: ${data.execution_time_ms}ms`,
        });
        setLastCleanup({
          cleaned: data.cleaned,
          categories: data.category_distribution || {},
          timestamp: new Date(),
        });
      } else {
        toast.info('Geen oude items gevonden om op te schonen');
      }
    },
    onError: (error: any) => {
      toast.error('Cleanup fout', {
        description: error.message,
      });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Automatische Opschoning</CardTitle>
        <CardDescription>
          Verwijder permanent soft-deleted knowledge items ouder dan 30 dagen
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Automatische cleanup</AlertTitle>
          <AlertDescription>
            Het systeem voert dagelijks om 03:00 automatisch een cleanup uit. 
            Je kunt ook handmatig een cleanup starten met onderstaande knop.
          </AlertDescription>
        </Alert>

        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Items die meer dan 30 dagen geleden soft-deleted zijn worden permanent verwijderd, 
            inclusief hun embeddings en versiegeschiedenis.
          </p>
        </div>

        <Button
          onClick={() => cleanupMutation.mutate()}
          disabled={cleanupMutation.isPending}
          variant="outline"
          className="w-full"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          {cleanupMutation.isPending ? 'Opschonen...' : 'Start Handmatige Cleanup'}
        </Button>

        {lastCleanup && (
          <div className="mt-4 p-4 bg-muted rounded-lg space-y-2">
            <h4 className="font-medium text-sm">Laatste Cleanup Resultaat</h4>
            <div className="text-sm space-y-1">
              <p>
                <strong>{lastCleanup.cleaned}</strong> items verwijderd op{' '}
                {lastCleanup.timestamp.toLocaleString('nl-NL')}
              </p>
              {Object.keys(lastCleanup.categories).length > 0 && (
                <div className="mt-2">
                  <p className="text-xs text-muted-foreground">Categorieën:</p>
                  <div className="grid grid-cols-2 gap-1 mt-1">
                    {Object.entries(lastCleanup.categories).map(([category, count]) => (
                      <div key={category} className="text-xs">
                        <span className="font-medium">{category}:</span> {count}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
