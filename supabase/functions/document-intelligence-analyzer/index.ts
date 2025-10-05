import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    const DEFAULT_ORG_ID = "550e8400-e29b-41d4-a716-446655440000";
    const DEFAULT_USER_ID = "00000000-0000-0000-0000-000000000000";

    console.log("🔍 Document Intelligence Analyzer starting...");

    // Get all completed training documents
    const { data: documents, error: docsError } = await supabaseClient
      .from("training_documents")
      .select("*")
      .eq("processing_status", "completed")
      .order("created_at", { ascending: false })
      .limit(10); // Process 10 documents per run

    if (docsError) throw docsError;

    console.log(`📄 Found ${documents?.length || 0} documents to analyze`);

    if (!documents || documents.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No documents to analyze",
          processed: 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let totalInsights = 0;
    let totalRelationships = 0;

    // Process each document
    for (const doc of documents) {
      console.log(`\n📖 Analyzing document: ${doc.file_name}`);

      // Get existing knowledge items for this document
      const { data: existingKnowledge, error: knowledgeError } =
        await supabaseClient
          .from("ai_knowledge_base")
          .select("*")
          .eq("source", `document:${doc.file_name}`)
          .is("deleted_at", null);

      if (knowledgeError) {
        console.error(
          `Error fetching knowledge for ${doc.file_name}:`,
          knowledgeError
        );
        continue;
      }

      if (!existingKnowledge || existingKnowledge.length === 0) {
        console.log(`⚠️ No knowledge found for ${doc.file_name}, skipping`);
        continue;
      }

      console.log(
        `📚 Found ${existingKnowledge.length} knowledge items for this document`
      );

      // Build document context for AI analysis
      const documentContext = {
        file_name: doc.file_name,
        file_type: doc.file_type,
        knowledge_items: existingKnowledge.map((k) => ({
          category: k.category,
          key: k.key,
          value: k.value,
          confidence: k.confidence_score,
        })),
      };

      // Deep analysis prompt
      const analysisPrompt = `Je bent een expert business intelligence analist. Analyseer dit document grondig en extraheer diepere inzichten.

DOCUMENT CONTEXT:
${JSON.stringify(documentContext, null, 2)}

ANALYSEER EN EXTRAHEER:

1. **Implicit Knowledge** (tussen de regels):
   - Welke aannames worden gemaakt?
   - Welke business regels zijn afleidbaar maar niet expliciet genoemd?
   - Welke trends of patronen zie je?

2. **Cross-References**:
   - Welke concepten uit dit document linken naar andere onderwerpen?
   - Welke externe bronnen of standaarden worden gerefereerd?
   - Welke relaties bestaan tussen verschillende data punten?

3. **Business Rules**:
   - Welke beslisregels kun je afleiden?
   - Welke voorwaarden gelden voor bepaalde situaties?
   - Welke procedures zijn impliciet aanwezig?

4. **Missing Information**:
   - Welke cruciale informatie ontbreekt?
   - Welke vragen kunnen niet beantwoord worden met deze data?
   - Welke aanvullende informatie zou waardevol zijn?

Geef je antwoord in dit JSON formaat:
{
  "insights": [
    {
      "type": "implicit_knowledge" | "cross_reference" | "business_rule" | "missing_info",
      "key": "korte beschrijvende titel",
      "value": "gedetailleerde uitleg",
      "confidence": 0.0-1.0,
      "related_knowledge_keys": ["key1", "key2"]
    }
  ]
}`;

      try {
        // Call Gemini 2.5 Pro for deep analysis
        const aiResponse = await fetch(
          "https://ai.gateway.lovable.dev/v1/chat/completions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-pro",
              messages: [
                {
                  role: "system",
                  content:
                    "Je bent een expert business intelligence analist die diepgaande document analyse uitvoert.",
                },
                {
                  role: "user",
                  content: analysisPrompt,
                },
              ],
              temperature: 0.3,
            }),
          }
        );

        if (!aiResponse.ok) {
          const errorText = await aiResponse.text();
          console.error(
            `AI API error for ${doc.file_name}:`,
            aiResponse.status,
            errorText
          );
          continue;
        }

        const aiResult = await aiResponse.json();
        const content =
          aiResult.choices?.[0]?.message?.content || "{}";

        // Parse AI response
        let parsedInsights;
        try {
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            parsedInsights = JSON.parse(jsonMatch[0]);
          } else {
            parsedInsights = JSON.parse(content);
          }
        } catch (parseError) {
          console.error(`Failed to parse AI response for ${doc.file_name}`);
          continue;
        }

        if (!parsedInsights.insights || parsedInsights.insights.length === 0) {
          console.log(`No insights generated for ${doc.file_name}`);
          continue;
        }

        console.log(
          `💡 Generated ${parsedInsights.insights.length} insights for ${doc.file_name}`
        );

        // Store insights in ai_knowledge_base
        for (const insight of parsedInsights.insights) {
          // Insert insight
          const { data: insertedInsight, error: insertError } =
            await supabaseClient
              .from("ai_knowledge_base")
              .insert({
                org_id: DEFAULT_ORG_ID,
                user_id: DEFAULT_USER_ID,
                category: "document_insights",
                key: `${doc.file_name}: ${insight.key}`,
                value: {
                  insight_type: insight.type,
                  content: insight.value,
                  source_document: doc.file_name,
                },
                confidence_score: insight.confidence || 0.8,
                source: `document_intelligence:${doc.file_name}`,
              })
              .select()
              .single();

          if (insertError) {
            console.error("Error inserting insight:", insertError);
            continue;
          }

          totalInsights++;

          // Create relationships to related knowledge items
          if (insight.related_knowledge_keys && Array.isArray(insight.related_knowledge_keys)) {
            for (const relatedKey of insight.related_knowledge_keys) {
              // Find related knowledge item
              const relatedItem = existingKnowledge.find(
                (k) => k.key === relatedKey || k.key.includes(relatedKey)
              );

              if (relatedItem && insertedInsight) {
                const { error: relError } = await supabaseClient
                  .from("knowledge_relationships")
                  .insert({
                    source_knowledge_id: insertedInsight.id,
                    target_knowledge_id: relatedItem.id,
                    relationship_type: "derived_from",
                    confidence_score: 0.8,
                    detected_by: "document_intelligence_analyzer",
                    context: `Insight derived from document analysis of ${doc.file_name}`,
                  });

                if (!relError) {
                  totalRelationships++;
                }
              }
            }
          }
        }

        // Log the analysis
        await supabaseClient.from("function_call_logs").insert({
          org_id: DEFAULT_ORG_ID,
          user_id: DEFAULT_USER_ID,
          function_name: "document-intelligence-analyzer",
          success: true,
          input_tokens: aiResult.usage?.prompt_tokens || 0,
          output_tokens: aiResult.usage?.completion_tokens || 0,
          total_tokens: aiResult.usage?.total_tokens || 0,
          model_used: "google/gemini-2.5-pro",
          estimated_cost_eur:
            ((aiResult.usage?.total_tokens || 0) * 0.000002) || 0,
        });

        // Small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`Error analyzing document ${doc.file_name}:`, error);
        continue;
      }
    }

    console.log(
      `\n✅ Analysis complete: ${totalInsights} insights, ${totalRelationships} relationships`
    );

    return new Response(
      JSON.stringify({
        success: true,
        documents_analyzed: documents.length,
        insights_generated: totalInsights,
        relationships_created: totalRelationships,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in document-intelligence-analyzer:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
