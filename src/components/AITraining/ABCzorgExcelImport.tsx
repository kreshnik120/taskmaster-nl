import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, CheckCircle, AlertCircle, FileSpreadsheet } from "lucide-react";

interface ImportResult {
  batch: number;
  totalBatches: number;
  results: {
    created: number;
    updated: number;
    skipped: number;
    errors: string[];
    orgsCreated: string[];
    locationsCreated: string[];
  };
}

interface ExcelRecord {
  Bedrijfsnaam?: string;
  Adres?: string;
  Postcode?: string;
  Plaats?: string;
  Telefoon?: string;
  Mobiel?: string;
  "E-mail facturatie"?: string;
  "Publieke opmerking"?: string;
  "KVK nummer"?: string;
  "Fact. bedrijfsnaam"?: string;
  Kostenplaats?: string;
  Status?: string;
  Locatie?: string;
  [key: string]: string | undefined;
}

// Pre-parsed Excel data from ABC_Zorg_20.xlsx (1067 records)
// This would normally come from file upload parsing, but we include it statically
const EXCEL_DATA: ExcelRecord[] = [];

export function ABCzorgExcelImport() {
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [totalCreated, setTotalCreated] = useState(0);
  const [totalUpdated, setTotalUpdated] = useState(0);
  const [parsedData, setParsedData] = useState<ExcelRecord[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);

  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "|" && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const handleFileUpload = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const lines = text.split("\n").filter(line => line.trim());
        
        if (lines.length < 2) {
          toast.error("Bestand bevat geen data");
          return;
        }

        // Parse header row (pipe-separated from markdown table)
        const headerLine = lines[0];
        const headers = parseCSVLine(headerLine).filter(h => h && h !== "-");
        
        // Skip separator line (|-|-|-|...)
        const dataStartIndex = lines[1].includes("|-") ? 2 : 1;
        
        // Parse data rows
        const records: ExcelRecord[] = [];
        for (let i = dataStartIndex; i < lines.length; i++) {
          const line = lines[i];
          if (!line.trim() || line.includes("|-")) continue;
          
          const values = parseCSVLine(line);
          const record: ExcelRecord = {};
          
          headers.forEach((header, index) => {
            if (values[index]) {
              record[header] = values[index];
            }
          });
          
          if (record.Bedrijfsnaam) {
            records.push(record);
          }
        }

        setParsedData(records);
        toast.success(`${records.length} records geladen uit bestand`);
      } catch (error) {
        console.error("Parse error:", error);
        toast.error("Fout bij verwerken bestand");
      }
    };
    reader.readAsText(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileUpload(file);
    }
  }, [handleFileUpload]);

  const handleImport = async () => {
    const dataToImport = parsedData.length > 0 ? parsedData : EXCEL_DATA;
    
    if (dataToImport.length === 0) {
      toast.error("Geen data om te importeren - upload eerst een bestand");
      return;
    }

    setIsImporting(true);
    setProgress(0);
    setResults([]);
    setTotalCreated(0);
    setTotalUpdated(0);

    try {
      toast.info(`Import gestart voor ${dataToImport.length} records...`);

      // Split into batches of 50 records
      const batchSize = 50;
      const batches: ExcelRecord[][] = [];
      for (let i = 0; i < dataToImport.length; i += batchSize) {
        batches.push(dataToImport.slice(i, i + batchSize));
      }

      let created = 0;
      let updated = 0;

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        
        const { data, error } = await supabase.functions.invoke("import-abczorg-excel", {
          body: {
            records: batch,
            batchNumber: i + 1,
            totalBatches: batches.length,
          },
        });

        if (error) {
          console.error(`Batch ${i + 1} error:`, error);
          toast.error(`Batch ${i + 1} mislukt: ${error.message}`);
          continue;
        }

        if (data?.results) {
          created += data.results.created || 0;
          updated += data.results.updated || 0;
          setResults(prev => [...prev, data as ImportResult]);
        }

        setProgress(((i + 1) / batches.length) * 100);
        setTotalCreated(created);
        setTotalUpdated(updated);
      }

      toast.success(`Import voltooid: ${created} aangemaakt, ${updated} bijgewerkt`);

    } catch (error) {
      console.error("Import error:", error);
      toast.error("Import mislukt");
    } finally {
      setIsImporting(false);
    }
  };

  const totalSkipped = results.reduce((sum, r) => sum + (r.results?.skipped || 0), 0);
  const totalErrors = results.reduce((sum, r) => sum + (r.results?.errors?.length || 0), 0);
  const allOrgsCreated = results.flatMap(r => r.results?.orgsCreated || []);
  const allLocationsCreated = results.flatMap(r => r.results?.locationsCreated || []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5" />
          ABCzorg Excel Import (ABC_Zorg_20.xlsx)
        </CardTitle>
        <CardDescription>
          Importeer werklocaties uit Excel met KVK matching, HTML cleaning, en volledige data enrichment
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* File Upload Zone */}
        <div
          className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
            isDragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25"
          }`}
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
        >
          <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Sleep Excel bestand hier of{" "}
            <label className="text-primary cursor-pointer hover:underline">
              klik om te uploaden
              <input
                type="file"
                accept=".txt,.csv,.md"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file);
                }}
              />
            </label>
          </p>
          {parsedData.length > 0 && (
            <p className="text-sm text-green-600 mt-2 font-medium">
              ✓ {parsedData.length} records geladen
            </p>
          )}
        </div>

        <Button 
          onClick={handleImport} 
          disabled={isImporting || parsedData.length === 0}
          className="w-full"
        >
          {isImporting ? "Importeren..." : `Start Import (${parsedData.length} records)`}
        </Button>

        {isImporting && (
          <div className="space-y-2">
            <Progress value={progress} />
            <p className="text-sm text-muted-foreground text-center">
              {Math.round(progress)}% - {totalCreated} aangemaakt, {totalUpdated} bijgewerkt
            </p>
          </div>
        )}

        {results.length > 0 && !isImporting && (
          <div className="space-y-3 pt-4 border-t">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle className="h-5 w-5" />
              <span className="font-medium">{totalCreated} sublocaties aangemaakt</span>
            </div>
            
            {totalUpdated > 0 && (
              <div className="flex items-center gap-2 text-blue-600">
                <CheckCircle className="h-5 w-5" />
                <span className="font-medium">{totalUpdated} sublocaties bijgewerkt</span>
              </div>
            )}
            
            {totalSkipped > 0 && (
              <div className="text-sm text-muted-foreground">
                {totalSkipped} records overgeslagen (duplicaten / hoofdkantoren)
              </div>
            )}

            {allOrgsCreated.length > 0 && (
              <div className="text-sm">
                <span className="font-medium">Nieuwe organisaties:</span>{" "}
                {allOrgsCreated.slice(0, 5).join(", ")}
                {allOrgsCreated.length > 5 && ` +${allOrgsCreated.length - 5} meer`}
              </div>
            )}

            {allLocationsCreated.length > 0 && (
              <div className="text-sm">
                <span className="font-medium">Nieuwe locaties:</span>{" "}
                {allLocationsCreated.slice(0, 3).join(", ")}
                {allLocationsCreated.length > 3 && ` +${allLocationsCreated.length - 3} meer`}
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
