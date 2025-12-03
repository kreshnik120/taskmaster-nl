import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, CheckCircle, AlertCircle } from "lucide-react";

interface ImportResult {
  batch: number;
  totalBatches: number;
  results: {
    created: number;
    skipped: number;
    errors: string[];
    orgsCreated: string[];
    locationsCreated: string[];
  };
}

export function ABCzorgImportTrigger() {
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [totalCreated, setTotalCreated] = useState(0);

  const handleImport = async () => {
    setIsImporting(true);
    setProgress(0);
    setResults([]);
    setTotalCreated(0);

    try {
      // Fetch the Excel data from the server or use pre-parsed data
      // For now, we'll trigger the import directly with mock batches
      // In production, this would parse the uploaded Excel file
      
      toast.info("Import gestart - dit kan enkele minuten duren...");

      // Import in batches - the edge function will handle the actual data
      const totalBatches = 10;
      let created = 0;

      for (let batch = 1; batch <= totalBatches; batch++) {
        const { data, error } = await supabase.functions.invoke("import-abczorg-sublocations", {
          body: {
            records: [], // Records would be passed from parsed Excel
            batchNumber: batch,
            totalBatches,
          },
        });

        if (error) {
          console.error(`Batch ${batch} error:`, error);
          toast.error(`Batch ${batch} mislukt: ${error.message}`);
          continue;
        }

        if (data?.results) {
          created += data.results.created || 0;
          setResults(prev => [...prev, data as ImportResult]);
        }

        setProgress((batch / totalBatches) * 100);
        setTotalCreated(created);
      }

      toast.success(`Import voltooid: ${created} sublocaties aangemaakt`);

    } catch (error) {
      console.error("Import error:", error);
      toast.error("Import mislukt");
    } finally {
      setIsImporting(false);
    }
  };

  const totalSkipped = results.reduce((sum, r) => sum + (r.results?.skipped || 0), 0);
  const totalErrors = results.reduce((sum, r) => sum + (r.results?.errors?.length || 0), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          ABCzorg Sublocaties Import
        </CardTitle>
        <CardDescription>
          Importeer alle sublocaties uit het ABC_Zorg_18-2.xlsx bestand
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button 
          onClick={handleImport} 
          disabled={isImporting}
          className="w-full"
        >
          {isImporting ? "Importeren..." : "Start Volledige Import"}
        </Button>

        {isImporting && (
          <div className="space-y-2">
            <Progress value={progress} />
            <p className="text-sm text-muted-foreground text-center">
              {Math.round(progress)}% - {totalCreated} sublocaties aangemaakt
            </p>
          </div>
        )}

        {results.length > 0 && !isImporting && (
          <div className="space-y-3 pt-4 border-t">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle className="h-5 w-5" />
              <span className="font-medium">{totalCreated} sublocaties aangemaakt</span>
            </div>
            
            {totalSkipped > 0 && (
              <div className="text-sm text-muted-foreground">
                {totalSkipped} records overgeslagen (NIET GEBRUIKEN / duplicaten)
              </div>
            )}

            {totalErrors > 0 && (
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-5 w-5" />
                <span>{totalErrors} fouten</span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
