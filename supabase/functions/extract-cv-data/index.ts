import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { pdfBase64, filename } = await req.json();

    if (!pdfBase64) {
      return new Response(
        JSON.stringify({ error: "Missing pdfBase64" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

    if (!lovableApiKey) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // AI Analysis with Gemini 2.5 Flash Vision (direct PDF analysis)
    console.log(`Analyzing CV with AI Vision: ${filename || 'document.pdf'}`);
    
    const aiPrompt = `Analyseer dit CV/PDF document en extract de volgende informatie in JSON formaat:

Geef terug in dit EXACTE JSON formaat (geen extra tekst):
{
  "naam": "Voor- en achternaam",
  "telefoon": "06-12345678 of null",
  "email": "email@example.com of null",
  "functie_niveau": "VIG, HBO-V, Verpleegkundige (MBO), Helpende, Begeleider, Persoonlijk begeleider, of GGZ-agoog",
  "werkvorm": "ZZP, Uitzendkracht, of ABCito constructie",
  "ervaring_sector": ["VVT", "GGZ", "GHZ", "Jeugdzorg", "Ziekenhuis/Klinisch", "Thuiszorg"],
  "doelgroep_ervaring": ["Ouderen", "LVB", "Psychiatrie", "Somatiek", "Kinderen/Jeugd", "Verslaving"],
  "regio": "Utrecht, Amsterdam, etc of null",
  "beschikbaarheid": "<24 uur/week, 24-32 uur/week, 32-40 uur/week, of Flexibel",
  "eigen_vervoer": true/false,
  "opmerkingen": "Extra informatie of null",
  "confidence": 0.8
}

**KRITIEK - functie_niveau moet EXACT een van deze waarden zijn:**
- "VIG" (voor Verzorgende IG)
- "HBO-V" (voor HBO Verpleegkundige)
- "Verpleegkundige (MBO)"
- "Helpende"
- "Begeleider"
- "Persoonlijk begeleider"
- "GGZ-agoog"

**KRITIEK - werkvorm moet EXACT een van deze waarden zijn:**
- "ZZP" (zoek naar: "ZZP", "zzp", "zelfstandige zonder personeel", "freelance", "eigen bedrijf")
- "Uitzendkracht" (zoek naar: "uitzendkracht", "tijdelijk contract", "via uitzendbureau", "flex")
- "ABCito constructie" (zoek naar: "ABCito", "abcito", "payroll constructie")

**EXTRA ZOEKTERMEN voor betere extractie:**
- **werkvorm**: Let op woorden als "ZZP", "freelance", "uitzendwerk", "flex", "eigen onderneming", "payroll", "ABCito"
- **beschikbaarheid**: Zoek naar "beschikbaar", "beschikbaarheid", "uur per week", "uren", "parttime", "fulltime", "voltijd", "24 uur", "32 uur", "40 uur", "flexibel"
- **eigen_vervoer**: Zoek naar "rijbewijs", "auto", "eigen vervoer", "eigen auto", "mobiel", "kan reizen", "beschikt over auto"
- **regio**: Let op woonplaats, werkgebied, voorkeur regio, beschikbaar in, werkt in

Belangrijk:
- functie_niveau: gebruik EXACT een van de 7 waarden hierboven
- werkvorm: gebruik EXACT een van de 3 waarden hierboven, zoek actief naar synoniemen
- ervaring_sector: array met 0 of meer waarden uit de lijst
- doelgroep_ervaring: array met 0 of meer waarden uit de lijst
- beschikbaarheid: gebruik een van de 4 waarden, zoek actief naar uurvermelding
- eigen_vervoer: boolean, zoek actief naar vervoer/rijbewijs vermeldingen
- regio: zoek actief naar woonplaats/werkgebied vermeldingen
- Als info ontbreekt, gebruik null (niet "null" als string)
- Wees proactief: zoek actief naar synoniemen en indirecte vermeldingen`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${lovableApiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              { 
                type: "text", 
                text: "Je bent een HR assistent die CV's analyseert voor zorgverleners. Geef altijd pure JSON terug zonder markdown code blocks.\n\n" + aiPrompt
              },
              {
                type: "document",
                document: {
                  data: pdfBase64,
                  mime_type: "application/pdf"
                }
              }
            ]
          }
        ],
        temperature: 0.3,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI API error:", errorText);
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiResult = await aiResponse.json();
    let extractedData;
    
    try {
      const aiContent = aiResult.choices[0].message.content;
      console.log("AI raw response:", aiContent);
      
      // Remove markdown code blocks if present
      const cleanContent = aiContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      extractedData = JSON.parse(cleanContent);
      console.log("Extracted data:", extractedData);
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError);
      // Fallback with minimal data
      extractedData = {
        naam: null,
        telefoon: null,
        email: null,
        functie_niveau: null,
        werkvorm: null,
        ervaring_sector: [],
        doelgroep_ervaring: [],
        regio: null,
        beschikbaarheid: null,
        eigen_vervoer: false,
        opmerkingen: null,
        confidence: 0.3,
      };
    }

    // Normalize functie_niveau variations
    if (extractedData.functie_niveau) {
      const functieNiveauMapping: Record<string, string> = {
        "verzorgende ig": "VIG",
        "verzorgende IG": "VIG",
        "vig": "VIG",
        "hbo verpleegkundige": "HBO-V",
        "hbo-v": "HBO-V",
        "hbov": "HBO-V",
        "verpleegkundige mbo": "Verpleegkundige (MBO)",
        "verpleegkundige": "Verpleegkundige (MBO)",
        "helpende": "Helpende",
        "helpende 2": "Helpende",
        "begeleider": "Begeleider",
        "persoonlijk begeleider": "Persoonlijk begeleider",
        "ggz-agoog": "GGZ-agoog",
        "ggz agoog": "GGZ-agoog",
      };

      const normalized = extractedData.functie_niveau.toLowerCase().trim();
      if (functieNiveauMapping[normalized]) {
        console.log(`Mapped functie_niveau: "${extractedData.functie_niveau}" → "${functieNiveauMapping[normalized]}"`);
        extractedData.functie_niveau = functieNiveauMapping[normalized];
      }
    }

    // Normalize werkvorm
    if (extractedData.werkvorm) {
      const werkvormMapping: Record<string, string> = {
        "zzp": "ZZP",
        "uitzendkracht": "Uitzendkracht",
        "uitzend": "Uitzendkracht",
        "abcito": "ABCito constructie",
        "abcito constructie": "ABCito constructie",
      };

      const normalized = extractedData.werkvorm.toLowerCase().trim();
      if (werkvormMapping[normalized]) {
        console.log(`Mapped werkvorm: "${extractedData.werkvorm}" → "${werkvormMapping[normalized]}"`);
        extractedData.werkvorm = werkvormMapping[normalized];
      }
    }

    console.log("CV extraction complete");

    return new Response(
      JSON.stringify({
        success: true,
        data: extractedData,
        cvText: `CV analyzed via AI Vision (${filename || 'document.pdf'})`, // Vision analysis confirmation
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error("Error in extract-cv-data:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
