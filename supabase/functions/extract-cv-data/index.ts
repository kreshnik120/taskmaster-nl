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
    console.log(`PDF base64 length: ${pdfBase64.length}`);
    console.log(`PDF base64 start: ${pdfBase64.substring(0, 50)}...`);
    
    const aiPrompt = `Analyseer dit CV/PDF document en extract ALLE relevante informatie voor healthcare recruitment.

**NIEUW FORMAT - Per-veld confidence scores**
Elk veld heeft nu een "value" en "confidence" property. Geef terug in dit EXACTE JSON formaat:

{
  // === BASIS CONTACTGEGEVENS ===
  "naam": { "value": "Voor- en achternaam", "confidence": 0.95 },
  "telefoon": { "value": "06-12345678", "confidence": 0.9 },
  "email": { "value": "email@example.com", "confidence": 0.95 },
  "postcode": { "value": "1234 AB", "confidence": 0.8 },
  "woonplaats": { "value": "Plaatsnaam", "confidence": 0.85 },
  "geboortedatum": { "value": "YYYY-MM-DD", "confidence": 0.7 },
  
  // === PROFESSIONELE INFO ===
  "functie_niveau": { "value": "VIG", "confidence": 0.85 },
  "werkvorm": { "value": "ZZP", "confidence": 0.7 },
  "jaren_ervaring": { "value": 5, "confidence": 0.8 },
  "ervaring_sinds": { "value": 2019, "confidence": 0.75 },
  
  // === ERVARING DETAILS (arrays) ===
  "ervaring_sector": { "value": ["VVT", "GGZ"], "confidence": 0.85 },
  "doelgroep_ervaring": { "value": ["Ouderen", "Psychiatrie"], "confidence": 0.8 },
  "specifieke_doelgroepen": { "value": ["NAH"], "confidence": 0.7 },
  
  // === LEIDINGGEVENDE ERVARING ===
  "leidinggevende_ervaring": { "value": false, "confidence": 0.9 },
  "leidinggevende_functies": { "value": [], "confidence": 0.9 },
  
  // === OPLEIDINGEN & CERTIFICATEN ===
  "hoogste_opleiding": { "value": "MBO", "confidence": 0.85 },
  "opleidingen": { "value": [{ "naam": "string", "jaar": 2020, "instituut": "string" }], "confidence": 0.8 },
  "certificaten": { "value": ["BHV"], "confidence": 0.75 },
  "BIG_nummer": { "value": "12345678", "confidence": 0.95 },
  
  // === BESCHIKBAARHEID ===
  "beschikbaarheid": { "value": "32-40 uur/week", "confidence": 0.7 },
  "voorkeur_uren_per_week": { "value": { "min": 32, "max": 40 }, "confidence": 0.65 },
  "nachtdienst_bereid": { "value": true, "confidence": 0.6 },
  "weekenddienst_bereid": { "value": true, "confidence": 0.6 },
  "voorkeur_dagen": { "value": ["Ma", "Di", "Wo"], "confidence": 0.5 },
  
  // === MOBILITEIT ===
  "eigen_vervoer": { "value": true, "confidence": 0.85 },
  "rijbewijs": { "value": true, "confidence": 0.9 },
  "max_reisafstand_km": { "value": 30, "confidence": 0.6 },
  "regio": { "value": "Utrecht", "confidence": 0.8 },
  "regio_voorkeur": { "value": ["Utrecht", "Noord-Holland"], "confidence": 0.7 },
  
  // === OVERIG ===
  "talen": { "value": ["Nederlands", "Engels"], "confidence": 0.9 },
  "opmerkingen": { "value": "Extra info", "confidence": 0.5 },
  
  // === GLOBAL (backwards compatibility) ===
  "global_confidence": 0.82
}

**CONFIDENCE SCORING GUIDELINES:**
- 0.95-1.0: Exact gevonden (letterlijk in CV, bijv. naam bovenaan, email met @)
- 0.80-0.94: Duidelijk gevonden (helder vermeld maar niet prominent)
- 0.60-0.79: Geïnfereerd/afgeleid (niet expliciet, maar logisch afgeleid)
- 0.40-0.59: Onzeker (mogelijk maar niet bevestigd)
- 0.0-0.39: Niet gevonden of gok (gebruik null voor value)

**KRITIEK - functie_niveau.value moet EXACT een van deze waarden zijn (ZONDER haakjes!):**
- "VIG" (voor Verzorgende IG)
- "HBO-V" (voor HBO Verpleegkundige)
- "Verpleegkundige MBO" (NIET "Verpleegkundige (MBO)" - GEEN haakjes!)
- "Helpende"
- "Begeleider"
- "Persoonlijk begeleider"
- "GGZ-agoog"

**KRITIEK - werkvorm.value moet EXACT een van deze waarden zijn:**
- "ZZP" (zoek naar: "ZZP", "zzp", "zelfstandige", "freelance", "eigen bedrijf")
- "Uitzendkracht" (zoek naar: "uitzendkracht", "tijdelijk contract", "via uitzendbureau")
- "ABCito constructie" (zoek naar: "ABCito", "abcito", "payroll constructie")

**KRITIEK - jaren_ervaring berekening:**
- Tel de TOTALE jaren werkervaring in de zorg
- Zoek naar "sinds JAARTAL" en bereken jaren tot nu (2024)
- Confidence 0.9+ als exacte data gevonden, 0.6-0.8 als berekend

**KRITIEK - doelgroep_ervaring extractie:**
Zoek ACTIEF in werkervaring tekst naar doelgroepen:
- "dementie", "dementerende" → voeg "Dementie" toe
- "verstandelijke beperking", "VG" → voeg "LVB" toe
- "ouderen", "geriatrie" → voeg "Ouderen" toe
- Confidence per array: 0.9 als expliciet genoemd, 0.7 als afgeleid

**KRITIEK - opleidingen extractie:**
- Maak een array van ALLE opleidingen/diploma's
- Confidence 0.95 voor diploma's met jaartal, 0.7 zonder jaartal

**KRITIEK - mobiliteit extractie:**
- "rijbewijs" → rijbewijs.value: true, confidence: 0.95
- "auto" → eigen_vervoer.value: true, confidence: 0.85
- Geen vermelding → value: null, confidence: 0.3

**global_confidence berekening:**
Bereken als gewogen gemiddelde van alle velden met data, met nadruk op naam, functie_niveau, en ervaring_sector.

Belangrijk:
- Als info ontbreekt, gebruik null als value met lage confidence
- Arrays: lege array [] als geen data, met confidence 0.5
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
                text: "Je bent een HR assistent die CV's analyseert voor zorgverleners. Geef altijd pure JSON terug zonder markdown code blocks. Gebruik het NIEUWE format met per-veld confidence scores.\n\n" + aiPrompt
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:application/pdf;base64,${pdfBase64}`
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
      console.error("AI API error status:", aiResponse.status);
      console.error("AI API error headers:", Object.fromEntries(aiResponse.headers.entries()));
      console.error("AI API error body:", errorText);
      throw new Error(`AI API error: ${aiResponse.status} - ${errorText.substring(0, 200)}`);
    }

    console.log("AI API response status:", aiResponse.status);

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
      // Fallback with minimal data - NEW FORMAT
      extractedData = {
        naam: { value: null, confidence: 0 },
        telefoon: { value: null, confidence: 0 },
        email: { value: null, confidence: 0 },
        postcode: { value: null, confidence: 0 },
        woonplaats: { value: null, confidence: 0 },
        geboortedatum: { value: null, confidence: 0 },
        functie_niveau: { value: null, confidence: 0 },
        werkvorm: { value: null, confidence: 0 },
        jaren_ervaring: { value: null, confidence: 0 },
        ervaring_sinds: { value: null, confidence: 0 },
        ervaring_sector: { value: [], confidence: 0 },
        doelgroep_ervaring: { value: [], confidence: 0 },
        specifieke_doelgroepen: { value: [], confidence: 0 },
        leidinggevende_ervaring: { value: false, confidence: 0 },
        leidinggevende_functies: { value: [], confidence: 0 },
        hoogste_opleiding: { value: null, confidence: 0 },
        opleidingen: { value: [], confidence: 0 },
        certificaten: { value: [], confidence: 0 },
        BIG_nummer: { value: null, confidence: 0 },
        beschikbaarheid: { value: null, confidence: 0 },
        voorkeur_uren_per_week: { value: null, confidence: 0 },
        nachtdienst_bereid: { value: null, confidence: 0 },
        weekenddienst_bereid: { value: null, confidence: 0 },
        voorkeur_dagen: { value: null, confidence: 0 },
        eigen_vervoer: { value: null, confidence: 0 },
        rijbewijs: { value: null, confidence: 0 },
        max_reisafstand_km: { value: null, confidence: 0 },
        regio: { value: null, confidence: 0 },
        regio_voorkeur: { value: null, confidence: 0 },
        talen: { value: [], confidence: 0 },
        opmerkingen: { value: null, confidence: 0 },
        global_confidence: 0.3,
      };
    }

    // Helper to get value from new or old format
    const getValue = (field: any) => {
      if (field === null || field === undefined) return null;
      if (typeof field === 'object' && 'value' in field) return field.value;
      return field; // Old format fallback
    };

    const setValue = (field: any, newValue: any) => {
      if (typeof field === 'object' && 'value' in field) {
        return { ...field, value: newValue };
      }
      return { value: newValue, confidence: 0.8 }; // Convert old format to new
    };

    // Normalize functie_niveau variations - CRITICAL: Map to exact DB values without parentheses
    const functieNiveauValue = getValue(extractedData.functie_niveau);
    if (functieNiveauValue) {
      const functieNiveauMapping: Record<string, string> = {
        "verzorgende ig": "VIG",
        "verzorgende IG": "VIG",
        "verzorgende-ig": "VIG",
        "vig": "VIG",
        "hbo verpleegkundige": "HBO-V",
        "hbo-v": "HBO-V",
        "hbo v": "HBO-V",
        "hbov": "HBO-V",
        "verpleegkundige mbo": "Verpleegkundige MBO",
        "verpleegkundige (mbo)": "Verpleegkundige MBO",
        "mbo verpleegkundige": "Verpleegkundige MBO",
        "verpleegkundige": "Verpleegkundige MBO",
        "vp mbo": "Verpleegkundige MBO",
        "helpende": "Helpende",
        "helpende 2": "Helpende",
        "helpende niveau 2": "Helpende",
        "begeleider": "Begeleider",
        "agogisch medewerker": "Begeleider",
        "persoonlijk begeleider": "Persoonlijk begeleider",
        "pb": "Persoonlijk begeleider",
        "pb-er": "Persoonlijk begeleider",
        "ggz-agoog": "GGZ-agoog",
        "ggz agoog": "GGZ-agoog",
        "ggz medewerker": "GGZ-agoog",
      };

      const normalized = functieNiveauValue.toLowerCase().trim();
      if (functieNiveauMapping[normalized]) {
        console.log(`Mapped functie_niveau: "${functieNiveauValue}" → "${functieNiveauMapping[normalized]}"`);
        extractedData.functie_niveau = setValue(extractedData.functie_niveau, functieNiveauMapping[normalized]);
      }
    }

    // Normalize werkvorm
    const werkvormValue = getValue(extractedData.werkvorm);
    if (werkvormValue) {
      const werkvormMapping: Record<string, string> = {
        "zzp": "ZZP",
        "uitzendkracht": "Uitzendkracht",
        "uitzend": "Uitzendkracht",
        "abcito": "ABCito constructie",
        "abcito constructie": "ABCito constructie",
      };

      const normalized = werkvormValue.toLowerCase().trim();
      if (werkvormMapping[normalized]) {
        console.log(`Mapped werkvorm: "${werkvormValue}" → "${werkvormMapping[normalized]}"`);
        extractedData.werkvorm = setValue(extractedData.werkvorm, werkvormMapping[normalized]);
      }
    }

    // Ensure arrays are properly structured (handle both formats)
    const ensureArrayField = (field: any, defaultConfidence = 0.5) => {
      if (field === null || field === undefined) {
        return { value: [], confidence: defaultConfidence };
      }
      if (typeof field === 'object' && 'value' in field) {
        return { ...field, value: field.value || [] };
      }
      // Old format: plain array
      if (Array.isArray(field)) {
        return { value: field, confidence: 0.8 };
      }
      return { value: [], confidence: defaultConfidence };
    };

    extractedData.ervaring_sector = ensureArrayField(extractedData.ervaring_sector);
    extractedData.doelgroep_ervaring = ensureArrayField(extractedData.doelgroep_ervaring);
    extractedData.specifieke_doelgroepen = ensureArrayField(extractedData.specifieke_doelgroepen);
    extractedData.leidinggevende_functies = ensureArrayField(extractedData.leidinggevende_functies);
    extractedData.opleidingen = ensureArrayField(extractedData.opleidingen);
    extractedData.certificaten = ensureArrayField(extractedData.certificaten);
    extractedData.talen = ensureArrayField(extractedData.talen);

    // Handle nullable array fields
    const ensureNullableArrayField = (field: any) => {
      if (field === null || field === undefined) {
        return { value: null, confidence: 0.3 };
      }
      if (typeof field === 'object' && 'value' in field) {
        return field;
      }
      if (Array.isArray(field)) {
        return { value: field, confidence: 0.7 };
      }
      return { value: null, confidence: 0.3 };
    };

    extractedData.voorkeur_dagen = ensureNullableArrayField(extractedData.voorkeur_dagen);
    extractedData.regio_voorkeur = ensureNullableArrayField(extractedData.regio_voorkeur);

    // Calculate jaren_ervaring if not provided but ervaring_sinds is available
    const jarenValue = getValue(extractedData.jaren_ervaring);
    const sindsValue = getValue(extractedData.ervaring_sinds);
    if (!jarenValue && sindsValue) {
      const currentYear = new Date().getFullYear();
      const calculatedYears = currentYear - sindsValue;
      extractedData.jaren_ervaring = { 
        value: calculatedYears, 
        confidence: Math.min((extractedData.ervaring_sinds?.confidence || 0.7) - 0.1, 0.85) 
      };
      console.log(`Calculated jaren_ervaring: ${calculatedYears} (since ${sindsValue})`);
    }

    // Copy woonplaats to regio if regio is empty
    const regioValue = getValue(extractedData.regio);
    const woonplaatsValue = getValue(extractedData.woonplaats);
    if (!regioValue && woonplaatsValue) {
      extractedData.regio = { 
        value: woonplaatsValue, 
        confidence: Math.min((extractedData.woonplaats?.confidence || 0.7) - 0.1, 0.8) 
      };
      console.log(`Copied woonplaats to regio: ${woonplaatsValue}`);
    }

    // Calculate global_confidence if not present
    if (!extractedData.global_confidence) {
      const confidenceFields = [
        extractedData.naam?.confidence,
        extractedData.functie_niveau?.confidence,
        extractedData.ervaring_sector?.confidence,
        extractedData.email?.confidence,
        extractedData.telefoon?.confidence,
        extractedData.regio?.confidence,
      ].filter(c => c !== undefined && c !== null);
      
      extractedData.global_confidence = confidenceFields.length > 0
        ? confidenceFields.reduce((a, b) => a + b, 0) / confidenceFields.length
        : 0.5;
    }

    console.log("CV extraction complete with per-field confidence scores");
    console.log("Global confidence:", extractedData.global_confidence);

    return new Response(
      JSON.stringify({
        success: true,
        data: extractedData,
        cvText: `CV analyzed via AI Vision (${filename || 'document.pdf'})`,
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
