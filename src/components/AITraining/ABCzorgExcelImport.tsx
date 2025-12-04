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

interface ProblematicRecord {
  bedrijfsnaam: string;
  reason: string;
  willBeSkipped: boolean;
}

interface CaseSpecificWithParent {
  bedrijfsnaam: string;
  parentOrg: string;
}

interface RealOrganizationRecord {
  bedrijfsnaam: string;
  kvk?: string;
}

interface HoofdlocatieRecord {
  bedrijfsnaam: string;
  parentOrg: string;
  kvk?: string;
}

interface KvkMatchedRecord {
  bedrijfsnaam: string;
  kvk: string;
  matchedOrg: string;
}

interface PreviewStats {
  totalRecords: number;
  uniqueOrganizations: string[];
  uniqueLocations: string[];
  recordsWithKvk: number;
  recordsWithPhone: number;
  recordsWithDescription: number;
  recordsWithAddress: number;
  recordsWithKostenplaats: number;
  avgDescriptionLength: number;
  sampleRecords: ExcelRecord[];
  detectedSectors: { sector: string; count: number }[];
  detectedDoelgroepen: { doelgroep: string; count: number }[];
  // KVK-driven categorization stats
  hoofdlocaties: HoofdlocatieRecord[];
  sublocatiesViaKvk: KvkMatchedRecord[];
  nieuweOrganisaties: RealOrganizationRecord[];
  werklocatiesViaNaam: CaseSpecificWithParent[];
  problematicRecords: ProblematicRecord[];
  // Counts
  hoofdlocatieCount: number;
  sublocatieViaKvkCount: number;
  nieuweOrgCount: number;
  werklocatieViaNaamCount: number;
  recordsToImport: number;
  uniqueKvkNumbers: number;
}

// AI-enrichment detection functions (matching edge function logic)
const detectSectorFromDescription = (desc: string): string[] => {
  const sectors: string[] = [];
  const lower = desc.toLowerCase();
  if (lower.includes('verpleeghuis') || lower.includes('verzorging') || lower.includes('ouderen') || lower.includes('vvt')) sectors.push('VVT');
  if (lower.includes('ggz') || lower.includes('psychiatr') || lower.includes('geestelijk')) sectors.push('GGZ');
  if (lower.includes('gehandi') || lower.includes('lvb') || lower.includes('verstandelijk') || lower.includes('ghz')) sectors.push('GHZ');
  if (lower.includes('jeugd') || lower.includes('kind')) sectors.push('Jeugdzorg');
  if (lower.includes('thuis')) sectors.push('Thuiszorg');
  if (lower.includes('ziekenhuis') || lower.includes('klinisch')) sectors.push('Ziekenhuis');
  return sectors;
};

const detectDoelgroepFromDescription = (desc: string): string[] => {
  const doelgroepen: string[] = [];
  const lower = desc.toLowerCase();
  if (lower.includes('ouderen') || lower.includes('dementie') || lower.includes('somatiek') || lower.includes('somatisch')) doelgroepen.push('Ouderen');
  if (lower.includes('lvb') || lower.includes('verstandelijk') || lower.includes('licht verstandelijk')) doelgroepen.push('LVB');
  if (lower.includes('psychiatr') || lower.includes('ggz')) doelgroepen.push('Psychiatrie');
  if (lower.includes('verslaving') || lower.includes('verslaafde')) doelgroepen.push('Verslaving');
  if (lower.includes('jeugd') || lower.includes('kind') || lower.includes('jongere')) doelgroepen.push('Kinderen/Jeugd');
  if (lower.includes('autis') || lower.includes('ass')) doelgroepen.push('Autisme');
  if (lower.includes('nah') || lower.includes('hersenletsel')) doelgroepen.push('NAH');
  return doelgroepen;
};

// Intelligent data cleaning detection (matching edge function logic)
const isCaseSpecificRecord = (record: ExcelRecord): { isCaseSpecific: boolean; reason?: string } => {
  const bedrijfsnaam = (record.Bedrijfsnaam || "").toLowerCase();
  const locatie = (record.Locatie || "").toLowerCase();
  const combined = `${bedrijfsnaam} ${locatie}`;
  
  const casePatterns: { pattern: RegExp; reason: string }[] = [
    { pattern: /1\s*op\s*1\s*begelei/i, reason: "1-op-1 begeleiding (individuele casus)" },
    { pattern: /casus\s+[a-z]\.?\s*(in|te)?/i, reason: "Casus-specifieke opdracht" },
    { pattern: /^client\s+[a-z]/i, reason: "Client-specifieke locatie" },
    { pattern: /begeleidersprofiel\s+(voor|van)/i, reason: "Begeleidersprofiel (geen locatie)" },
    { pattern: /begeleiding\s+in\s+\w+,?\s*(client|casus)/i, reason: "Begeleiding voor specifieke client" },
    { pattern: /center\s*park/i, reason: "Tijdelijke locatie (vakantiepark)" },
    { pattern: /^cp\s+de\s+/i, reason: "Tijdelijke Center Parcs locatie" },
    { pattern: /tijdelijke?\s+(opdracht|locatie|inzet)/i, reason: "Tijdelijke opdracht" },
    { pattern: /\(\s*tijden\s+casus/i, reason: "Casus met tijden (geen vaste locatie)" },
    { pattern: /kennis\s+(lvb|odd|adhd).*kenni/i, reason: "Profielbeschrijving (geen locatie)" },
  ];
  
  for (const { pattern, reason } of casePatterns) {
    if (pattern.test(bedrijfsnaam) || pattern.test(combined)) {
      return { isCaseSpecific: true, reason };
    }
  }
  
  return { isCaseSpecific: false };
};

// STRICTER: KVK alone is NOT enough - matching edge function logic
const isRealOrganization = (record: ExcelRecord): boolean => {
  const bedrijfsnaam = record.Bedrijfsnaam || "";
  const factBedrijfsnaam = record["Fact. bedrijfsnaam"] || "";
  
  // NOTE: KVK alone is NOT enough - almost all records have KVK
  // Contains "Stichting" at start = real organization
  if (/^stichting\s/i.test(bedrijfsnaam) || /^stichting\s/i.test(factBedrijfsnaam)) return true;
  
  // Ends with legal form AND substantial name = likely real org
  if (/\s+(b\.?v\.?|groep|zorggroep)$/i.test(bedrijfsnaam) && bedrijfsnaam.length > 15) return true;
  
  return false;
};

// Detect if record is a "Hoofdlocatie" (main location for an organization)
const isHoofdlocatie = (record: ExcelRecord): { isHoofd: boolean; parentOrgName?: string } => {
  const bedrijfsnaam = (record.Bedrijfsnaam || "");
  
  if (!/hoofdkantoor/i.test(bedrijfsnaam)) {
    return { isHoofd: false };
  }
  
  // Extract parent organization name
  let parentName = bedrijfsnaam
    .replace(/\s*-?\s*hoofdkantoor$/i, "")
    .replace(/,\s*$/, "")
    .trim();
  
  return { 
    isHoofd: true, 
    parentOrgName: parentName 
  };
};

// Extract KVK nummer
const extractKvk = (kvkStr: string | undefined): string | null => {
  if (!kvkStr) return null;
  const match = kvkStr.match(/\d{8}/);
  return match ? match[0] : null;
};

// Check if record has a known parent organization via Fact. bedrijfsnaam
const hasKnownParentOrganization = (record: ExcelRecord): boolean => {
  const factBedrijfsnaam = (record["Fact. bedrijfsnaam"] || "").trim();
  if (!factBedrijfsnaam) return false;
  
  // Pattern match for known organization names
  const knownPatterns = [
    /rosales/i, /heeren\s*loo/i, /leger\s*des\s*heils/i,
    /amarant/i, /pluryn/i, /kentalis/i, /dimence/i,
    /siza/i, /oro\b/i, /driestroom/i, /sherpa/i,
    /cello/i, /tactus/i, /iriszorg/i, /reinier\s*van\s*arkel/i,
    /mare\s*zorg/i, /kwintes/i, /atlant/i, /tussenvoorziening/i,
    /pro\s*persona/i, /mutsaers/i, /lister/i, /dichterbij/i,
    /ribw/i, /eleos/i, /ggnet/i, /triade/i, /vitree/i,
    /emergis/i, /opella/i, /vincent\s*van\s*gogh/i, /aveleijn/i,
    /jp\s*van\s*den\s*bent/i, /zozijn/i, /philadelphia/i,
    /zinzia/i, /careander/i, /careaz/i, /icare/i,
    /waalboog/i, /asvz/i, /sdw/i, /koraal/i,
    /mesazorg/i, /multiflexx/i, /zorgspectrum/i,
    /herenhuis/i, /gezusters/i, /hoeve/i, /rooyse\s*wissel/i,
  ];
  
  return knownPatterns.some(p => p.test(factBedrijfsnaam));
};

const shouldSkipRecord = (record: ExcelRecord): { skip: boolean; reason?: string } => {
  const bedrijfsnaam = record.Bedrijfsnaam || "";
  const locatie = record.Locatie || "";
  const status = record.Status || "";
  
  if (status.toLowerCase().includes("inactief") || status.toLowerCase().includes("niet actief")) {
    return { skip: true, reason: "Inactief record" };
  }
  
  const skipPatterns = [
    { pattern: "NIET GEBRUIKEN", reason: "Gemarkeerd als niet gebruiken" },
    { pattern: "TEST", reason: "Test record" },
    { pattern: "DUMMY", reason: "Dummy record" },
    { pattern: "VERVALLEN", reason: "Vervallen record" },
  ];
  
  for (const { pattern, reason } of skipPatterns) {
    if (bedrijfsnaam.toUpperCase().includes(pattern) || locatie.toUpperCase().includes(pattern)) {
      return { skip: true, reason };
    }
  }
  
  // NOTE: Hoofdkantoren worden NIET meer geskipt - ze worden als hoofdlocaties geïmporteerd!
  
  // Check case-specific records with parent organization awareness
  const caseCheck = isCaseSpecificRecord(record);
  if (caseCheck.isCaseSpecific) {
    // If record has known parent organization, DON'T skip - import as sublocation
    if (hasKnownParentOrganization(record)) {
      return { skip: false };
    }
    
    // No known parent AND not a real org itself → skip
    if (!isRealOrganization(record)) {
      return { skip: true, reason: caseCheck.reason + " (geen bekende organisatie)" };
    }
  }
  
  return { skip: false };
};

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

  // NEW: Classification function based on Fact. bedrijfsnaam instead of KVK
  type RecordClassification = 'SKIP' | 'HOOFDLOCATIE' | 'SUBLOCATIE' | 'NIEUWE_ORG' | 'STANDALONE';
  
  const classifyRecord = (record: ExcelRecord): RecordClassification => {
    // Skip check first
    if (shouldSkipRecord(record).skip) return 'SKIP';
    
    // Hoofdlocatie check (naam bevat "Hoofdkantoor")
    if (isHoofdlocatie(record).isHoofd) return 'HOOFDLOCATIE';
    
    const bedrijfsnaam = (record.Bedrijfsnaam || "").trim();
    const factBedrijfsnaam = (record["Fact. bedrijfsnaam"] || "").trim();
    
    // KEY INSIGHT: If Fact. bedrijfsnaam exists AND differs from Bedrijfsnaam → it's a sublocation
    if (factBedrijfsnaam && factBedrijfsnaam !== bedrijfsnaam) {
      return 'SUBLOCATIE';
    }
    
    // If it's a real organization (Stichting, B.V.) → new org
    if (isRealOrganization(record)) return 'NIEUWE_ORG';
    
    // Fallback: standalone werklocatie
    return 'STANDALONE';
  };

  const calculatePreviewStats = (records: ExcelRecord[]): PreviewStats => {
    const uniqueOrgs = new Set<string>();
    const uniqueLocs = new Set<string>();
    const uniqueKvks = new Set<string>();
    const uniqueFactBedrijfsnamen = new Set<string>();
    let withKvk = 0;
    let withPhone = 0;
    let withDesc = 0;
    let withAddress = 0;
    let withKostenplaats = 0;
    let totalDescLength = 0;
    let recordsToImport = 0;
    const sectorCounts = new Map<string, number>();
    const doelgroepCounts = new Map<string, number>();
    
    // Categorization arrays (for preview display, capped at 15)
    const hoofdlocaties: HoofdlocatieRecord[] = [];
    const sublocatiesViaKvk: KvkMatchedRecord[] = []; // Renamed but still used for UI
    const nieuweOrganisaties: RealOrganizationRecord[] = [];
    const werklocatiesViaNaam: CaseSpecificWithParent[] = [];
    const problematicRecords: ProblematicRecord[] = [];
    
    // First pass: collect all unique Fact. bedrijfsnaam values (parent organizations)
    records.forEach(r => {
      const factName = (r["Fact. bedrijfsnaam"] || "").trim();
      if (factName) uniqueFactBedrijfsnamen.add(factName);
    });

    records.forEach(r => {
      if (r.Bedrijfsnaam) uniqueOrgs.add(r.Bedrijfsnaam.trim());
      if (r.Locatie) uniqueLocs.add(r.Locatie.trim());
      
      const kvk = extractKvk(r["KVK nummer"]);
      if (kvk) {
        withKvk++;
        uniqueKvks.add(kvk);
      }
      if (r.Telefoon?.trim() || r.Mobiel?.trim()) withPhone++;
      if (r.Adres?.trim() || r.Postcode?.trim()) withAddress++;
      if (r.Kostenplaats?.trim()) withKostenplaats++;
      
      const classification = classifyRecord(r);
      
      if (classification === 'SKIP') {
        const skipReason = shouldSkipRecord(r).reason || "Onbekend";
        if (problematicRecords.length < 15) {
          problematicRecords.push({
            bedrijfsnaam: (r.Bedrijfsnaam || "").substring(0, 60),
            reason: skipReason,
            willBeSkipped: true,
          });
        }
        return; // Don't count as to import
      }
      
      recordsToImport++;
      
      // Categorize for preview display (capped at 15 each)
      const hoofdCheck = isHoofdlocatie(r);
      const factBedrijfsnaam = (r["Fact. bedrijfsnaam"] || "").trim();
      
      switch (classification) {
        case 'HOOFDLOCATIE':
          if (hoofdlocaties.length < 15) {
            hoofdlocaties.push({
              bedrijfsnaam: (r.Bedrijfsnaam || "").substring(0, 50),
              parentOrg: hoofdCheck.parentOrgName || "Onbekend",
              kvk: kvk || undefined,
            });
          }
          break;
        case 'SUBLOCATIE':
          if (sublocatiesViaKvk.length < 15) {
            sublocatiesViaKvk.push({
              bedrijfsnaam: (r.Bedrijfsnaam || "").substring(0, 50),
              kvk: kvk || "",
              matchedOrg: factBedrijfsnaam || "Onbekend",
            });
          }
          break;
        case 'NIEUWE_ORG':
          if (nieuweOrganisaties.length < 15) {
            nieuweOrganisaties.push({
              bedrijfsnaam: (r.Bedrijfsnaam || "").substring(0, 50),
              kvk: kvk || undefined,
            });
          }
          break;
        case 'STANDALONE':
          if (werklocatiesViaNaam.length < 15) {
            werklocatiesViaNaam.push({
              bedrijfsnaam: (r.Bedrijfsnaam || "").substring(0, 50),
              parentOrg: factBedrijfsnaam || "(geen parent)",
            });
          }
          break;
      }
      
      const desc = r["Publieke opmerking"]?.trim() || "";
      if (desc) {
        withDesc++;
        totalDescLength += desc.length;
        
        detectSectorFromDescription(desc).forEach(s => {
          sectorCounts.set(s, (sectorCounts.get(s) || 0) + 1);
        });
        detectDoelgroepFromDescription(desc).forEach(d => {
          doelgroepCounts.set(d, (doelgroepCounts.get(d) || 0) + 1);
        });
      }
    });

    const detectedSectors = Array.from(sectorCounts.entries())
      .map(([sector, count]) => ({ sector, count }))
      .sort((a, b) => b.count - a.count);
    
    const detectedDoelgroepen = Array.from(doelgroepCounts.entries())
      .map(([doelgroep, count]) => ({ doelgroep, count }))
      .sort((a, b) => b.count - a.count);

    // Calculate ACCURATE counts using classifyRecord over ALL records
    const allClassifications = records.map(r => classifyRecord(r));

    return {
      totalRecords: records.length,
      uniqueOrganizations: Array.from(uniqueOrgs),
      uniqueLocations: Array.from(uniqueLocs),
      recordsWithKvk: withKvk,
      recordsWithPhone: withPhone,
      recordsWithDescription: withDesc,
      recordsWithAddress: withAddress,
      recordsWithKostenplaats: withKostenplaats,
      avgDescriptionLength: withDesc > 0 ? Math.round(totalDescLength / withDesc) : 0,
      sampleRecords: records.slice(0, 5),
      detectedSectors,
      detectedDoelgroepen,
      // Preview arrays (capped at 15)
      hoofdlocaties,
      sublocatiesViaKvk,
      nieuweOrganisaties,
      werklocatiesViaNaam,
      problematicRecords,
      // ACCURATE counts over ALL records
      hoofdlocatieCount: allClassifications.filter(c => c === 'HOOFDLOCATIE').length,
      sublocatieViaKvkCount: allClassifications.filter(c => c === 'SUBLOCATIE').length,
      nieuweOrgCount: allClassifications.filter(c => c === 'NIEUWE_ORG').length,
      werklocatieViaNaamCount: allClassifications.filter(c => c === 'STANDALONE').length,
      recordsToImport,
      uniqueKvkNumbers: uniqueFactBedrijfsnamen.size, // Now counts unique parent orgs
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
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-primary">{previewStats.totalRecords}</div>
                  <div className="text-xs text-muted-foreground">Totaal records</div>
                </div>
                <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-3 text-center border border-green-200 dark:border-green-800">
                  <div className="text-2xl font-bold text-green-600">{previewStats.recordsToImport}</div>
                  <div className="text-xs text-green-600/80">Te importeren</div>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-blue-600">{previewStats.uniqueOrganizations.length}</div>
                  <div className="text-xs text-muted-foreground">Unieke bedrijfsnamen</div>
                </div>
                <div className="bg-amber-50 dark:bg-amber-950/30 rounded-lg p-3 text-center border border-amber-200 dark:border-amber-800">
                  <div className="text-2xl font-bold text-amber-600">{previewStats.totalRecords - previewStats.recordsToImport}</div>
                  <div className="text-xs text-amber-600/80">Worden overgeslagen</div>
                </div>
              </div>

              {/* Classification Summary Banner */}
              <div className="p-3 bg-muted/50 rounded-lg border">
                <div className="flex flex-wrap items-center gap-4 text-sm">
                  <span className="flex items-center gap-1">
                    <span className="text-purple-600">🏛️</span>
                    <span className="font-medium">{previewStats.hoofdlocatieCount}</span>
                    <span className="text-muted-foreground">hoofdlocaties</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="text-blue-600">📍</span>
                    <span className="font-medium">{previewStats.sublocatieViaKvkCount}</span>
                    <span className="text-muted-foreground">sublocaties</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="text-cyan-600">🆕</span>
                    <span className="font-medium">{previewStats.nieuweOrgCount}</span>
                    <span className="text-muted-foreground">nieuwe orgs</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="text-green-600">🏠</span>
                    <span className="font-medium">{previewStats.werklocatieViaNaamCount}</span>
                    <span className="text-muted-foreground">standalone</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="text-amber-600">⚠️</span>
                    <span className="font-medium">{previewStats.totalRecords - previewStats.recordsToImport}</span>
                    <span className="text-muted-foreground">overgeslagen</span>
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  📊 {previewStats.uniqueKvkNumbers} unieke parent organisaties gedetecteerd via Fact. bedrijfsnaam
                </p>
              </div>

              {/* Data Quality Indicators */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Data kwaliteit</h4>
                <div className="flex flex-wrap gap-2">
                  <Badge variant={previewStats.recordsWithKvk > 0 ? "default" : "secondary"}>
                    🔑 KVK: {previewStats.recordsWithKvk}/{previewStats.totalRecords} ({previewStats.uniqueKvkNumbers} uniek)
                  </Badge>
                  <Badge variant={previewStats.recordsWithPhone > previewStats.totalRecords * 0.5 ? "default" : "secondary"}>
                    📞 Telefoon: {previewStats.recordsWithPhone}/{previewStats.totalRecords}
                  </Badge>
                  <Badge variant={previewStats.recordsWithDescription > previewStats.totalRecords * 0.5 ? "default" : "secondary"}>
                    📝 Beschrijving: {previewStats.recordsWithDescription}/{previewStats.totalRecords}
                  </Badge>
                  <Badge variant={previewStats.recordsWithAddress > previewStats.totalRecords * 0.5 ? "default" : "secondary"}>
                    📍 Adres: {previewStats.recordsWithAddress}/{previewStats.totalRecords}
                  </Badge>
                  <Badge variant={previewStats.recordsWithKostenplaats > 0 ? "default" : "secondary"}>
                    🏷️ Kostenplaats: {previewStats.recordsWithKostenplaats}/{previewStats.totalRecords}
                  </Badge>
                </div>
                {previewStats.avgDescriptionLength > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Gemiddelde beschrijving: {previewStats.avgDescriptionLength} karakters
                  </p>
                )}
              </div>

              {/* AI-Enrichment Preview */}
              {(previewStats.detectedSectors.length > 0 || previewStats.detectedDoelgroepen.length > 0) && (
                <div className="space-y-3 p-3 bg-primary/5 rounded-lg border border-primary/20">
                  <h4 className="text-sm font-medium flex items-center gap-2 text-primary">
                    🤖 AI-Enrichment Preview
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Deze sectoren en doelgroepen worden automatisch gedetecteerd uit de beschrijvingen:
                  </p>
                  
                  {previewStats.detectedSectors.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-xs font-medium">Sectoren:</span>
                      <div className="flex flex-wrap gap-1">
                        {previewStats.detectedSectors.map(({ sector, count }) => (
                          <Badge key={sector} variant="outline" className="text-xs bg-blue-50 border-blue-200 text-blue-700">
                            {sector} ({count}x)
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {previewStats.detectedDoelgroepen.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-xs font-medium">Doelgroepen:</span>
                      <div className="flex flex-wrap gap-1">
                        {previewStats.detectedDoelgroepen.map(({ doelgroep, count }) => (
                          <Badge key={doelgroep} variant="outline" className="text-xs bg-green-50 border-green-200 text-green-700">
                            {doelgroep} ({count}x)
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* KVK-Driven Category Preview */}
              <div className="space-y-3">
                {/* Category 1: Hoofdlocaties */}
                {previewStats.hoofdlocatieCount > 0 && (
                  <div className="p-3 bg-purple-50 dark:bg-purple-950/30 rounded-lg border border-purple-200 dark:border-purple-800">
                    <h4 className="text-sm font-medium flex items-center gap-2 text-purple-700 dark:text-purple-400 mb-2">
                      <Building2 className="h-4 w-4" />
                      🏛️ Hoofdlocaties ({previewStats.hoofdlocatieCount})
                    </h4>
                    <p className="text-xs text-purple-600 dark:text-purple-500 mb-2">
                      Records met "Hoofdkantoor" - worden als hoofdlocaties voor organisaties geïmporteerd:
                    </p>
                    <div className="space-y-1 max-h-[120px] overflow-y-auto">
                      {previewStats.hoofdlocaties.slice(0, 10).map((record, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs p-1.5 bg-white dark:bg-background/50 rounded border border-purple-200 dark:border-purple-700">
                          <span className="text-purple-500">🏛️</span>
                          <span className="font-medium truncate flex-1">{record.bedrijfsnaam}</span>
                          <span className="text-muted-foreground">→</span>
                          <Badge variant="outline" className="text-xs bg-purple-100 dark:bg-purple-900/50">
                            {record.parentOrg}
                          </Badge>
                        </div>
                      ))}
                      {previewStats.hoofdlocatieCount > 10 && (
                        <div className="text-xs text-purple-500 pl-6">
                          +{previewStats.hoofdlocatieCount - 10} meer hoofdlocaties...
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Category 2: Sublocaties via Fact. bedrijfsnaam matching */}
                {previewStats.sublocatieViaKvkCount > 0 && (
                  <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                    <h4 className="text-sm font-medium flex items-center gap-2 text-blue-700 dark:text-blue-400 mb-2">
                      <Building2 className="h-4 w-4" />
                      📍 Sublocaties ({previewStats.sublocatieViaKvkCount})
                    </h4>
                    <p className="text-xs text-blue-600 dark:text-blue-500 mb-2">
                      Werklocaties gekoppeld aan organisaties via Fact. bedrijfsnaam:
                    </p>
                    <div className="space-y-1 max-h-[120px] overflow-y-auto">
                      {previewStats.sublocatiesViaKvk.slice(0, 10).map((record, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs p-1.5 bg-white dark:bg-background/50 rounded border border-blue-200 dark:border-blue-700">
                          <span className="text-blue-500">📍</span>
                          <span className="font-medium truncate flex-1">{record.bedrijfsnaam}</span>
                          <span className="text-muted-foreground">→</span>
                          <Badge variant="outline" className="text-xs bg-blue-100 dark:bg-blue-900/50">
                            {record.matchedOrg}
                          </Badge>
                        </div>
                      ))}
                      {previewStats.sublocatieViaKvkCount > 10 && (
                        <div className="text-xs text-blue-500 pl-6">
                          +{previewStats.sublocatieViaKvkCount - 10} meer sublocaties...
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Category 3: Nieuwe Organisaties */}
                {previewStats.nieuweOrgCount > 0 && (
                  <div className="p-3 bg-cyan-50 dark:bg-cyan-950/30 rounded-lg border border-cyan-200 dark:border-cyan-800">
                    <h4 className="text-sm font-medium flex items-center gap-2 text-cyan-700 dark:text-cyan-400 mb-2">
                      <Building2 className="h-4 w-4" />
                      🆕 Nieuwe Organisaties ({previewStats.nieuweOrgCount})
                    </h4>
                    <p className="text-xs text-cyan-600 dark:text-cyan-500 mb-2">
                      Nieuwe organisaties met "Stichting" of "B.V." die worden aangemaakt:
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {previewStats.nieuweOrganisaties.slice(0, 15).map((org, i) => (
                        <Badge key={i} variant="outline" className="text-xs bg-cyan-100 dark:bg-cyan-900/50 border-cyan-300">
                          {org.bedrijfsnaam}
                        </Badge>
                      ))}
                      {previewStats.nieuweOrgCount > 15 && (
                        <Badge variant="outline" className="text-xs bg-cyan-200 dark:bg-cyan-800">
                          +{previewStats.nieuweOrgCount - 15} meer
                        </Badge>
                      )}
                    </div>
                  </div>
                )}

                {/* Category 4: Standalone Werklocaties */}
                {previewStats.werklocatieViaNaamCount > 0 && (
                  <div className="p-3 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-800">
                    <h4 className="text-sm font-medium flex items-center gap-2 text-green-700 dark:text-green-400 mb-2">
                      <MapPin className="h-4 w-4" />
                      🏠 Standalone Werklocaties ({previewStats.werklocatieViaNaamCount})
                    </h4>
                    <p className="text-xs text-green-600 dark:text-green-500 mb-2">
                      Records zonder parent organisatie (Bedrijfsnaam = Fact. bedrijfsnaam):
                    </p>
                    <div className="space-y-1 max-h-[120px] overflow-y-auto">
                      {previewStats.werklocatiesViaNaam.slice(0, 10).map((record, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs p-1.5 bg-white dark:bg-background/50 rounded border border-green-200 dark:border-green-700">
                          <span className="text-green-500">🏠</span>
                          <span className="font-medium truncate flex-1">{record.bedrijfsnaam}</span>
                          {record.parentOrg && record.parentOrg !== "(geen parent)" && (
                            <>
                              <span className="text-muted-foreground">Fact:</span>
                              <Badge variant="outline" className="text-xs bg-green-100 dark:bg-green-900/50">
                                {record.parentOrg}
                              </Badge>
                            </>
                          )}
                        </div>
                      ))}
                      {previewStats.werklocatieViaNaamCount > 10 && (
                        <div className="text-xs text-green-500 pl-6">
                          +{previewStats.werklocatieViaNaamCount - 10} meer standalone...
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Category 3: Skipped Records (moved from above, now in context) */}
                {previewStats.problematicRecords.length > 0 && (
                  <div className="p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800">
                    <h4 className="text-sm font-medium flex items-center gap-2 text-amber-700 dark:text-amber-400 mb-2">
                      <AlertCircle className="h-4 w-4" />
                      ⚠️ Overgeslagen Records ({previewStats.totalRecords - previewStats.recordsToImport})
                    </h4>
                    <p className="text-xs text-amber-600 dark:text-amber-500 mb-2">
                      Records die worden overgeslagen (inactief, test, case-specifiek zonder bekende parent):
                    </p>
                    <div className="max-h-[120px] overflow-y-auto space-y-1">
                      {previewStats.problematicRecords.map((record, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs p-1.5 bg-white dark:bg-background/50 rounded border border-amber-200 dark:border-amber-700">
                          <span className="text-amber-500 mt-0.5">✗</span>
                          <div className="flex-1 min-w-0">
                            <span className="font-medium truncate block">{record.bedrijfsnaam}</span>
                            <span className="text-muted-foreground">{record.reason}</span>
                          </div>
                        </div>
                      ))}
                      {(previewStats.totalRecords - previewStats.recordsToImport) > 15 && (
                        <p className="text-xs text-amber-600 italic">
                          ...en {(previewStats.totalRecords - previewStats.recordsToImport) - 15} meer
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Sample Records Table - EXPANDED */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Voorbeeld records (volledige data)
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border rounded-lg">
                    <thead className="bg-muted">
                      <tr>
                        <th className="p-2 text-left">Bedrijfsnaam</th>
                        <th className="p-2 text-left">Locatie</th>
                        <th className="p-2 text-left">Plaats</th>
                        <th className="p-2 text-left">📞 Telefoon</th>
                        <th className="p-2 text-left">🏷️ Kostenplaats</th>
                        <th className="p-2 text-left min-w-[200px]">📝 Beschrijving</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewStats.sampleRecords.map((record, i) => {
                        const desc = record["Publieke opmerking"]?.trim() || "";
                        const truncatedDesc = desc.length > 80 ? desc.substring(0, 80) + "..." : desc;
                        return (
                          <tr key={i} className="border-t">
                            <td className="p-2 max-w-[120px] truncate font-medium">{record.Bedrijfsnaam}</td>
                            <td className="p-2 max-w-[100px] truncate">{record.Locatie || '-'}</td>
                            <td className="p-2">{record.Plaats || '-'}</td>
                            <td className="p-2 text-muted-foreground">{record.Telefoon || record.Mobiel || '-'}</td>
                            <td className="p-2 text-muted-foreground">{record.Kostenplaats || '-'}</td>
                            <td className="p-2 text-muted-foreground" title={desc}>
                              {truncatedDesc || <span className="text-destructive/60">Geen beschrijving</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted-foreground italic">
                  ℹ️ Alle data inclusief volledige beschrijvingen, adressen en KVK worden geïmporteerd naar de database.
                </p>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        <Button 
          onClick={handleImport} 
          disabled={isImporting || parsedData.length === 0}
          className="w-full"
        >
          {isImporting 
            ? "Importeren..." 
            : previewStats 
              ? `Start Import (${previewStats.recordsToImport} van ${parsedData.length} records)`
              : `Start Import (${parsedData.length} records)`
          }
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
