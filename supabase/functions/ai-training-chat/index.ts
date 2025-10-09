import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { getFullInstructions, detectRoleFromCategory } from "../_shared/abczorg-instructions.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Helper: Detect role tags from category
function detectRoleTags(category: string): string[] {
  const mapping: Record<string, string[]> = {
    'bedrijfsgegevens': ['Compliance', 'HR'],
    'tarieven': ['Facturatie', 'Sales'],
    'contracten': ['Facturatie', 'Compliance'],
    'processen': ['Planning', 'HR'],
    'compliance': ['Compliance', 'HR'],
    'zzp_vereisten': ['HR', 'Compliance'],
    'klantinfo': ['Sales'],
    // HR-specifieke categorieën
    'hr_verlof': ['HR'],
    'hr_arbeidsvoorwaarden': ['HR', 'Facturatie'],
    'hr_onboarding': ['HR', 'Planning'],
    'hr_evaluatie': ['HR']
  };
  return mapping[category] || ['Compliance'];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error("Niet geautoriseerd");
    }

    const { message, isChunk, chunkIndex, totalChunks } = await req.json();

    const { data: orgData } = await supabase
      .from("user_organizations")
      .select("org_id")
      .eq("user_id", user.id)
      .single();

    if (!orgData) {
      throw new Error("Geen organisatie gevonden");
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY niet geconfigureerd");
    }

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `${getFullInstructions(`
⚠️ SPECIFIEKE INSTRUCTIES VOOR TRAINING CHAT:
Je rol is nu om als kennisextractie-expert te fungeren. Je analyseert documenten en gesprekken om belangrijke bedrijfsinformatie te identificeren en op te slaan in de kennisbank van ABCzorg & CitoZorg.`)}

${isChunk ? `⚠️ DIT IS DEEL ${chunkIndex}/${totalChunks} VAN EEN GROOT DOCUMENT - VERWERK ALLES ZONDER UITZONDERINGEN!` : ''}

BELANGRIJKE EXTRACTIE INSTRUCTIES:
1. Extraheer ALLE relevante informatie - mis niets!
2. Verdeel informatie over deze categorieën:
   - bedrijfsgegevens: KvK, adressen, contacten, structuur, directie
   - tarieven: uurtarieven, marges, toeslagen, prijsafspraken per niveau/dagdeel
   - contracten: overeenkomsten, looptijden, fees, voorwaarden
   - processen: workflows, procedures, governance, planning, facturatie
   - compliance: wetgeving, verzekeringen, VOG, diploma's, registraties
   - zzp_vereisten: kwalificaties, documenten, gedragsregels voor zzp'ers
   - klantinfo: klantgegevens, voorkeuren, historie
   
   HR CATEGORIEËN (vertrouwelijk, volg HR-gedrag uit hoofdinstructies):
   - hr_verlof: vakantiedagen, verlofregeling, verzuimbeleid
   - hr_arbeidsvoorwaarden: salarissen, cao, secundaire voorwaarden
   - hr_onboarding: inwerkprocedures, training, instructies
   - hr_evaluatie: beoordelingen, functioneringsgesprekken, KPI's

3. Voor ELKE categorie die je detecteert, gebruik save_training_knowledge
4. Splits complexe informatie in meerdere kennisitems met unieke keys
5. Wees extreem grondig - elke regel, elk tarief, elke eis moet opgeslagen worden
6. Voor HR-categorieën: stel automatisch confidentiality op 'vertrouwelijk' en acl op ['admin', 'manager']

${isChunk ? 'LET OP: Dit is een deel van een groter document. Verwerk alles in dit deel volledig!' : ''}`,
          },
          { role: "user", content: message },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "save_training_knowledge",
              description: "Sla belangrijke bedrijfsinformatie op in de kennisbank",
              parameters: {
                type: "object",
                properties: {
                  category: {
                    type: "string",
                    enum: ["bedrijfsgegevens", "tarieven", "contracten", "processen", "compliance", "zzp_vereisten", "klantinfo", "hr_verlof", "hr_arbeidsvoorwaarden", "hr_onboarding", "hr_evaluatie"],
                  },
                  key: { type: "string" },
                  value: { type: "object" },
                },
                required: ["category", "key", "value"],
              },
            },
          },
        ],
        tool_choice: "auto",
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI API error:", errorText);
      throw new Error("AI API fout");
    }

    const aiData = await aiResponse.json();
    const choice = aiData.choices?.[0];

    let savedCount = 0;
    const categoryCounts: Record<string, number> = {};

    if (choice?.message?.tool_calls) {
      for (const toolCall of choice.message.tool_calls) {
        if (toolCall.function.name === "save_training_knowledge") {
          const args = JSON.parse(toolCall.function.arguments);
          
          // Check of deze kennis al bestaat
          const { data: existing } = await supabase
            .from("ai_knowledge_base")
            .select("id")
            .eq("org_id", orgData.org_id)
            .eq("category", args.category)
            .eq("key", args.key)
            .maybeSingle();

          if (!existing) {
            // Apply PII redaction to value before storing
            const originalValue = JSON.stringify(args.value);
            const { data: redactedData } = await supabase.rpc('redact_pii', { input_text: originalValue });
            const redactedValue = redactedData ? JSON.parse(redactedData) : args.value;
            
            // Detect role_tags from category
            const roleTags = detectRoleTags(args.category);
            
            // Determine confidentiality and ACL based on category
            const isHrCategory = args.category.startsWith('hr_');
            const confidentiality = isHrCategory 
              ? 'vertrouwelijk'  // HR data is altijd vertrouwelijk
              : (args.category.includes('contract') || args.category.includes('tarief') ? 'vertrouwelijk' : 'intern');
            
            const acl = isHrCategory
              ? ['admin', 'manager']  // HR data alleen voor admins/managers
              : [];  // Andere data toegankelijk voor iedereen in org
            
            const { error: insertError } = await supabase.from("ai_knowledge_base").insert({
              user_id: user.id,
              org_id: orgData.org_id,
              category: args.category,
              key: args.key,
              value: args.value, // Store original (will be redacted in embeddings)
              redacted_text: redactedData || null,
              original_text: originalValue,
              source: isChunk ? "training_chat_batch" : "training_chat",
              confidence_score: 0.95,
              // Week 1-2: New metadata fields
              role_tags: roleTags,
              confidentiality: confidentiality,
              valid_from: new Date().toISOString().split('T')[0],
              jurisdiction: 'NL',
              acl: acl
            });

            if (!insertError) {
              savedCount++;
              categoryCounts[args.category] = (categoryCounts[args.category] || 0) + 1;
              console.log(`✅ Saved: ${args.category}/${args.key}`);
            } else {
              console.error("❌ Insert error:", insertError);
            }
          } else {
            console.log(`⏭️ Skipped duplicate: ${args.category}/${args.key}`);
          }
        }
      }
    }

    const categoryList = Object.entries(categoryCounts)
      .map(([cat, count]) => `${cat}: ${count} items`)
      .join(", ");

    const responseContent = isChunk 
      ? `✅ Deel ${chunkIndex}/${totalChunks} verwerkt\n📊 ${savedCount} items opgeslagen\n📋 ${categoryList || "Geen nieuwe items"}`
      : choice?.message?.content || `✅ ${savedCount} kennisitem(s) succesvol opgeslagen!\n\n📋 Categorieën:\n${categoryList}`;

    console.log(`📊 Total saved: ${savedCount}, Categories:`, categoryCounts);

    return new Response(
      JSON.stringify({ 
        response: responseContent,
        savedCount,
        categories: categoryCounts,
        isChunk,
        chunkIndex
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Training chat error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
