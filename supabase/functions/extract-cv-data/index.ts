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
    
    const aiPrompt = `Analyseer dit CV/PDF document en extract ALLE relevante informatie voor healthcare recruitment in JSON formaat.

Geef terug in dit EXACTE JSON formaat (geen extra tekst):
{
  // === BASIS CONTACTGEGEVENS ===
  "naam": "Voor- en achternaam",
  "telefoon": "06-12345678 of null",
  "email": "email@example.com of null",
  "postcode": "1234 AB of null",
  "woonplaats": "Plaatsnaam of null",
  "geboortedatum": "YYYY-MM-DD of null",
  
  // === PROFESSIONELE INFO ===
  "functie_niveau": "VIG, HBO-V, Verpleegkundige MBO, Helpende, Begeleider, Persoonlijk begeleider, of GGZ-agoog",
  "werkvorm": "ZZP, Uitzendkracht, of ABCito constructie",
  "jaren_ervaring": getal of null,
  "ervaring_sinds": jaartal of null,
  
  // === ERVARING DETAILS ===
  "ervaring_sector": ["VVT", "GGZ", "GHZ", "Jeugdzorg", "Ziekenhuis/Klinisch", "Thuiszorg"],
  "doelgroep_ervaring": ["Ouderen", "LVB", "Psychiatrie", "Somatiek", "Kinderen/Jeugd", "Verslaving", "Dementie", "Gedragsproblemen"],
  "specifieke_doelgroepen": ["TBS cliënten", "Justitiële kaders", "NAH", etc.],
  
  // === LEIDINGGEVENDE ERVARING ===
  "leidinggevende_ervaring": true/false,
  "leidinggevende_functies": ["Teammanager", "Coördinator", etc.],
  
  // === OPLEIDINGEN & CERTIFICATEN ===
  "hoogste_opleiding": "HBO/MBO/etc.",
  "opleidingen": [
    { "naam": "string", "jaar": number, "instituut": "string of null" }
  ],
  "certificaten": ["BHV", "Voorbehouden handelingen", etc.],
  "BIG_nummer": "string of null",
  
  // === BESCHIKBAARHEID ===
  "beschikbaarheid": "<24 uur/week, 24-32 uur/week, 32-40 uur/week, of Flexibel",
  "voorkeur_uren_per_week": { "min": number, "max": number } of null,
  "nachtdienst_bereid": true/false/null,
  "weekenddienst_bereid": true/false/null,
  "voorkeur_dagen": ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"] of null,
  
  // === MOBILITEIT ===
  "eigen_vervoer": true/false/null,
  "rijbewijs": true/false/null,
  "max_reisafstand_km": number of null,
  "regio": "Utrecht, Amsterdam, etc of null",
  "regio_voorkeur": ["Limburg", "Noord-Brabant", etc.] of null,
  
  // === OVERIG ===
  "talen": ["Nederlands", "Engels", etc.],
  "opmerkingen": "Extra informatie of null",
  "confidence": 0.8
}

**KRITIEK - functie_niveau moet EXACT een van deze waarden zijn (ZONDER haakjes!):**
- "VIG" (voor Verzorgende IG)
- "HBO-V" (voor HBO Verpleegkundige)
- "Verpleegkundige MBO" (NIET "Verpleegkundige (MBO)" - GEEN haakjes!)
- "Helpende"
- "Begeleider"
- "Persoonlijk begeleider"
- "GGZ-agoog"

**KRITIEK - werkvorm moet EXACT een van deze waarden zijn:**
- "ZZP" (zoek naar: "ZZP", "zzp", "zelfstandige", "freelance", "eigen bedrijf", "zelfstandig ondernemer")
- "Uitzendkracht" (zoek naar: "uitzendkracht", "tijdelijk contract", "via uitzendbureau", "flex")
- "ABCito constructie" (zoek naar: "ABCito", "abcito", "payroll constructie")

**KRITIEK - jaren_ervaring berekening:**
- Tel de TOTALE jaren werkervaring in de zorg
- Zoek naar "sinds JAARTAL" en bereken jaren tot nu (2024)
- Zoek naar datums bij werkervaring en tel de jaren op
- Voorbeeld: "ZZP sinds 2017" = 7 jaar ervaring

**KRITIEK - doelgroep_ervaring extractie:**
Zoek ACTIEF in werkervaring tekst naar doelgroepen:
- "dementie", "dementerende" → voeg "Dementie" toe
- "verstandelijke beperking", "VG" → voeg "LVB" toe
- "TBS", "justitieel", "forensisch" → voeg "Justitiële kaders" toe aan specifieke_doelgroepen
- "NAH", "niet-aangeboren hersenletsel" → voeg "NAH" toe aan specifieke_doelgroepen
- "gedragsproblemen", "gedragsdeskundige" → voeg "Gedragsproblemen" toe
- "ouderen", "bejaarden", "geriatrie" → voeg "Ouderen" toe
- "kinderen", "jeugd", "jongeren" → voeg "Kinderen/Jeugd" toe
- "verslavingszorg", "verslaving" → voeg "Verslaving" toe
- "somatiek", "lichamelijke" → voeg "Somatiek" toe
- "psychiatrie", "ggz", "psychische" → voeg "Psychiatrie" toe

**KRITIEK - leidinggevende_ervaring detectie:**
Zoek naar: "manager", "teamleider", "coördinator", "leidinggevende", "afdelingshoofd", "hoofd", "senior"

**KRITIEK - opleidingen extractie:**
- Maak een array van ALLE opleidingen/diploma's
- Extract naam, jaar van afronden, en instituut indien beschikbaar
- Bepaal hoogste_opleiding (HBO/MBO/WO)

**KRITIEK - mobiliteit extractie:**
- "rijbewijs" → rijbewijs: true
- "auto", "eigen vervoer", "beschikt over auto" → eigen_vervoer: true
- "reisbereid tot X km" → max_reisafstand_km: X
- Detecteer woonplaats en voorkeur regio's

**EXTRA ZOEKTERMEN:**
- beschikbaarheid: "uur per week", "uren", "parttime", "fulltime", "voltijd"
- nachtdienst: "nachtdienst", "nachtzorg", "slaapdienst"
- weekenddienst: "weekend", "zaterdag", "zondag"
- BIG: "BIG-registratie", "BIG nummer", "geregistreerd"

Belangrijk:
- Als info ontbreekt, gebruik null (niet "null" als string)
- Arrays moeten leeg zijn [] als geen data, niet null
- Wees proactief: zoek actief naar synoniemen en indirecte vermeldingen
- Confidence: geef 0.9+ als veel data gevonden, 0.6-0.8 als beperkt`;

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
                text: "Je bent een HR assistent die CV's analyseert voor zorgverleners. Geef altijd pure JSON terug zonder markdown code blocks. Wees grondig en zoek naar ALLE informatie die relevant is voor matching.\n\n" + aiPrompt
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
      // Fallback with minimal data
      extractedData = {
        naam: null,
        telefoon: null,
        email: null,
        postcode: null,
        woonplaats: null,
        geboortedatum: null,
        functie_niveau: null,
        werkvorm: null,
        jaren_ervaring: null,
        ervaring_sinds: null,
        ervaring_sector: [],
        doelgroep_ervaring: [],
        specifieke_doelgroepen: [],
        leidinggevende_ervaring: false,
        leidinggevende_functies: [],
        hoogste_opleiding: null,
        opleidingen: [],
        certificaten: [],
        BIG_nummer: null,
        beschikbaarheid: null,
        voorkeur_uren_per_week: null,
        nachtdienst_bereid: null,
        weekenddienst_bereid: null,
        voorkeur_dagen: null,
        eigen_vervoer: null,
        rijbewijs: null,
        max_reisafstand_km: null,
        regio: null,
        regio_voorkeur: null,
        talen: [],
        opmerkingen: null,
        confidence: 0.3,
      };
    }

    // Normalize functie_niveau variations - CRITICAL: Map to exact DB values without parentheses
    if (extractedData.functie_niveau) {
      const functieNiveauMapping: Record<string, string> = {
        "verzorgende ig": "VIG",
        "verzorgende IG": "VIG",
        "verzorgende-ig": "VIG",
        "vig": "VIG",
        "hbo verpleegkundige": "HBO-V",
        "hbo-v": "HBO-V",
        "hbo v": "HBO-V",
        "hbov": "HBO-V",
        // CRITICAL FIX: All variations map to "Verpleegkundige MBO" WITHOUT parentheses
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

    // Ensure arrays are always arrays
    extractedData.ervaring_sector = extractedData.ervaring_sector || [];
    extractedData.doelgroep_ervaring = extractedData.doelgroep_ervaring || [];
    extractedData.specifieke_doelgroepen = extractedData.specifieke_doelgroepen || [];
    extractedData.leidinggevende_functies = extractedData.leidinggevende_functies || [];
    extractedData.opleidingen = extractedData.opleidingen || [];
    extractedData.certificaten = extractedData.certificaten || [];
    extractedData.talen = extractedData.talen || [];
    extractedData.voorkeur_dagen = extractedData.voorkeur_dagen || null;
    extractedData.regio_voorkeur = extractedData.regio_voorkeur || null;

    // Calculate jaren_ervaring if not provided but ervaring_sinds is available
    if (!extractedData.jaren_ervaring && extractedData.ervaring_sinds) {
      const currentYear = new Date().getFullYear();
      extractedData.jaren_ervaring = currentYear - extractedData.ervaring_sinds;
      console.log(`Calculated jaren_ervaring: ${extractedData.jaren_ervaring} (since ${extractedData.ervaring_sinds})`);
    }

    // Copy woonplaats to regio if regio is empty
    if (!extractedData.regio && extractedData.woonplaats) {
      extractedData.regio = extractedData.woonplaats;
      console.log(`Copied woonplaats to regio: ${extractedData.woonplaats}`);
    }

    console.log("CV extraction complete with extended data");

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
