import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, CheckCircle, AlertCircle, FileSpreadsheet, Eye, Building2, MapPin, ChevronDown, ChevronUp } from "lucide-react";
import * as XLSX from "xlsx";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

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

interface PreviewStats {
  totalRecords: number;
  uniqueOrganizations: string[];
  uniqueLocations: string[];
  recordsWithKvk: number;
  recordsWithPhone: number;
  recordsWithDescription: number;
  sampleRecords: ExcelRecord[];
}

export function ABCzorgExcelImport() {
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [totalCreated, setTotalCreated] = useState(0);
  const [totalUpdated, setTotalUpdated] = useState(0);
  const [parsedData, setParsedData] = useState<ExcelRecord[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [fileName, setFileName] = useState<string>("");
  const [previewStats, setPreviewStats] = useState<PreviewStats | null>(null);
  const [showPreview, setShowPreview] = useState(true);

  const calculatePreviewStats = (records: ExcelRecord[]): PreviewStats => {
    const uniqueOrgs = new Set<string>();
    const uniqueLocs = new Set<string>();
    let withKvk = 0;
    let withPhone = 0;
    let withDesc = 0;

    records.forEach(r => {
      if (r.Bedrijfsnaam) uniqueOrgs.add(r.Bedrijfsnaam.trim());
      if (r.Locatie) uniqueLocs.add(r.Locatie.trim());
      if (r["KVK nummer"]?.trim()) withKvk++;
      if (r.Telefoon?.trim() || r.Mobiel?.trim()) withPhone++;
      if (r["Publieke opmerking"]?.trim()) withDesc++;
    });

    return {
      totalRecords: records.length,
      uniqueOrganizations: Array.from(uniqueOrgs),
      uniqueLocations: Array.from(uniqueLocs),
      recordsWithKvk: withKvk,
      recordsWithPhone: withPhone,
      recordsWithDescription: withDesc,
      sampleRecords: records.slice(0, 5),
    };
  };

  const handleFileUpload = useCallback((file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: "array" });
        
        // Get first sheet
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // Convert to JSON
        const jsonData = XLSX.utils.sheet_to_json<ExcelRecord>(worksheet, {
          defval: "",
          raw: false,
        });
        
        // Filter out empty rows
        const validRecords = jsonData.filter(row => 
          row.Bedrijfsnaam && row.Bedrijfsnaam.toString().trim()
        );
        
        setParsedData(validRecords);
        setPreviewStats(calculatePreviewStats(validRecords));
        setShowPreview(true);
        toast.success(`${validRecords.length} records geladen uit ${file.name}`);
      } catch (error) {
        console.error("Excel parse error:", error);
        toast.error("Fout bij verwerken Excel bestand");
      }
    };
    
    reader.onerror = () => {
      toast.error("Fout bij lezen bestand");
    };
    
    reader.readAsArrayBuffer(file);
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
    if (parsedData.length === 0) {
      toast.error("Geen data om te importeren - upload eerst een Excel bestand");
      return;
    }

    setIsImporting(true);
    setProgress(0);
    setResults([]);
    setTotalCreated(0);
    setTotalUpdated(0);

    try {
      toast.info(`Import gestart voor ${parsedData.length} records...`);

      // Split into batches of 50 records
      const batchSize = 50;
      const batches: ExcelRecord[][] = [];
      for (let i = 0; i < parsedData.length; i += batchSize) {
        batches.push(parsedData.slice(i, i + batchSize));
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
          ABCzorg Excel Import
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
                accept=".xlsx,.xls"
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
              ✓ {parsedData.length} records geladen uit {fileName}
            </p>
          )}
        </div>

        {/* Preview Section */}
        {previewStats && parsedData.length > 0 && (
          <Collapsible open={showPreview} onOpenChange={setShowPreview}>
            <CollapsibleTrigger asChild>
              <Button variant="outline" className="w-full justify-between">
                <span className="flex items-center gap-2">
                  <Eye className="h-4 w-4" />
                  Import Preview
                </span>
                {showPreview ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3 space-y-4">
              {/* Statistics Grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-primary">{previewStats.totalRecords}</div>
                  <div className="text-xs text-muted-foreground">Totaal records</div>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-blue-600">{previewStats.uniqueOrganizations.length}</div>
                  <div className="text-xs text-muted-foreground">Unieke organisaties</div>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-green-600">{previewStats.uniqueLocations.length}</div>
                  <div className="text-xs text-muted-foreground">Unieke locaties</div>
                </div>
              </div>

              {/* Data Quality Indicators */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Data kwaliteit</h4>
                <div className="flex flex-wrap gap-2">
                  <Badge variant={previewStats.recordsWithKvk > 0 ? "default" : "secondary"}>
                    KVK: {previewStats.recordsWithKvk}/{previewStats.totalRecords}
                  </Badge>
                  <Badge variant={previewStats.recordsWithPhone > previewStats.totalRecords * 0.5 ? "default" : "secondary"}>
                    Telefoon: {previewStats.recordsWithPhone}/{previewStats.totalRecords}
                  </Badge>
                  <Badge variant={previewStats.recordsWithDescription > previewStats.totalRecords * 0.5 ? "default" : "secondary"}>
                    Beschrijving: {previewStats.recordsWithDescription}/{previewStats.totalRecords}
                  </Badge>
                </div>
              </div>

              {/* Sample Organizations */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Eerste 5 organisaties
                </h4>
                <div className="flex flex-wrap gap-1">
                  {previewStats.uniqueOrganizations.slice(0, 5).map((org, i) => (
                    <Badge key={i} variant="outline" className="text-xs">
                      {org}
                    </Badge>
                  ))}
                  {previewStats.uniqueOrganizations.length > 5 && (
                    <Badge variant="secondary" className="text-xs">
                      +{previewStats.uniqueOrganizations.length - 5} meer
                    </Badge>
                  )}
                </div>
              </div>

              {/* Sample Records Table */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Voorbeeld records
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border rounded-lg">
                    <thead className="bg-muted">
                      <tr>
                        <th className="p-2 text-left">Bedrijfsnaam</th>
                        <th className="p-2 text-left">Locatie</th>
                        <th className="p-2 text-left">Plaats</th>
                        <th className="p-2 text-left">KVK</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewStats.sampleRecords.map((record, i) => (
                        <tr key={i} className="border-t">
                          <td className="p-2 max-w-[150px] truncate">{record.Bedrijfsnaam}</td>
                          <td className="p-2 max-w-[120px] truncate">{record.Locatie || '-'}</td>
                          <td className="p-2">{record.Plaats || '-'}</td>
                          <td className="p-2">{record["KVK nummer"] || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

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
