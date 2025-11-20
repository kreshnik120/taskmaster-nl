import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertTriangle, CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner";

interface CleanupResult {
  itemId: string;
  key: string;
  duplicateFields: string[];
  before: any;
  after: any;
  fixed: boolean;
  error?: string;
}

export const CleanupDuplicateFields = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<{
    totalAnalyzed: number;
    itemsWithDuplicates: number;
    itemsFixed: number;
    results: CleanupResult[];
  } | null>(null);

  const runCleanup = async () => {
    setIsRunning(true);
    setResults(null);

    try {
      const { data, error } = await supabase.functions.invoke('cleanup-duplicate-fields');

      if (error) throw error;

      setResults(data);
      
      if (data.itemsFixed > 0) {
        toast.success(`${data.itemsFixed} knowledge items succesvol opgeschoond!`);
      } else {
        toast.info("Geen duplicate velden gevonden - alles ziet er goed uit!");
      }
    } catch (error: any) {
      console.error('Cleanup error:', error);
      toast.error(error.message || "Fout bij cleanup");
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-warning" />
          Cleanup Duplicate Fields
        </CardTitle>
        <CardDescription>
          Detecteer en verwijder duplicate velden tussen top-level en nested structuren in de knowledge base.
          Dit voorkomt data corruption bij conflict resolutions.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertDescription>
            <strong>Wat doet dit?</strong>
            <ul className="list-disc ml-4 mt-2 space-y-1">
              <li>Scant alle knowledge items voor duplicate velden</li>
              <li>Verwijdert top-level duplicaten (behoudt alleen nested versie in <code>value</code>)</li>
              <li>Voorkomt toekomstige data corruption bij inline edits</li>
            </ul>
          </AlertDescription>
        </Alert>

        <Button 
          onClick={runCleanup} 
          disabled={isRunning}
          className="w-full"
        >
          {isRunning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isRunning ? "Bezig met cleanup..." : "Start Cleanup"}
        </Button>

        {results && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold">{results.totalAnalyzed}</div>
                  <p className="text-xs text-muted-foreground">Items Geanalyseerd</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold text-warning">{results.itemsWithDuplicates}</div>
                  <p className="text-xs text-muted-foreground">Met Duplicaten</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold text-success">{results.itemsFixed}</div>
                  <p className="text-xs text-muted-foreground">Opgeschoond</p>
                </CardContent>
              </Card>
            </div>

            {results.results.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-semibold">Cleanup Details:</h3>
                {results.results.map((result, idx) => (
                  <Card key={idx} className={result.fixed ? "border-success" : "border-destructive"}>
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            {result.fixed ? (
                              <CheckCircle className="h-4 w-4 text-success" />
                            ) : (
                              <XCircle className="h-4 w-4 text-destructive" />
                            )}
                            <code className="text-sm font-mono">{result.key}</code>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {result.duplicateFields.map(field => (
                              <Badge key={field} variant="outline">
                                {field}
                              </Badge>
                            ))}
                          </div>
                          {result.error && (
                            <p className="text-xs text-destructive mt-2">{result.error}</p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
