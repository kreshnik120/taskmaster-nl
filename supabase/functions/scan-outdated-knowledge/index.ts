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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    if (!lovableApiKey) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log("🔍 Scanning for outdated knowledge items...");

    // Fetch unverified knowledge items that are auto-learned
    const { data: items, error: fetchError } = await supabase
      .from("ai_knowledge_base")
      .select("id, category, key, value, confidence_score, created_at")
      .ilike("source_reference", "%continuous-learner%")
      .eq("requires_verification", true)
      .is("deleted_at", null)
      .limit(50);

    if (fetchError) {
      console.error("❌ Error fetching items:", fetchError);
      throw fetchError;
    }

    if (!items || items.length === 0) {
      console.log("✅ No unverified items to scan");
      return new Response(
        JSON.stringify({ message: "No items to scan", outdated: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`📊 Analyzing ${items.length} items with AI...`);

    // Prepare system context for AI
    const systemContext = `
Je bent een expert in het detecteren van verouderde of onjuiste kennis items in een AI kennisbank.

BELANGRIJKE CONTEXT OVER HET SYSTEEM:
- Het systeem heeft nu een 'query_tasks' database tool die direct toegang geeft tot taken
- De AI kan nu DIRECT query's uitvoeren op de tasks database
- Claims over "geen integratie" of "geen toegang tot data" zijn VEROUDERD
- Alle claims over "moet vragen aan gebruiker voor data" zijn ONJUIST

Je taak is om elk kennis item te analyseren en te bepalen of het:
1. VEROUDERD is (bevat onjuiste claims over systeem capabilities)
2. ONJUIST is (bevat feitelijk onjuiste informatie)
3. ACTUEEL is (nog steeds correct en relevant)

Geef een JSON array terug met items die verouderd/onjuist zijn:
[
  {
    "id": "item-id",
    "is_outdated": true,
    "reason": "Specifieke reden waarom dit item verouderd is",
    "confidence": 0.9
  }
]

Als alle items actueel zijn, return een lege array: []
`;

    const itemsText = items
      .map(
        (item) =>
          `ID: ${item.id}\nCategory: ${item.category}\nKey: ${item.key}\nValue: ${JSON.stringify(item.value)}\n---`
      )
      .join("\n");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemContext },
          {
            role: "user",
            content: `Analyseer deze knowledge items en detecteer welke verouderd of onjuist zijn:\n\n${itemsText}`,
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ AI API error:", response.status, errorText);
      throw new Error(`AI API error: ${response.status}`);
    }

    const aiData = await response.json();
    const aiContent = aiData.choices[0].message.content;

    console.log("🤖 AI Response:", aiContent);

    let outdatedItems: any[] = [];
    try {
      const parsed = JSON.parse(aiContent);
      // Handle both direct array and object with array property
      if (Array.isArray(parsed)) {
        outdatedItems = parsed.filter((item: any) => item.is_outdated);
      } else if (parsed.outdated && Array.isArray(parsed.outdated)) {
        outdatedItems = parsed.outdated;
      } else if (parsed.items && Array.isArray(parsed.items)) {
        outdatedItems = parsed.items.filter((item: any) => item.is_outdated);
      }
    } catch (parseError) {
      console.error("❌ Failed to parse AI response:", parseError);
    }

    // Enrich with original item data
    const enrichedOutdated = outdatedItems.map((outdated: any) => {
      const original = items.find((i) => i.id === outdated.id);
      return {
        id: outdated.id,
        key: original?.key || "Unknown",
        category: original?.category || "Unknown",
        reason: outdated.reason || "Verouderd of onjuist",
        confidence: outdated.confidence || 0.8,
      };
    });

    console.log(`✅ Scan complete: ${enrichedOutdated.length} outdated items found`);

    return new Response(
      JSON.stringify({
        scanned: items.length,
        outdated: enrichedOutdated,
        timestamp: new Date().toISOString(),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("❌ Error in scan-outdated-knowledge:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
