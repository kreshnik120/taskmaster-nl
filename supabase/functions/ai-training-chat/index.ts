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

    const { message } = await req.json();

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
            content: `Je bent een AI training assistent. Je helpt gebruikers bij het opbouwen van een kennisbank voor een bedrijfs-specifiek AI systeem.

Je taken:
1. Ontvang bedrijfsinformatie van gebruikers
2. Identificeer belangrijke kennis zoals:
   - Bedrijfsprocessen
   - Standaard procedures
   - Klantinformatie
   - Voorkeuren en regels
   - Workflow patronen
   
3. Extraheer deze informatie in gestructureerde kennis items
4. Geef suggesties voor aanvullende informatie die nuttig zou zijn

Wees interactief en stel gerichte vragen om de kennisbank te verrijken.`,
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
                    enum: ["bedrijfsregels", "processen", "klantinfo", "voorkeuren", "workflow"],
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

    if (choice?.message?.tool_calls) {
      for (const toolCall of choice.message.tool_calls) {
        if (toolCall.function.name === "save_training_knowledge") {
          const args = JSON.parse(toolCall.function.arguments);
          
          await supabase.from("ai_knowledge_base").insert({
            user_id: user.id,
            org_id: orgData.org_id,
            category: args.category,
            key: args.key,
            value: args.value,
            source: "training_chat",
            confidence_score: 1.0,
          });
        }
      }
    }

    const responseContent = choice?.message?.content || "Kennis opgeslagen.";

    return new Response(
      JSON.stringify({ response: responseContent }),
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
