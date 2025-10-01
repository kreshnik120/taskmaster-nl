import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
            content: `Je bent een geavanceerde AI training assistent voor CitoZorg. Je verwerkt bedrijfsinformatie in een kennisbank.

${isChunk ? `⚠️ DIT IS DEEL ${chunkIndex}/${totalChunks} VAN EEN GROOT DOCUMENT - VERWERK ALLES ZONDER UITZONDERINGEN!` : ''}

BELANGRIJKE INSTRUCTIES:
1. Extraheer ALLE relevante informatie - mis niets!
2. Verdeel informatie over deze categorieën:
   - bedrijfsgegevens: KvK, adressen, contacten, structuur, directie
   - tarieven: uurtarieven, marges, toeslagen, prijsafspraken per niveau/dagdeel
   - contracten: overeenkomsten, looptijden, fees, voorwaarden
   - processen: workflows, procedures, governance, planning, facturatie
   - compliance: wetgeving, verzekeringen, VOG, diploma's, registraties
   - zzp_vereisten: kwalificaties, documenten, gedragsregels voor zzp'ers

3. Voor ELKE categorie die je detecteert, gebruik save_training_knowledge
4. Splits complexe informatie in meerdere kennisitems met unieke keys
5. Wees extreem grondig - elke regel, elk tarief, elke eis moet opgeslagen worden

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
                    enum: ["bedrijfsgegevens", "tarieven", "contracten", "processen", "compliance", "zzp_vereisten", "klantinfo"],
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
            const { error: insertError } = await supabase.from("ai_knowledge_base").insert({
              user_id: user.id,
              org_id: orgData.org_id,
              category: args.category,
              key: args.key,
              value: args.value,
              source: isChunk ? "training_chat_batch" : "training_chat",
              confidence_score: 0.95, // Hoge score voor handmatige training
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
