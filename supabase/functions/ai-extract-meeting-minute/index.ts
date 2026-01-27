import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Interface definitions - Fase 7C: Extended with classification fields
interface ExtractedMeetingData {
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
    // Fase 7C: Classificatie velden
    classification?: 'TAAK' | 'IDEE' | 'INFORMATIE';
    urgency?: 'critical' | 'high' | 'medium' | 'low';
    source_quote?: string;
    confidence?: number;
    // Fase 7D: Enterprise context velden
    onderwerp?: string;
    doelgroep?: string;
    actie_type?: 'Communicatie' | 'Administratie' | 'Planning' | 'Onderzoek' | 'Beslissing' | 'Overig';
    achtergrond?: string;
    betrokkenen?: Array<{
      naam: string;
      rol?: string;
      relatie: 'assignee' | 'uitleg_ontvanger' | 'stakeholder';
    }>;
    externe_partij?: {
      naam: string;
      type: 'klant' | 'zzper' | 'locatie' | 'leverancier';
    };
    actieplan?: string[];
    suggestie?: string;
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

interface TextExtractionResult {
  text: string;
  method: 'mammoth' | 'direct' | 'unsupported' | 'failed';
  error?: string;
}

// Library caching for Word documents (mammoth works in Deno)
let mammothLib: any = null;

async function loadMammothLibrary() {
  if (!mammothLib) {
    try {
      mammothLib = (await import("https://esm.sh/mammoth@1.6.0")).default;
    } catch (error) {
      console.error('Failed to load mammoth library:', error);
      throw new Error('Word library kon niet geladen worden');
    }
  }
  return mammothLib;
}

// Text extraction from binary files (Word and Text only - PDF uses Gemini multimodal)
async function extractTextFromFile(
  base64Content: string,
  mimeType: string
): Promise<TextExtractionResult> {
  console.log(`📁 extractTextFromFile called with mimeType: ${mimeType}, content length: ${base64Content.length}`);
  
  try {
    // Decode base64 to Uint8Array
    const binaryString = atob(base64Content);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    console.log(`📁 Decoded ${bytes.length} bytes from base64`);

    // Word Extractie (.docx, .doc)
    if (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mimeType === 'application/msword'
    ) {
      try {
        const mammoth = await loadMammothLibrary();
        const result = await mammoth.extractRawText({ buffer: bytes });
        
        if (!result.value || result.value.trim().length === 0) {
          console.warn('📝 Word parsed but contains no text');
          return { 
            text: '', 
            method: 'mammoth',
            error: 'Word document bevat geen leesbare tekst. Kopieer de inhoud naar een .txt bestand.'
          };
        }
        
        console.log(`📝 Word parsed: ${result.value.length} chars`);
        return { text: result.value, method: 'mammoth' };
      } catch (wordError) {
        console.error('Word parse error:', wordError);
        const errorMessage = wordError instanceof Error ? wordError.message : 'Onbekende Word fout';
        return { 
          text: '', 
          method: 'failed',
          error: `Kon Word document niet lezen: ${errorMessage}. Probeer .docx in plaats van .doc, of kopieer naar .txt.`
        };
      }
    }

    // Plain text / Markdown - decode als UTF-8
    if (mimeType === 'text/plain' || mimeType === 'text/markdown') {
      try {
        const decoder = new TextDecoder('utf-8');
        const text = decoder.decode(bytes);
        console.log(`📝 Text decoded: ${text.length} chars`);
        return { text, method: 'direct' };
      } catch (decodeError) {
        return { 
          text: '', 
          method: 'failed',
          error: 'Kon tekstbestand niet decoderen. Controleer de encoding (UTF-8 vereist).'
        };
      }
    }

    return { 
      text: '', 
      method: 'unsupported',
      error: `Bestandstype "${mimeType}" wordt niet ondersteund. Gebruik PDF, Word (.docx), of tekst (.txt, .md).`
    };
  } catch (error) {
    console.error('Text extraction error:', error);
    return { 
      text: '', 
      method: 'failed',
      error: error instanceof Error ? error.message : 'Onverwachte fout bij bestandsverwerking'
    };
  }
}

// Sanitization functions
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

function repairAndParse(jsonStr: string): ExtractedMeetingData {
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

// Gemini multimodal PDF analysis - sends PDF directly to Gemini
async function analyzeWithGeminiMultimodal(
  base64Content: string,
  apiKey: string
): Promise<{ data: ExtractedMeetingData | null; error?: string }> {
  console.log('📄 [Gemini Multimodal] Analyzing PDF directly...');
  
  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "file",
                file: {
                  filename: "document.pdf",
                  file_data: `data:application/pdf;base64,${base64Content}`
                }
              },
              {
                type: "text",
                text: `Je bent een expert in het analyseren van vergaderdocumenten voor Nederlandse zorginstellingen.

Analyseer dit PDF document en extraheer de volgende informatie. Retourneer ALLEEN een valide JSON object:

{
  "title": "Titel van de vergadering of document",
  "meeting_date": "YYYY-MM-DD format of null",
  "meeting_time": "HH:MM format of null",
  "location": "Locatie of null",
  "meeting_type": "team|board|project|klant|overig of null",
  "participants": [{"name": "Voornaam + Achternaam", "role": "Functie/Rol of null", "present": true}],
  "agenda_items": [{"item": "Agendapunt of besproken onderwerp", "discussed": true}],
  "decisions": [{"decision": "Besluit, afspraak of actiepunt", "owner": "Verantwoordelijke persoon of null", "deadline": "YYYY-MM-DD of null"}],
  "action_items": [{
    "action": "Specifieke actie",
    "assignee": "Toegewezen aan of null",
    "deadline": "YYYY-MM-DD of null",
    "classification": "TAAK|IDEE|INFORMATIE",
    "urgency": "critical|high|medium|low",
    "source_quote": "Exacte quote uit het document",
    "confidence": 0.0-1.0
  }],
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

BELANGRIJKE INSTRUCTIES:
1. PARTICIPANTS: Extraheer ALLE personen die in het document worden genoemd:
   - Kijk naar "Aanwezigen:", "Deelnemers:", "Afwezig:", namen in handtekeningen
   - Namen die acties krijgen toegewezen zijn ook participants
   - Gebruik volledige namen waar mogelijk (voornaam + achternaam)
   - Markeer als present: true tenzij expliciet vermeld als afwezig

2. DECISIONS: Dit zijn NIET alleen formele besluiten. Neem ook op:
   - Actiepunten en to-do items
   - Afspraken die zijn gemaakt ("afgesproken wordt dat...")
   - Vervolgacties met verantwoordelijke
   - Alles waar een naam + actie bij staat
   - Besluiten die impliciet zijn ("we gaan...")

3. ACTION_ITEMS CLASSIFICATIE (KRITIEK - voor elke action_item):
   - "TAAK": Concrete actie met actiewerkwoord EN (eigenaar OF deadline)
     Voorbeelden: "Jan maakt rapport", "Review voor vrijdag", "Team evalueert voorstel"
   - "IDEE": Suggestie zonder concrete toewijzing
     Indicatoren: "zou kunnen", "misschien", "overwegen", "mogelijkheid"
     Voorbeelden: "We zouden kunnen kijken naar...", "Misschien is het een idee om..."
   - "INFORMATIE": Feitelijke mededeling, status update, geen actie vereist
     Voorbeelden: "Budget is goedgekeurd", "Project loopt op schema"

4. URGENTIE voor action_items:
   - "critical": Expliciete urgentie OF deadline < 24 uur OF blocker
   - "high": Deadline < 3 dagen OF "zo snel mogelijk"
   - "medium": Deadline < 1 week OF normale prioriteit
   - "low": Geen deadline, nice-to-have

5. VERPLICHT voor elke action_item:
   - source_quote: EXACTE tekst uit het document (kopieer letterlijk - hallucinatie preventie)
   - confidence: 0.0-1.0 (hoe zeker je bent van de classificatie)

6. REGELS:
   - Retourneer ALLEEN de JSON, geen markdown of uitleg
   - Gebruik Nederlandse teksten waar van toepassing
   - Bij ontbrekende informatie: null of lege array
   - Confidence scores 0-100: hoe zeker je bent
   - meeting_type moet exact een van deze waarden zijn: team, board, project, klant, overig`
              }
            ]
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini multimodal error:", response.status, errorText);
      
      if (response.status === 429) {
        return { data: null, error: 'AI service is tijdelijk overbelast. Probeer het later opnieuw.' };
      }
      if (response.status === 402) {
        return { data: null, error: 'AI credits zijn op. Neem contact op met de beheerder.' };
      }
      
      return { data: null, error: 'Kon PDF niet analyseren. Probeer een ander bestand of kopieer de tekst naar .txt.' };
    }

    const aiResult = await response.json();
    const content = aiResult.choices?.[0]?.message?.content || '';
    console.log('✅ [Gemini Multimodal] Response received');

    // Parse with robust fallback
    const sanitized = sanitizeAIContent(content);
    const jsonStr = extractJsonObject(sanitized);
    if (!jsonStr) {
      console.error('[Gemini Multimodal] No JSON found in response');
      return { data: null, error: 'Kon PDF analyse resultaat niet verwerken' };
    }
    
    const extractedData = repairAndParse(jsonStr);
    
    // Normalize result with Fase 7C fields
    const normalizedData: ExtractedMeetingData = {
      title: extractedData.title || null,
      meeting_date: extractedData.meeting_date || null,
      meeting_time: extractedData.meeting_time || null,
      location: extractedData.location || null,
      meeting_type: extractedData.meeting_type || null,
      participants: Array.isArray(extractedData.participants) ? extractedData.participants : [],
      agenda_items: Array.isArray(extractedData.agenda_items) ? extractedData.agenda_items : [],
      decisions: Array.isArray(extractedData.decisions) ? extractedData.decisions : [],
      action_items: Array.isArray(extractedData.action_items) 
        ? extractedData.action_items.map((item: any) => ({
            action: item.action || '',
            assignee: item.assignee || null,
            deadline: item.deadline || null,
            classification: item.classification || null,
            urgency: item.urgency || null,
            source_quote: item.source_quote || null,
            confidence: typeof item.confidence === 'number' ? item.confidence : null,
          }))
        : [],
      notes: extractedData.notes || null,
      summary: extractedData.summary || null,
      confidence_scores: {
        title: extractedData.confidence_scores?.title || 0,
        meeting_date: extractedData.confidence_scores?.meeting_date || 0,
        meeting_time: extractedData.confidence_scores?.meeting_time || 0,
        location: extractedData.confidence_scores?.location || 0,
        meeting_type: extractedData.confidence_scores?.meeting_type || 0,
        participants: extractedData.confidence_scores?.participants || 0,
        agenda_items: extractedData.confidence_scores?.agenda_items || 0,
        decisions: extractedData.confidence_scores?.decisions || 0,
        action_items: extractedData.confidence_scores?.action_items || 0,
        overall: extractedData.confidence_scores?.overall || 0
      }
    };

    console.log(`✅ [Gemini Multimodal] Extracted: title="${normalizedData.title}", confidence=${normalizedData.confidence_scores.overall}%`);
    return { data: normalizedData };
    
  } catch (error) {
    console.error("Gemini multimodal error:", error);
    return { 
      data: null, 
      error: error instanceof Error ? error.message : 'Onverwachte fout bij PDF analyse' 
    };
  }
}

// System prompt for text-based analysis - Fase 7C: Updated with classification
const systemPrompt = `Je bent een expert in het analyseren van vergaderdocumenten voor Nederlandse zorginstellingen.

Extraheer de volgende informatie uit het document en retourneer ALLEEN een JSON object:

{
  "title": "Titel van de vergadering of document",
  "meeting_date": "YYYY-MM-DD format of null",
  "meeting_time": "HH:MM format of null",
  "location": "Locatie of null",
  "meeting_type": "team|board|project|klant|overig of null",
  "participants": [{"name": "Voornaam + Achternaam", "role": "Functie/Rol of null", "present": true}],
  "agenda_items": [{"item": "Agendapunt of besproken onderwerp", "discussed": true}],
  "decisions": [{"decision": "Besluit, afspraak of actiepunt", "owner": "Verantwoordelijke persoon of null", "deadline": "YYYY-MM-DD of null"}],
  "action_items": [{
    "action": "Specifieke actie",
    "assignee": "Toegewezen aan of null",
    "deadline": "YYYY-MM-DD of null",
    "classification": "TAAK|IDEE|INFORMATIE",
    "urgency": "critical|high|medium|low",
    "source_quote": "Exacte quote uit het document",
    "confidence": 0.0-1.0
  }],
  "notes": "Belangrijke notities als één string of null",
  "summary": "Korte samenvatting in 2-3 zinnen of null",
  "confidence_scores": {...}
}

CLASSIFICATIE REGELS voor action_items:
- TAAK: Concrete actie met actiewerkwoord + (eigenaar OF deadline)
- IDEE: Suggestie met "zou kunnen", "misschien", "overwegen"
- INFORMATIE: Feitelijke mededeling, status update

URGENTIE:
- critical: < 24 uur of blocker
- high: < 3 dagen
- medium: < 1 week
- low: geen deadline

VERPLICHT: source_quote = exacte tekst uit document, confidence = 0.0-1.0

REGELS:
- Retourneer ALLEEN de JSON, geen markdown
- Bij ontbrekende informatie: null of lege array
- meeting_type: team, board, project, klant, of overig`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { documentText, fileContent, mimeType } = body;

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

    // Als fileContent aanwezig is, check eerst voor PDF multimodal
    if (fileContent && mimeType) {
      console.log(`📁 Processing file with MIME type: ${mimeType}`);
      
      // PDF: gebruik Gemini multimodal (SKIP text extraction)
      if (mimeType === 'application/pdf') {
        console.log('📄 Using Gemini multimodal for PDF analysis');
        
        const multimodalResult = await analyzeWithGeminiMultimodal(fileContent, LOVABLE_API_KEY);
        
        if (multimodalResult.error || !multimodalResult.data) {
          return new Response(JSON.stringify({ 
            data: getEmptyResult(),
            error: multimodalResult.error || 'PDF analyse mislukt',
            extraction_method: 'gemini-multimodal'
          }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        return new Response(JSON.stringify({ 
          data: multimodalResult.data,
          extraction_method: 'gemini-multimodal'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      // Word/Text: bestaande text extraction flow
      const extraction = await extractTextFromFile(fileContent, mimeType);
      
      if (extraction.error) {
        console.error(`❌ Extraction failed: ${extraction.error}`);
        return new Response(JSON.stringify({ 
          data: getEmptyResult(),
          error: extraction.error,
          extraction_method: extraction.method
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (!extraction.text || extraction.text.trim().length === 0) {
        return new Response(JSON.stringify({ 
          data: getEmptyResult(),
          error: 'Geen leesbare tekst gevonden in bestand',
          extraction_method: extraction.method
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Use extracted text for AI analysis
      const truncatedText = extraction.text.substring(0, 50000);
      console.log(`📄 [ai-extract-meeting-minute] Processing ${truncatedText.length} characters via ${extraction.method}`);

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
        const errorText = await response.text();
        console.error("AI API error:", response.status, errorText);
        
        if (response.status === 429) {
          return new Response(JSON.stringify({ 
            data: getEmptyResult(),
            error: 'AI service is tijdelijk overbelast. Probeer het later opnieuw.'
          }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        if (response.status === 402) {
          return new Response(JSON.stringify({ 
            data: getEmptyResult(),
            error: 'AI credits zijn op. Neem contact op met de beheerder.'
          }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
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
      console.log(`✅ [ai-extract-meeting-minute] AI response received`);

      // Parse with robust fallback
      let extractedData: ExtractedMeetingData;
      try {
        const sanitized = sanitizeAIContent(content);
        const jsonStr = extractJsonObject(sanitized);
        if (!jsonStr) throw new Error('No JSON found');
        extractedData = repairAndParse(jsonStr);
        
        // Validate and ensure all required fields exist
        extractedData = {
          title: extractedData.title || null,
          meeting_date: extractedData.meeting_date || null,
          meeting_time: extractedData.meeting_time || null,
          location: extractedData.location || null,
          meeting_type: extractedData.meeting_type || null,
          participants: Array.isArray(extractedData.participants) ? extractedData.participants : [],
          agenda_items: Array.isArray(extractedData.agenda_items) ? extractedData.agenda_items : [],
          decisions: Array.isArray(extractedData.decisions) ? extractedData.decisions : [],
          action_items: Array.isArray(extractedData.action_items) ? extractedData.action_items : [],
          notes: extractedData.notes || null,
          summary: extractedData.summary || null,
          confidence_scores: {
            title: extractedData.confidence_scores?.title || 0,
            meeting_date: extractedData.confidence_scores?.meeting_date || 0,
            meeting_time: extractedData.confidence_scores?.meeting_time || 0,
            location: extractedData.confidence_scores?.location || 0,
            meeting_type: extractedData.confidence_scores?.meeting_type || 0,
            participants: extractedData.confidence_scores?.participants || 0,
            agenda_items: extractedData.confidence_scores?.agenda_items || 0,
            decisions: extractedData.confidence_scores?.decisions || 0,
            action_items: extractedData.confidence_scores?.action_items || 0,
            overall: extractedData.confidence_scores?.overall || 0
          }
        };
        
        console.log(`✅ [ai-extract-meeting-minute] Extracted: title="${extractedData.title}", confidence=${extractedData.confidence_scores.overall}%`);
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

      return new Response(JSON.stringify({ 
        data: extractedData,
        extraction_method: extraction.method
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Direct text analysis (no file)
    let textToAnalyze = documentText;
    
    if (!textToAnalyze || typeof textToAnalyze !== 'string') {
      return new Response(JSON.stringify({ error: 'Document tekst is verplicht' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Limit text length
    const truncatedText = textToAnalyze.substring(0, 50000);
    console.log(`📄 [ai-extract-meeting-minute] Processing ${truncatedText.length} characters via direct text`);

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
      const errorText = await response.text();
      console.error("AI API error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ 
          data: getEmptyResult(),
          error: 'AI service is tijdelijk overbelast. Probeer het later opnieuw.'
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      if (response.status === 402) {
        return new Response(JSON.stringify({ 
          data: getEmptyResult(),
          error: 'AI credits zijn op. Neem contact op met de beheerder.'
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
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
    console.log(`✅ [ai-extract-meeting-minute] AI response received`);

    // Parse with robust fallback
    let extractedData: ExtractedMeetingData;
    try {
      const sanitized = sanitizeAIContent(content);
      const jsonStr = extractJsonObject(sanitized);
      if (!jsonStr) throw new Error('No JSON found');
      extractedData = repairAndParse(jsonStr);
      
      // Validate and ensure all required fields exist
      extractedData = {
        title: extractedData.title || null,
        meeting_date: extractedData.meeting_date || null,
        meeting_time: extractedData.meeting_time || null,
        location: extractedData.location || null,
        meeting_type: extractedData.meeting_type || null,
        participants: Array.isArray(extractedData.participants) ? extractedData.participants : [],
        agenda_items: Array.isArray(extractedData.agenda_items) ? extractedData.agenda_items : [],
        decisions: Array.isArray(extractedData.decisions) ? extractedData.decisions : [],
        action_items: Array.isArray(extractedData.action_items) ? extractedData.action_items : [],
        notes: extractedData.notes || null,
        summary: extractedData.summary || null,
        confidence_scores: {
          title: extractedData.confidence_scores?.title || 0,
          meeting_date: extractedData.confidence_scores?.meeting_date || 0,
          meeting_time: extractedData.confidence_scores?.meeting_time || 0,
          location: extractedData.confidence_scores?.location || 0,
          meeting_type: extractedData.confidence_scores?.meeting_type || 0,
          participants: extractedData.confidence_scores?.participants || 0,
          agenda_items: extractedData.confidence_scores?.agenda_items || 0,
          decisions: extractedData.confidence_scores?.decisions || 0,
          action_items: extractedData.confidence_scores?.action_items || 0,
          overall: extractedData.confidence_scores?.overall || 0
        }
      };
      
      console.log(`✅ [ai-extract-meeting-minute] Extracted: title="${extractedData.title}", confidence=${extractedData.confidence_scores.overall}%`);
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

    return new Response(JSON.stringify({ 
      data: extractedData,
      extraction_method: 'direct'
    }), {
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
