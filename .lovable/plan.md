
# Fase 6A Fix + 6B AI Extractie - Implementatieplan

## 1. Overzicht

| Aspect | Details |
|--------|---------|
| **Scope** | 4 onderdelen: Upload fix, View hint, AI Extractie, Enterprise View |
| **Risico niveau** | MEDIUM (nieuwe edge function + AI integratie) |
| **Bestaande patronen** | `ai-task-scorer` voor Gemini, `AttachmentUploadZone` voor uploads |
| **Nieuwe bestanden** | 4 nieuwe files (1 edge function, 1 hook, 2 componenten) |
| **Bestaande wijzigingen** | 2 files (CreateMeetingMinuteDialog, MeetingMinuteDetail) |

---

## 2. Bestandsstructuur

```text
supabase/functions/
└── ai-extract-meeting-minute/
    └── index.ts                        (NIEUW - Gemini extractie)

src/
├── hooks/notulen/
│   └── useAIExtractMeeting.ts          (NIEUW - extractie hook)
├── components/notulen/
│   ├── ExtractedDataPreview.tsx        (NIEUW - preview met confidence)
│   ├── MeetingMinuteStructuredView.tsx (NIEUW - enterprise view)
│   ├── CreateMeetingMinuteDialog.tsx   (UPDATE - upload + AI import)
│   └── MeetingMinuteDetail.tsx         (UPDATE - view mode hint)
```

---

## 3. DEEL 1: Upload in CreateMeetingMinuteDialog (~60 regels)

### Huidige Situatie
- `CreateMeetingMinuteDialog.tsx` heeft GEEN upload functionaliteit
- `AttachmentUploadZone` bestaat en werkt met `meetingMinuteId` + `orgId`
- Probleem: Bij aanmaken bestaat `meetingMinuteId` nog niet

### Oplossing: "Pending Files" Pattern
Net als bij taken: bestanden selecteren in dialog, uploaden NA succesvolle aanmaak.

### Wijzigingen

```typescript
// Nieuwe imports
import { useState } from "react";
import { Paperclip, X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { useUploadAttachment, ALLOWED_MIME_TYPES, MAX_FILE_SIZE } from "@/hooks/notulen/useUploadAttachment";
import { formatFileSize, getFileCategory } from "@/lib/fileHelpers";
import { supabase } from "@/integrations/supabase/client";

// Nieuwe state
const [pendingFiles, setPendingFiles] = useState<File[]>([]);
const { uploadMultiple, isUploading } = useUploadAttachment();

// File selection handler
const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
  const files = Array.from(e.target.files || []);
  const validFiles = files.filter(file => {
    if (file.size > MAX_FILE_SIZE) {
      toast.error(`${file.name}: Bestand te groot (max 10MB)`);
      return false;
    }
    if (!ALLOWED_MIME_TYPES.includes(file.type as any)) {
      toast.error(`${file.name}: Bestandstype niet toegestaan`);
      return false;
    }
    return true;
  });
  setPendingFiles(prev => [...prev, ...validFiles].slice(0, 5));
  e.target.value = '';
};

// Remove file handler
const handleRemoveFile = (index: number) => {
  setPendingFiles(prev => prev.filter((_, i) => i !== index));
};

// In onSubmit, na createMeetingMinute:
if (pendingFiles.length > 0) {
  const { data: userOrg } = await supabase
    .from('user_organizations')
    .select('org_id')
    .limit(1)
    .maybeSingle();
  
  if (userOrg?.org_id) {
    await uploadMultiple(minuteId, userOrg.org_id, pendingFiles);
  }
}
setPendingFiles([]);
```

### UI Toevoeging (na meeting_link field)

```tsx
{/* Bijlagen Sectie */}
<div className="space-y-2">
  <Label>Bijlagen (optioneel)</Label>
  <div className="space-y-2">
    {/* File input trigger */}
    <label className="flex items-center gap-2 px-3 py-2 border-2 border-dashed rounded-lg cursor-pointer hover:border-primary/50 transition-colors">
      <Paperclip className="h-4 w-4 text-muted-foreground" />
      <span className="text-sm text-muted-foreground">
        Bestanden toevoegen (PDF, Word, Excel, afbeeldingen)
      </span>
      <input
        type="file"
        multiple
        accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.xls,.xlsx"
        onChange={handleFilesSelected}
        className="hidden"
        disabled={isCreating || isUploading}
      />
    </label>
    
    {/* Pending files list */}
    {pendingFiles.length > 0 && (
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">
          {pendingFiles.length} bestand(en) geselecteerd
        </p>
        {pendingFiles.map((file, index) => (
          <div key={index} className="flex items-center gap-2 text-sm bg-muted/50 rounded px-2 py-1">
            <span className="truncate flex-1">{file.name}</span>
            <span className="text-xs text-muted-foreground shrink-0">
              {formatFileSize(file.size)}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-5 w-5 shrink-0"
              onClick={() => handleRemoveFile(index)}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>
    )}
  </div>
</div>
```

---

## 4. DEEL 2: View Mode Hint (~20 regels)

### Huidige Situatie (AttachmentList.tsx regel 191-196)
```typescript
if (attachments.length === 0) {
  return (
    <p className="text-sm text-muted-foreground italic py-2">
      Nog geen bijlagen toegevoegd
    </p>
  );
}
```

### Probleem
- Geen onderscheid tussen view mode en edit mode
- Geen hint hoe gebruiker bijlagen kan toevoegen

### Oplossing
Pas `AttachmentList` aan om `isEditMode` te gebruiken voor contextspecifieke empty state.

### Wijziging in AttachmentList.tsx

```typescript
if (attachments.length === 0) {
  if (isEditMode) {
    // In edit mode: simpele tekst (upload zone is al zichtbaar erboven)
    return (
      <p className="text-sm text-muted-foreground italic py-2">
        Nog geen bijlagen toegevoegd
      </p>
    );
  }
  
  // In view mode: hint om naar edit mode te gaan
  return (
    <div className="text-center py-6 border-2 border-dashed rounded-lg bg-muted/20">
      <FileText className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
      <p className="text-sm text-muted-foreground">
        Geen bijlagen toegevoegd
      </p>
      <p className="text-xs text-muted-foreground mt-1">
        Klik op <span className="font-medium">"Bewerken"</span> om bijlagen toe te voegen
      </p>
    </div>
  );
}
```

---

## 5. DEEL 3: AI Extractie met Gemini Flash

### 3A. Edge Function: `ai-extract-meeting-minute`

**Bestand**: `supabase/functions/ai-extract-meeting-minute/index.ts`

**Configuratie in config.toml**:
```toml
[functions.ai-extract-meeting-minute]
verify_jwt = true
# Purpose: Extract meeting data from documents using Gemini Flash
```

**Functionaliteit**:
- Ontvangt document tekst (max 50.000 karakters)
- Stuurt naar Gemini Flash met gestructureerde prompt
- Extraheert: titel, datum, tijd, locatie, type, deelnemers, agenda, beslissingen, actiepunten
- Inclusief confidence scores per veld
- Robust JSON parsing met fallback (hergebruik patronen van `ai-task-scorer`)

**Implementatie**:

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Interface definitions
interface ExtractedMeetingData {
  title: string | null;
  meeting_date: string | null; // YYYY-MM-DD
  meeting_time: string | null; // HH:MM
  location: string | null;
  meeting_type: 'team' | 'board' | 'project' | 'klant' | 'overig' | null;
  participants: Array<{
    name: string;
    role: string | null;
    present: boolean;
  }>;
  agenda_items: Array<{
    item: string;
    discussed: boolean;
  }>;
  decisions: Array<{
    decision: string;
    owner: string | null;
    deadline: string | null;
  }>;
  action_items: Array<{
    action: string;
    assignee: string | null;
    deadline: string | null;
  }>;
  notes: string | null;
  summary: string | null;
  confidence_scores: {
    title: number;
    meeting_date: number;
    meeting_time: number;
    location: number;
    meeting_type: number;
    participants: number;
    agenda_items: number;
    decisions: number;
    action_items: number;
    overall: number;
  };
}

// Sanitization functions (copied from ai-task-scorer pattern)
function sanitizeAIContent(content: string): string {
  let cleaned = content;
  const prefixPatterns = [
    /^(Hier is|Here's|Here is|Sure!|Certainly!)[^\n{]*\n*/gi,
    /^(Het resultaat|The result)[^\n{]*\n*/gi,
  ];
  for (const pattern of prefixPatterns) {
    cleaned = cleaned.replace(pattern, '');
  }
  cleaned = cleaned
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .replace(/`/g, '');
  return cleaned.trim();
}

function extractJsonObject(content: string): string | null {
  const match = content.match(/\{[\s\S]*\}/);
  return match ? match[0] : null;
}

function repairAndParse(jsonStr: string): any {
  let repaired = jsonStr;
  repaired = repaired.replace(/,\s*([}\]])/g, '$1');
  repaired = repaired.replace(/[\uFEFF\u200B-\u200D\u2060]/g, '');
  return JSON.parse(repaired);
}

// Default empty result
function getEmptyResult(): ExtractedMeetingData {
  return {
    title: null,
    meeting_date: null,
    meeting_time: null,
    location: null,
    meeting_type: null,
    participants: [],
    agenda_items: [],
    decisions: [],
    action_items: [],
    notes: null,
    summary: null,
    confidence_scores: {
      title: 0, meeting_date: 0, meeting_time: 0, location: 0,
      meeting_type: 0, participants: 0, agenda_items: 0,
      decisions: 0, action_items: 0, overall: 0
    }
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { documentText } = await req.json();
    
    if (!documentText || typeof documentText !== 'string') {
      return new Response(JSON.stringify({ error: 'Document tekst is verplicht' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Limit text length
    const truncatedText = documentText.substring(0, 50000);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY not configured");
      return new Response(JSON.stringify({ 
        data: getEmptyResult(),
        error: 'AI service niet beschikbaar'
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const systemPrompt = `Je bent een expert in het analyseren van vergaderdocumenten voor Nederlandse zorginstellingen.

Extraheer de volgende informatie uit het document en retourneer ALLEEN een JSON object:

{
  "title": "Titel van de vergadering",
  "meeting_date": "YYYY-MM-DD format of null",
  "meeting_time": "HH:MM format of null",
  "location": "Locatie of null",
  "meeting_type": "team|board|project|klant|overig of null",
  "participants": [{"name": "Naam", "role": "Rol/Functie of null", "present": true/false}],
  "agenda_items": [{"item": "Agendapunt tekst", "discussed": true/false}],
  "decisions": [{"decision": "Besluit tekst", "owner": "Verantwoordelijke of null", "deadline": "YYYY-MM-DD of null"}],
  "action_items": [{"action": "Actie tekst", "assignee": "Toegewezen aan of null", "deadline": "YYYY-MM-DD of null"}],
  "notes": "Belangrijke notities als één string of null",
  "summary": "Korte samenvatting in 2-3 zinnen of null",
  "confidence_scores": {
    "title": 0-100,
    "meeting_date": 0-100,
    "meeting_time": 0-100,
    "location": 0-100,
    "meeting_type": 0-100,
    "participants": 0-100,
    "agenda_items": 0-100,
    "decisions": 0-100,
    "action_items": 0-100,
    "overall": 0-100
  }
}

REGELS:
- Retourneer ALLEEN de JSON, geen markdown of uitleg
- Gebruik Nederlandse teksten waar van toepassing
- Bij ontbrekende informatie: null of lege array
- Confidence scores 0-100: hoe zeker je bent dat de extractie correct is
- meeting_type moet exact een van deze waarden zijn: team, board, project, klant, overig`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Analyseer dit vergaderdocument:\n\n${truncatedText}` }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      console.error("AI API error:", response.status);
      return new Response(JSON.stringify({ 
        data: getEmptyResult(),
        error: 'AI analyse mislukt'
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const aiResult = await response.json();
    const content = aiResult.choices?.[0]?.message?.content || '';

    // Parse with robust fallback
    let extractedData: ExtractedMeetingData;
    try {
      const sanitized = sanitizeAIContent(content);
      const jsonStr = extractJsonObject(sanitized);
      if (!jsonStr) throw new Error('No JSON found');
      extractedData = repairAndParse(jsonStr);
    } catch (parseError) {
      console.error("JSON parse error:", parseError);
      return new Response(JSON.stringify({ 
        data: getEmptyResult(),
        error: 'Kon AI resultaat niet verwerken'
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ data: extractedData }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error("Extraction error:", error);
    return new Response(JSON.stringify({ 
      data: getEmptyResult(),
      error: 'Onverwachte fout bij extractie'
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
```

---

### 3B. Hook: `useAIExtractMeeting.ts`

**Bestand**: `src/hooks/notulen/useAIExtractMeeting.ts`

```typescript
import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface ExtractedMeetingData {
  title: string | null;
  meeting_date: string | null;
  meeting_time: string | null;
  location: string | null;
  meeting_type: 'team' | 'board' | 'project' | 'klant' | 'overig' | null;
  participants: Array<{
    name: string;
    role: string | null;
    present: boolean;
  }>;
  agenda_items: Array<{
    item: string;
    discussed: boolean;
  }>;
  decisions: Array<{
    decision: string;
    owner: string | null;
    deadline: string | null;
  }>;
  action_items: Array<{
    action: string;
    assignee: string | null;
    deadline: string | null;
  }>;
  notes: string | null;
  summary: string | null;
  confidence_scores: {
    title: number;
    meeting_date: number;
    meeting_time: number;
    location: number;
    meeting_type: number;
    participants: number;
    agenda_items: number;
    decisions: number;
    action_items: number;
    overall: number;
  };
}

interface UseAIExtractMeetingReturn {
  extractFromText: (text: string) => Promise<ExtractedMeetingData | null>;
  extractFromFile: (file: File) => Promise<ExtractedMeetingData | null>;
  isExtracting: boolean;
  extractedData: ExtractedMeetingData | null;
  clearExtractedData: () => void;
  error: string | null;
}

async function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Kon bestand niet lezen'));
    reader.readAsText(file);
  });
}

export function useAIExtractMeeting(): UseAIExtractMeetingReturn {
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedData, setExtractedData] = useState<ExtractedMeetingData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const extractFromText = useCallback(async (text: string): Promise<ExtractedMeetingData | null> => {
    setIsExtracting(true);
    setError(null);
    
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('ai-extract-meeting-minute', {
        body: { documentText: text }
      });

      if (invokeError) throw invokeError;

      if (data?.error) {
        setError(data.error);
        toast.error(data.error);
        return null;
      }

      setExtractedData(data?.data || null);
      return data?.data || null;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Extractie mislukt';
      setError(message);
      toast.error("Kon document niet analyseren");
      return null;
    } finally {
      setIsExtracting(false);
    }
  }, []);

  const extractFromFile = useCallback(async (file: File): Promise<ExtractedMeetingData | null> => {
    // Only support text-based files for now
    const allowedTypes = ['text/plain', 'text/markdown'];
    const allowedExtensions = ['.txt', '.md'];
    
    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
    const isAllowed = allowedTypes.includes(file.type) || allowedExtensions.includes(ext);
    
    if (!isAllowed) {
      toast.error("Alleen .txt en .md bestanden worden ondersteund voor AI extractie");
      return null;
    }

    try {
      const text = await readFileAsText(file);
      return await extractFromText(text);
    } catch (err) {
      toast.error("Kon bestand niet lezen");
      return null;
    }
  }, [extractFromText]);

  const clearExtractedData = useCallback(() => {
    setExtractedData(null);
    setError(null);
  }, []);

  return {
    extractFromText,
    extractFromFile,
    isExtracting,
    extractedData,
    clearExtractedData,
    error
  };
}
```

---

### 3C. Component: `ExtractedDataPreview.tsx`

**Bestand**: `src/components/notulen/ExtractedDataPreview.tsx`

```typescript
import { ExtractedMeetingData } from "@/hooks/notulen/useAIExtractMeeting";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, X, AlertCircle, Users, ListChecks, Lightbulb, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

interface ExtractedDataPreviewProps {
  data: ExtractedMeetingData;
  onApply: () => void;
  onCancel: () => void;
  isApplying?: boolean;
}

function ConfidenceBadge({ score }: { score: number }) {
  const variant = score >= 80 ? 'success' : score >= 50 ? 'warning' : 'destructive';
  const colors = {
    success: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    warning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    destructive: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
  };
  
  return (
    <Badge className={cn("text-xs font-normal", colors[variant])}>
      {score}%
    </Badge>
  );
}

function FieldRow({ label, value, confidence }: { 
  label: string; 
  value: string | null; 
  confidence: number 
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{value || '—'}</span>
        <ConfidenceBadge score={confidence} />
      </div>
    </div>
  );
}

export function ExtractedDataPreview({ 
  data, 
  onApply, 
  onCancel,
  isApplying 
}: ExtractedDataPreviewProps) {
  const overallConfidence = data.confidence_scores?.overall || 0;
  
  return (
    <Card className="border-primary/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-primary" />
            AI Extractie Resultaat
          </CardTitle>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            Totaal:
            <ConfidenceBadge score={overallConfidence} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Basic Info */}
        <div className="space-y-1">
          <FieldRow 
            label="Titel" 
            value={data.title} 
            confidence={data.confidence_scores?.title || 0} 
          />
          <FieldRow 
            label="Datum" 
            value={data.meeting_date} 
            confidence={data.confidence_scores?.meeting_date || 0} 
          />
          <FieldRow 
            label="Tijd" 
            value={data.meeting_time} 
            confidence={data.confidence_scores?.meeting_time || 0} 
          />
          <FieldRow 
            label="Locatie" 
            value={data.location} 
            confidence={data.confidence_scores?.location || 0} 
          />
          <FieldRow 
            label="Type" 
            value={data.meeting_type} 
            confidence={data.confidence_scores?.meeting_type || 0} 
          />
        </div>

        {/* Participants */}
        {data.participants.length > 0 && (
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Users className="h-3.5 w-3.5" />
              Deelnemers ({data.participants.length})
              <ConfidenceBadge score={data.confidence_scores?.participants || 0} />
            </div>
            <p className="text-xs text-muted-foreground">
              {data.participants.map(p => p.name).join(', ')}
            </p>
          </div>
        )}

        {/* Agenda */}
        {data.agenda_items.length > 0 && (
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-medium">
              <ListChecks className="h-3.5 w-3.5" />
              Agenda ({data.agenda_items.length} items)
              <ConfidenceBadge score={data.confidence_scores?.agenda_items || 0} />
            </div>
          </div>
        )}

        {/* Decisions */}
        {data.decisions.length > 0 && (
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-medium">
              <FileText className="h-3.5 w-3.5" />
              Beslissingen ({data.decisions.length})
              <ConfidenceBadge score={data.confidence_scores?.decisions || 0} />
            </div>
          </div>
        )}

        {/* Summary */}
        {data.summary && (
          <div className="text-xs text-muted-foreground italic border-l-2 pl-2">
            {data.summary}
          </div>
        )}

        {/* Low confidence warning */}
        {overallConfidence < 50 && (
          <div className="flex items-start gap-2 p-2 bg-amber-50 dark:bg-amber-950/20 rounded text-xs">
            <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <span className="text-amber-700 dark:text-amber-400">
              Lage betrouwbaarheid. Controleer de geëxtraheerde gegevens zorgvuldig.
            </span>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={onCancel}
            disabled={isApplying}
          >
            <X className="h-3.5 w-3.5 mr-1" />
            Negeren
          </Button>
          <Button 
            size="sm" 
            onClick={onApply}
            disabled={isApplying}
          >
            <Check className="h-3.5 w-3.5 mr-1" />
            Toepassen
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

---

### 3D. Integratie in CreateMeetingMinuteDialog

Voeg "Importeer van bestand" knop toe bovenaan het formulier:

```tsx
// Nieuwe imports
import { Upload, Sparkles, Loader2 } from "lucide-react";
import { useAIExtractMeeting } from "@/hooks/notulen/useAIExtractMeeting";
import { ExtractedDataPreview } from "./ExtractedDataPreview";

// In component
const fileInputRef = useRef<HTMLInputElement>(null);
const { extractFromFile, isExtracting, extractedData, clearExtractedData } = useAIExtractMeeting();

const handleImportClick = () => {
  fileInputRef.current?.click();
};

const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (file) {
    await extractFromFile(file);
  }
  e.target.value = '';
};

const applyExtractedData = () => {
  if (!extractedData) return;
  
  if (extractedData.title) form.setValue('title', extractedData.title);
  if (extractedData.meeting_type) form.setValue('meeting_type', extractedData.meeting_type);
  if (extractedData.meeting_date) {
    form.setValue('start_at', new Date(extractedData.meeting_date));
  }
  if (extractedData.meeting_time) {
    form.setValue('start_time', extractedData.meeting_time);
  }
  if (extractedData.location) form.setValue('location', extractedData.location);
  
  clearExtractedData();
  toast.success("Gegevens toegepast");
};

// In JSX, na DialogDescription:
{/* AI Import section */}
<div className="flex items-center gap-2 py-2">
  <input
    ref={fileInputRef}
    type="file"
    accept=".txt,.md"
    onChange={handleImportFile}
    className="hidden"
  />
  <Button
    type="button"
    variant="outline"
    size="sm"
    onClick={handleImportClick}
    disabled={isCreating || isExtracting}
  >
    {isExtracting ? (
      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
    ) : (
      <Sparkles className="h-4 w-4 mr-2" />
    )}
    {isExtracting ? "Analyseren..." : "Importeer van bestand"}
  </Button>
  <span className="text-xs text-muted-foreground">
    (.txt, .md)
  </span>
</div>

{/* Show extracted data preview */}
{extractedData && (
  <ExtractedDataPreview
    data={extractedData}
    onApply={applyExtractedData}
    onCancel={clearExtractedData}
  />
)}
```

---

## 6. DEEL 4: Enterprise Notule Structuur

### Component: `MeetingMinuteStructuredView.tsx`

**Bestand**: `src/components/notulen/MeetingMinuteStructuredView.tsx`

Dit is een read-only weergave component voor goedgekeurde/gearchiveerde notulen met professionele layout:

```typescript
// Secties:
// 1. Header Card met type badge, titel, datum/tijd/locatie grid
// 2. Deelnemers sectie met aanwezigheid indicators
// 3. Agenda sectie met checkmarks voor besproken items
// 4. Beslissingen sectie (amber achtergrond) met eigenaar/deadline
// 5. Notities sectie
// 6. Footer met "Bewerken" hint
```

**Implementatie**: ~150 regels, hergebruikt bestaande Badge, Card, Separator componenten.

**Integratie**: Kan gebruikt worden in MeetingMinuteDetail als alternatieve view voor approved/archived status, of als standalone print-preview component.

---

## 7. Implementatie Volgorde

| Stap | Bestand | Prioriteit | Regels |
|------|---------|------------|--------|
| 1 | Update `CreateMeetingMinuteDialog.tsx` (upload) | HIGH | ~60 |
| 2 | Update `AttachmentList.tsx` (view hint) | HIGH | ~20 |
| 3 | Create `ai-extract-meeting-minute/index.ts` | HIGH | ~180 |
| 4 | Update `supabase/config.toml` | HIGH | ~3 |
| 5 | Create `useAIExtractMeeting.ts` | HIGH | ~90 |
| 6 | Create `ExtractedDataPreview.tsx` | MEDIUM | ~140 |
| 7 | Update `CreateMeetingMinuteDialog.tsx` (AI import) | MEDIUM | ~50 |
| 8 | Create `MeetingMinuteStructuredView.tsx` | LOW | ~150 |

**Totaal: ~690 regels nieuwe/gewijzigde code**

---

## 8. Technische Details

### Gemini Configuratie
- Model: `google/gemini-2.5-flash` (consistent met ai-task-scorer)
- Temperature: 0.1 (deterministische output)
- Response format: `json_object` (structured output)
- Max input: 50.000 karakters

### Hergebruikte Patronen
- JSON sanitization van `ai-task-scorer` (sanitizeAIContent, extractJsonObject, repairAndParse)
- Upload validation van `useUploadAttachment` (ALLOWED_MIME_TYPES, MAX_FILE_SIZE)
- File helpers van `src/lib/fileHelpers.ts` (formatFileSize, getFileCategory)

### Error Handling
- Graceful degradation: bij AI fout, return empty result + error message
- Toast notificaties in Nederlands
- Rate limit handling (429) en payment errors (402)

---

## 9. Acceptatie Criteria

### Deel 1 - Upload Fix
- [ ] CreateMeetingMinuteDialog toont bestandsselectie
- [ ] Pending files worden getoond met preview en remove knop
- [ ] Files worden geüpload NA succesvolle notulen aanmaak
- [ ] Error handling bij upload failures

### Deel 2 - View Mode Hint
- [ ] Lege bijlagen sectie toont hint in view mode
- [ ] Hint verwijst naar "Bewerken" knop
- [ ] In edit mode blijft simpele tekst

### Deel 3 - AI Extractie
- [ ] Edge function `ai-extract-meeting-minute` deployed
- [ ] "Importeer van bestand" knop in create dialog
- [ ] Loading state tijdens AI analyse
- [ ] ExtractedDataPreview toont confidence scores
- [ ] "Toepassen" vult form in met extracted data
- [ ] "Negeren" sluit preview

### Deel 4 - Enterprise View
- [ ] Professionele layout met alle secties
- [ ] Deelnemers met aanwezigheid indicator
- [ ] Beslissingen prominent getoond
- [ ] Nederlandse UI teksten

---

## 10. Wat NIET wordt gebouwd

| Item | Reden |
|------|-------|
| PDF/Word parsing | Vereist externe libraries (pdf-parse, mammoth) |
| OCR voor afbeeldingen | Vereist Vision API |
| Real-time collaboration | Te complex voor deze fase |
| Email notificaties | Externe provider nodig |
