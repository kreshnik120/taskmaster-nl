import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Interface definitions
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
  method: 'pdf-parse' | 'mammoth' | 'direct' | 'unsupported' | 'failed';
}

// Text extraction from binary files using dynamic imports
async function extractTextFromFile(
  base64Content: string,
  mimeType: string
): Promise<TextExtractionResult> {
  try {
    // Decode base64 to Uint8Array
    const binaryString = atob(base64Content);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // PDF Extractie
    if (mimeType === 'application/pdf') {
      try {
        // Dynamic import for pdf-parse
        const pdfParse = (await import("https://esm.sh/pdf-parse@1.1.1")).default;
        const pdfData = await pdfParse(bytes);
        console.log(`📄 PDF parsed: ${pdfData.numpages} pages, ${pdfData.text.length} chars`);
        return { text: pdfData.text, method: 'pdf-parse' };
      } catch (pdfError) {
        console.error('PDF parse error:', pdfError);
        return { text: '', method: 'failed' };
      }
    }

    // Word Extractie (.docx, .doc)
    if (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mimeType === 'application/msword'
    ) {
      try {
        // Dynamic import for mammoth
        const mammoth = (await import("https://esm.sh/mammoth@1.6.0")).default;
        const result = await mammoth.extractRawText({ buffer: bytes });
        console.log(`📝 Word parsed: ${result.value.length} chars`);
        return { text: result.value, method: 'mammoth' };
      } catch (wordError) {
        console.error('Word parse error:', wordError);
        return { text: '', method: 'failed' };
      }
    }

    // Plain text / Markdown - decode als UTF-8
    if (mimeType === 'text/plain' || mimeType === 'text/markdown') {
      const decoder = new TextDecoder('utf-8');
      return { text: decoder.decode(bytes), method: 'direct' };
    }

    return { text: '', method: 'unsupported' };
  } catch (error) {
    console.error('Text extraction error:', error);
    return { text: '', method: 'failed' };
  }
}

// Sanitization functions (pattern from ai-task-scorer)
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { documentText, fileContent, mimeType } = body;

    let textToAnalyze = documentText;
    let extractionMethod = 'direct';

    // Als fileContent aanwezig is, extraheer tekst uit bestand
    if (fileContent && mimeType) {
      console.log(`📁 Processing file with MIME type: ${mimeType}`);
      const extraction = await extractTextFromFile(fileContent, mimeType);
      
      if (!extraction.text || extraction.method === 'failed' || extraction.method === 'unsupported') {
        return new Response(JSON.stringify({ 
          data: getEmptyResult(),
          error: extraction.method === 'unsupported' 
            ? 'Bestandstype niet ondersteund' 
            : 'Kon bestand niet lezen'
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      textToAnalyze = extraction.text;
      extractionMethod = extraction.method;
    }
    
    if (!textToAnalyze || typeof textToAnalyze !== 'string') {
      return new Response(JSON.stringify({ error: 'Document tekst is verplicht' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Limit text length
    const truncatedText = textToAnalyze.substring(0, 50000);
    console.log(`📄 [ai-extract-meeting-minute] Processing ${truncatedText.length} characters via ${extractionMethod}`);

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
      extraction_method: extractionMethod
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
